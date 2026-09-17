import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  isValidAppBundle,
  readServerAppBundle,
  writeServerAppBundle,
  type AppRuntimeRole,
  type StoredNexusAppBundle,
} from './server/nexusAppStore';

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
  role: AppRuntimeRole,
): void {
  const writable = role === 'service';
  server.middlewares.use('/api/nexus-app/state', async (req, res) => {
    if (req.method === 'GET') {
      try {
        sendJson(res, 200, {
          ok: true,
          bundle: await readServerAppBundle(root, role),
          writable,
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
        const body = await readJsonBody<{ bundle?: StoredNexusAppBundle }>(req);
        if (!isValidAppBundle(body?.bundle)) {
          sendJson(res, 400, { error: 'Invalid app bundle payload' });
          return;
        }
        const meta = await writeServerAppBundle(root, body.bundle, role);
        sendJson(res, 200, { ok: true, ...meta });
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

export function nexusAppPlugin(): Plugin {
  let projectRoot = process.cwd();
  return {
    name: 'nexus-app',
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
