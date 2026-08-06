import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import formidable from 'formidable';
import fs from 'node:fs';
import {
  getNexusDriveStatus,
  listNexusDriveFiles,
  syncNexusDriveCache,
  uploadToNexusDriveFolder,
} from './server/nexusGoogleDrive';

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

function attachRoutes(server: { middlewares: { use: Function } }, root: string): void {
  server.middlewares.use('/api/nexus-data-folder/status', (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    sendJson(res, 200, getNexusDriveStatus(root));
  });

  server.middlewares.use('/api/nexus-data-folder/files', async (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    try {
      const status = getNexusDriveStatus(root);
      if (!status.configured) {
        sendJson(res, 200, { configured: false, files: [] });
        return;
      }
      const { getNexusDriveConfig } = await import('./server/nexusGoogleDrive');
      const config = getNexusDriveConfig(root);
      const files = await listNexusDriveFiles(config, { subfolderKey: 'outsourcing' });
      sendJson(res, 200, { configured: true, files });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.middlewares.use('/api/nexus-data-folder/sync', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    try {
      const body =
        req.headers['content-type']?.includes('application/json') ?
          await readJsonBody<{ force?: boolean }>(req)
        : { force: true };
      const meta = await syncNexusDriveCache(root, { force: body.force ?? true });
      sendJson(res, 200, { ok: true, meta });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.middlewares.use('/api/nexus-data-folder/upload', async (req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    const form = formidable({ multiples: false, maxFileSize: 120 * 1024 * 1024 });
    form.parse(req, async (err, _fields, files) => {
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

      try {
        const buffer = fs.readFileSync(file.filepath);
        const created = await uploadToNexusDriveFolder(
          root,
          file.originalFilename ?? 'upload.bin',
          buffer,
          file.mimetype ?? 'application/octet-stream',
        );
        sendJson(res, 200, { ok: true, file: created });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        fs.unlink(file.filepath, () => undefined);
      }
    });
  });
}

export function nexusDataFolderPlugin(): Plugin {
  let projectRoot = process.cwd();

  return {
    name: 'nexus-data-folder',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      attachRoutes(server, projectRoot);
    },
  };
}
