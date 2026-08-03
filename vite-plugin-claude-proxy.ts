import type { Plugin } from 'vite';

const ANTHROPIC_VERSION = '2023-06-01';

export function claudeProxyPlugin(): Plugin {
  return {
    name: 'claude-proxy',
    configureServer(server) {
      server.middlewares.use('/api/claude/messages', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const apiKeyHeader = req.headers['x-api-key'];
        const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

        if (!apiKey) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: { message: 'x-api-key header required' } }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          void (async () => {
            try {
              const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': apiKey,
                  'anthropic-version': ANTHROPIC_VERSION,
                },
                body: Buffer.concat(chunks).toString('utf8'),
              });

              const text = await response.text();
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(text);
            } catch (error) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: { message: error instanceof Error ? error.message : String(error) },
                }),
              );
            }
          })();
        });
      });
    },
  };
}
