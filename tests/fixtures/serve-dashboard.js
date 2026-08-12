// tests/fixtures/serve-dashboard.js
// Servidor HTTP estático mínimo para servir el dashboard en local.
// Sin dependencias externas — solo Node.js core.
//
// Uso:
//   npm run dashboard:serve
//   # abre http://localhost:4321 en el navegador
//
// Útil para:
//   - Probar cambios al dashboard antes de pushear
//   - Probar la PWA en local (registration de SW requiere HTTP, no file://)
//   - Validar que manifest.json y sw.js se sirven correctamente

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, '..', '..', 'dashboard');

const PORT = parseInt(process.env.PORT || '4321', 10);
const HOST = process.env.HOST || 'localhost';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    // Prevenir path traversal
    const filePath = resolve(DASHBOARD_DIR, urlPath.replace(/^\//, ''));
    if (!filePath.startsWith(DASHBOARD_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    const stats = await stat(filePath);
    if (!stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache', // útil para desarrollo
      // Permite que el SW funcione en localhost
      'Service-Worker-Allowed': '/',
    });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      console.error('[serve-dashboard]', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`agent-brain dashboard servido en:`);
  console.log(`  http://${HOST}:${PORT}/`);
  console.log(``);
  console.log(`Directorio: ${DASHBOARD_DIR}`);
  console.log(`Ctrl+C para parar.`);
});
