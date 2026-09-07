import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  getServerOrgMeta,
  syncAndReadServerOrgState,
  writeServerOrgStateWithDriveSync,
  type OrgRuntimeRole,
} from './server/nexusOrgStore';
import type { StoredOrgState } from './src/utils/orgStorage';

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

function attachRoutes(
  server: { middlewares: { use: Function } },
  root: string,
  role: OrgRuntimeRole,
): void {
  server.middlewares.use('/api/nexus-org/meta', (req, res) => {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }
    sendJson(res, 200, getServerOrgMeta(root, role));
  });

  server.middlewares.use('/api/nexus-org/state', async (req, res) => {
    if (req.method === 'GET') {
      try {
        const loaded = await syncAndReadServerOrgState(root, role);
        sendJson(res, 200, {
          ok: true,
          state: loaded.state,
          meta: getServerOrgMeta(root, role, loaded.source),
        });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === 'PUT') {
      try {
        const body = await readJsonBody<{ state: StoredOrgState }>(req);
        if (
          !body?.state ||
          !Array.isArray(body.state.divisions) ||
          !Array.isArray(body.state.teams) ||
          !Array.isArray(body.state.employees)
        ) {
          sendJson(res, 400, { error: 'Invalid org state payload' });
          return;
        }
        const meta = await writeServerOrgStateWithDriveSync(root, body.state, role);
        sendJson(res, 200, { ok: true, meta });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    sendJson(res, 405, { error: 'Method Not Allowed' });
  });
}

export function nexusOrgPlugin(): Plugin {
  let projectRoot = process.cwd();

  return {
    name: 'nexus-org',
    configResolved(config) {
      projectRoot = config.root;
    },
    configureServer(server) {
      attachRoutes(server, projectRoot, 'dev');
    },
    configurePreviewServer(server) {
      attachRoutes(server, projectRoot, 'service');
    },
  };
}
