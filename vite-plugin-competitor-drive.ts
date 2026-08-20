import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import formidable from 'formidable';
import fs from 'node:fs';
import {
  formatDriveUploadError,
  getCompetitorCacheDir,
  getCompetitorDriveStatus,
  getCompetitorFolderPath,
  getCompetitorSyncMeta,
  isCompetitorSector,
  listCachedCompetitorFiles,
  listCompetitorDriveFiles,
  syncCompetitorDriveCache,
  uploadCompetitorDriveFile,
} from './server/competitorDrive';
import { getNexusDriveConfig } from './server/nexusGoogleDrive';
import {
  loadCompetitorAnalysisData,
} from './server/competitorStructuredData';
import { buildDedupedSummaryAnalysis } from './server/competitorSummaryDedup';
import {
  buildCompetitorMultiYearSummary,
  buildCompetitorTrendSummary,
  parsePeriodYears,
  rebuildMasterCompetitorData,
  resolveCompanyKeysFromNames,
} from './server/competitorMultiYearAnalytics';

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw) as T;
}

function parseYear(value: string | null): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

function parseSector(value: string | null) {
  if (!value || !isCompetitorSector(value)) return null;
  return value;
}

function attachRoutes(server: { middlewares: { use: Function } }, root: string): void {
  server.middlewares.use('/api/competitor/status', (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    sendJson(res, 200, getCompetitorDriveStatus(root));
  });

  server.middlewares.use('/api/competitor/files', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const year = parseYear(url.searchParams.get('year'));
      const sector = parseSector(url.searchParams.get('sector'));
      if (!year || !sector) {
        sendJson(res, 400, { error: 'year와 sector(전시사업|인테리어)가 필요합니다.' });
        return;
      }

      const status = getCompetitorDriveStatus(root);
      if (!status.configured) {
        sendJson(res, 200, { configured: false, files: [], year, sector });
        return;
      }

      const files = await listCompetitorDriveFiles(root, year, sector);
      sendJson(res, 200, { configured: true, files, year, sector });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/sync', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    try {
      const body = await readJsonBody<{ year?: number; sector?: string; force?: boolean }>(req);
      const year = typeof body.year === 'number' ? body.year : null;
      const sector = body.sector && isCompetitorSector(body.sector) ? body.sector : null;
      if (!year || !sector) {
        sendJson(res, 400, { error: 'year와 sector(전시사업|인테리어)가 필요합니다.' });
        return;
      }

      const meta = await syncCompetitorDriveCache(root, year, sector, { force: body.force ?? true });
      sendJson(res, 200, { ok: true, meta, year, sector });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/upload', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const form = formidable({ multiples: false, maxFileSize: 120 * 1024 * 1024 });
    form.parse(req, async (err, fields, files) => {
      if (err) {
        sendJson(res, 400, { error: err.message });
        return;
      }

      const uploaded = files.file;
      const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
      if (!file) {
        sendJson(res, 400, { error: '업로드할 파일이 없습니다.' });
        return;
      }

      const yearField = fields.year;
      const sectorField = fields.sector;
      const yearRaw = Array.isArray(yearField) ? yearField[0] : yearField;
      const sectorRaw = Array.isArray(sectorField) ? sectorField[0] : sectorField;
      const year = parseYear(String(yearRaw ?? ''));
      const sector = parseSector(String(sectorRaw ?? ''));

      if (!year || !sector) {
        sendJson(res, 400, { error: 'year와 sector(전시사업|인테리어)가 필요합니다.' });
        return;
      }

      try {
        const driveStatus = getCompetitorDriveStatus(root);
        if (!driveStatus.configured) {
          sendJson(res, 503, {
            error:
              'Google Drive NEXUS 연동이 설정되지 않았습니다. GOOGLE_DRIVE_NEXUS_FOLDER_ID와 서비스 계정 키를 확인하세요.',
          });
          return;
        }
        if (!driveStatus.uploadConfigured) {
          sendJson(res, 503, {
            error:
              'Google Drive OAuth 업로드가 설정되지 않았습니다. GOOGLE_OAUTH_* 설정 후 npm run google-drive-oauth를 실행하세요.',
          });
          return;
        }

        const buffer = fs.readFileSync(file.filepath);
        const fileName = file.originalFilename ?? 'upload.bin';
        const created = await uploadCompetitorDriveFile(
          root,
          year,
          sector,
          fileName,
          buffer,
          file.mimetype ?? 'application/octet-stream',
        );
        sendJson(res, 200, { ok: true, file: created, year, sector });
      } catch (error) {
        sendJson(res, 500, { error: formatDriveUploadError(error) });
      } finally {
        fs.unlink(file.filepath, () => undefined);
      }
    });
  });

  server.middlewares.use('/api/competitor/analysis', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const year = parseYear(url.searchParams.get('year'));
      const sector = parseSector(url.searchParams.get('sector'));
      const force = url.searchParams.get('force') === '1';
      if (!year || !sector) {
        sendJson(res, 400, { error: 'year와 sector(전시사업|인테리어)가 필요합니다.' });
        return;
      }

      const driveStatus = getCompetitorDriveStatus(root);
      const config = getNexusDriveConfig(root);
      const folderPath = getCompetitorFolderPath(year, sector);

      if (!driveStatus.configured) {
        sendJson(res, 200, {
          year,
          sector,
          configured: false,
          driveConnected: false,
          uploadConfigured: driveStatus.uploadConfigured,
          folderPath,
          fileCount: 0,
          documents: [],
          companies: [],
        });
        return;
      }

      let syncedAt: string | undefined;
      let cachedFiles = listCachedCompetitorFiles(root, year, sector);

      if (force || cachedFiles.length === 0) {
        try {
          const meta = await syncCompetitorDriveCache(root, year, sector, { force: true });
          syncedAt = meta.syncedAt;
          cachedFiles = listCachedCompetitorFiles(root, year, sector);
        } catch {
          syncedAt = getCompetitorSyncMeta(root, year, sector)?.syncedAt;
        }
      } else {
        syncedAt = getCompetitorSyncMeta(root, year, sector)?.syncedAt;
      }

      const cacheDir = getCompetitorCacheDir(config, year, sector);
      if (cachedFiles.length === 0 || !fs.existsSync(cacheDir)) {
        sendJson(res, 200, {
          year,
          sector,
          configured: true,
          driveConnected: true,
          uploadConfigured: driveStatus.uploadConfigured,
          folderPath,
          syncedAt,
          fileCount: 0,
          documents: [],
          companies: [],
        });
        return;
      }

      const syncMeta = getCompetitorSyncMeta(root, year, sector);
      const structured = await loadCompetitorAnalysisData(root, year, sector, cacheDir, {
        rebuild: force,
        uploadToDrive: driveStatus.uploadConfigured,
        folderId: syncMeta?.folderId,
      });

      if (!structured) {
        sendJson(res, 200, {
          year,
          sector,
          configured: true,
          driveConnected: true,
          uploadConfigured: driveStatus.uploadConfigured,
          folderPath,
          syncedAt,
          fileCount: 0,
          documents: [],
          companies: [],
        });
        return;
      }

      if (force && structured) {
        try {
          const { rebuildMasterCompetitorData } = await import('./server/competitorMasterData');
          await rebuildMasterCompetitorData(root, { force: true, sectors: [sector] });
        } catch (masterError) {
          console.warn('[competitor] master rebuild after analysis force failed:', masterError);
        }
      }

      const analysis = buildDedupedSummaryAnalysis(structured, {
        configured: true,
        driveConnected: true,
        uploadConfigured: driveStatus.uploadConfigured,
        folderPath,
        syncedAt,
        dataSource: 'structured-json',
      });
      sendJson(res, 200, analysis);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/trends', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const sector = parseSector(url.searchParams.get('sector'));
      const fromYear = parseYear(url.searchParams.get('fromYear'));
      const toYear = parseYear(url.searchParams.get('toYear'));
      const companyKeysParam = url.searchParams.get('companyKeys');
      const companyNamesParam = url.searchParams.get('companyNames');

      if (!sector || !fromYear || !toYear) {
        sendJson(res, 400, {
          error: 'sector, fromYear, toYear가 필요합니다. (예: sector=인테리어&fromYear=2019&toYear=2023)',
        });
        return;
      }

      if (fromYear > toYear) {
        sendJson(res, 400, { error: 'fromYear는 toYear보다 클 수 없습니다.' });
        return;
      }

      const companyKeys = companyKeysParam
        ? companyKeysParam.split(',').map((value) => value.trim()).filter(Boolean)
        : companyNamesParam
          ? resolveCompanyKeysFromNames(
              companyNamesParam.split(',').map((value) => value.trim()).filter(Boolean),
            )
          : undefined;

      const summary = buildCompetitorTrendSummary(root, sector, {
        fromYear,
        toYear,
        companyKeys,
      });
      sendJson(res, 200, summary);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const handleMultiYear = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const sector = parseSector(url.searchParams.get('sector'));
      const baseYear = parseYear(url.searchParams.get('baseYear'));
      const periodYears =
        parsePeriodYears(url.searchParams.get('periodYears')) ??
        parsePeriodYears(url.searchParams.get('period'));
      const rebuild = url.searchParams.get('rebuild') === '1';

      if (!sector || !baseYear || !periodYears) {
        sendJson(res, 400, {
          error:
            'sector, baseYear, periodYears(또는 period)가 필요합니다. (예: sector=인테리어&baseYear=2025&periodYears=5)',
        });
        return;
      }

      const summary = await buildCompetitorMultiYearSummary(root, sector, {
        baseYear,
        periodYears,
        rebuild,
      });
      sendJson(res, 200, summary);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };

  server.middlewares.use('/api/competitor/multi-year', handleMultiYear);
  server.middlewares.use('/api/competitors/multi-year', handleMultiYear);

  server.middlewares.use('/api/competitor/period-analysis', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const sector = parseSector(url.searchParams.get('sector'));
      const fromYear = parseYear(url.searchParams.get('fromYear'));
      const toYear = parseYear(url.searchParams.get('toYear'));
      const force = url.searchParams.get('force') === '1';

      if (!sector || !fromYear || !toYear) {
        sendJson(res, 400, {
          error: 'sector, fromYear, toYear가 필요합니다. (예: sector=인테리어&fromYear=2021&toYear=2025)',
        });
        return;
      }

      const driveStatus = getCompetitorDriveStatus(root);
      const { runCompetitorPeriodAnalysis } = await import('./server/competitorAnalysisPeriod');
      const result = await runCompetitorPeriodAnalysis(root, sector, fromYear, toYear, {
        force,
        uploadConfigured: driveStatus.uploadConfigured,
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/productivity-employees', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const sector = parseSector(url.searchParams.get('sector'));
      const fromYear = parseYear(url.searchParams.get('fromYear'));
      const toYear = parseYear(url.searchParams.get('toYear'));
      const force = url.searchParams.get('force') === '1';

      if (!sector || !fromYear || !toYear) {
        sendJson(res, 400, {
          error: 'sector, fromYear, toYear가 필요합니다.',
        });
        return;
      }

      const driveStatus = getCompetitorDriveStatus(root);
      if (!driveStatus.configured) {
        sendJson(res, 200, {
          sector,
          fromYear,
          toYear,
          productivityEmployeesByYear: {},
        });
        return;
      }

      const { buildProductivityEmployeesByYear } = await import('./server/competitorProductivityEmployees');
      const productivityEmployeesByYear = await buildProductivityEmployeesByYear(
        root,
        sector,
        fromYear,
        toYear,
        { force },
      );

      sendJson(res, 200, {
        sector,
        fromYear,
        toYear,
        productivityEmployeesByYear,
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/industry-analysis', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const sector = parseSector(url.searchParams.get('sector'));
      const fromYear = parseYear(url.searchParams.get('fromYear'));
      const toYear = parseYear(url.searchParams.get('toYear'));
      const force = url.searchParams.get('force') === '1';

      if (!sector || !fromYear || !toYear) {
        sendJson(res, 400, {
          error: 'sector, fromYear, toYear가 필요합니다.',
        });
        return;
      }

      const driveStatus = getCompetitorDriveStatus(root);
      if (!driveStatus.configured) {
        sendJson(res, 200, {
          sector,
          fromYear,
          toYear,
          industryAnalysisByYear: {},
        });
        return;
      }

      const { buildIndustryAnalysisByYear } = await import('./server/competitorIndustryAnalysis');
      const industryAnalysisByYear = await buildIndustryAnalysisByYear(
        root,
        sector,
        fromYear,
        toYear,
        { force },
      );

      sendJson(res, 200, {
        sector,
        fromYear,
        toYear,
        industryAnalysisByYear,
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/executive', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const baseYear = parseYear(url.searchParams.get('baseYear')) ?? parseYear(url.searchParams.get('year'));
      const fromYear = parseYear(url.searchParams.get('fromYear')) ?? 2021;
      const toYear = parseYear(url.searchParams.get('toYear')) ?? 2025;
      const sector = parseSector(url.searchParams.get('sector'));
      const force = url.searchParams.get('force') === '1';

      if (!baseYear || !sector) {
        sendJson(res, 400, {
          error: 'baseYear(또는 year)와 sector(전시사업|인테리어)가 필요합니다.',
        });
        return;
      }

      if (fromYear > toYear) {
        sendJson(res, 400, { error: 'fromYear는 toYear보다 클 수 없습니다.' });
        return;
      }

      const driveStatus = getCompetitorDriveStatus(root);
      const folderPath = getCompetitorFolderPath(baseYear, sector);

      if (!driveStatus.configured) {
        sendJson(res, 200, {
          sector,
          fromYear,
          toYear,
          baseYear,
          updatedAt: new Date().toISOString(),
          records: [],
          recordsByYear: {},
          timeline: [],
          folderPath,
          configured: false,
        });
        return;
      }

      const { buildExecutiveMultiYearSummary } = await import('./server/competitorExecutiveData');
      const summary = await buildExecutiveMultiYearSummary(root, sector, {
        fromYear,
        toYear,
        baseYear,
        force,
        uploadConfigured: driveStatus.uploadConfigured,
      });
      sendJson(res, 200, { ...summary, folderPath, configured: true });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/master', async (req, res) => {
    if (req.method === 'GET') {
      try {
        const config = getNexusDriveConfig(root);
        const { loadMasterCompetitorData, rebuildMasterCompetitorData } = await import(
          './server/competitorMasterData'
        );
        const url = new URL(req.url ?? '', 'http://localhost');
        const rebuild = url.searchParams.get('rebuild') === '1';
        const master = rebuild
          ? await rebuildMasterCompetitorData(root, { force: url.searchParams.get('force') === '1' })
          : (loadMasterCompetitorData(config) ?? (await rebuildMasterCompetitorData(root)));
        sendJson(res, 200, master);
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await readJsonBody<{ force?: boolean; sectors?: string[] }>(req);
        const sectors = (body.sectors ?? []).filter((s): s is import('./server/competitorDrive').CompetitorSector =>
          isCompetitorSector(s),
        );
        const master = await rebuildMasterCompetitorData(root, {
          force: body.force ?? false,
          sectors: sectors.length > 0 ? sectors : undefined,
        });
        sendJson(res, 200, { ok: true, master });
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    sendJson(res, 405, { error: 'Method Not Allowed' });
  });

  server.middlewares.use('/api/competitor/ai-insights', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const apiKeyHeader = req.headers['x-api-key'];
      const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
      const body = await readJsonBody<{
        sector: string;
        fromYear: number;
        toYear: number;
        records?: Array<Record<string, unknown>>;
        validationSummary?: { review: number; reparse: number; claudeReparsed: number };
      }>(req);

      if (!body.sector || !body.fromYear || !body.toYear) {
        sendJson(res, 400, { error: 'sector, fromYear, toYear가 필요합니다.' });
        return;
      }

      const { generateCompetitorAiInsights } = await import('./server/competitorClaudeValidation');
      const { isClaudeConfigured } = await import('./server/claudeServer');

      if (!apiKey && !isClaudeConfigured(root)) {
        sendJson(res, 401, { error: 'Claude API 키가 필요합니다.' });
        return;
      }

      const insights = await generateCompetitorAiInsights(root, {
        sector: body.sector,
        fromYear: body.fromYear,
        toYear: body.toYear,
        records: body.records ?? [],
        validationSummary: body.validationSummary,
        apiKey: apiKey ?? undefined,
      });

      sendJson(res, 200, { ok: true, insights });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.middlewares.use('/api/competitor/executive-insights', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    try {
      const apiKeyHeader = req.headers['x-api-key'];
      const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
      const body = await readJsonBody<{ context?: Record<string, unknown>; cacheKey?: string }>(req);

      if (!body.context) {
        sendJson(res, 400, { error: 'context가 필요합니다.' });
        return;
      }

      const { generateCompetitorExecutiveInsights } = await import(
        './server/competitorExecutiveClaudeInsight'
      );
      const { isClaudeConfigured } = await import('./server/claudeServer');

      if (!apiKey && !isClaudeConfigured(root)) {
        sendJson(res, 401, { error: 'Claude API 키가 필요합니다.' });
        return;
      }

      const result = await generateCompetitorExecutiveInsights(root, {
        context: body.context as import('./server/competitorExecutiveClaudeInsight').ExecutiveInsightClaudeContext,
        cacheKey: body.cacheKey,
        apiKey: apiKey ?? undefined,
      });

      sendJson(res, 200, {
        ok: true,
        insights: result.insights,
        usage: result.usage,
        usedFallback: result.usedFallback,
        cacheHit: result.cacheHit ?? false,
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function competitorDrivePlugin(): Plugin {
  let projectRoot = process.cwd();

  return {
    name: 'competitor-drive',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      attachRoutes(server, projectRoot);
    },
    configurePreviewServer(server) {
      attachRoutes(server, projectRoot);
    },
  };
}
