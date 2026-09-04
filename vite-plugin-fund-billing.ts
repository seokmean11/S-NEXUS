import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { readFundBillingLedger, writeFundBillingLedger } from './server/fundBillingStore';

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
  server.middlewares.use('/api/fund-billing/ledger', async (req, res) => {
    if (req.method === 'GET') {
      try {
        sendJson(res, 200, { ok: true, ledger: readFundBillingLedger(root) });
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (req.method === 'PUT') {
      try {
        const body = await readJsonBody<{ ledger: { reports: unknown[] } }>(req);
        if (!body?.ledger || !Array.isArray(body.ledger.reports)) {
          sendJson(res, 400, { error: 'Invalid fund billing ledger' });
          return;
        }
        const result = await writeFundBillingLedger(root, body.ledger as never);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    sendJson(res, 405, { error: 'Method Not Allowed' });
  });
}

export function fundBillingPlugin(): Plugin {
  let projectRoot = process.cwd();
  return {
    name: 'fund-billing-ledger',
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
