/* HappyTiles — tiny zero-dependency local dev server.
 *
 * Usage (from the HappyTiles folder):
 *   node serve.mjs            -> serves ./src at http://localhost:8080
 *   node serve.mjs 3000       -> use a different port
 *
 * Binds to 0.0.0.0 so you can also open it from another device on the same
 * Wi-Fi (e.g. an iPad) at  http://<your-PC-IP>:8080
 *
 * Note: the app's service worker stays OFF on localhost by design, so your code
 * edits always show on a normal reload. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'src');
const PORT = parseInt(process.argv[2] || '8080', 10);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (path === '/' || path.endsWith('/')) path += 'index.html';
    // keep the request inside ROOT (no path traversal)
    const filePath = normalize(join(ROOT, path));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'   // dev: never cache
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
  console.log('HappyTiles dev server running:');
  console.log('  Local:   http://localhost:' + PORT);
  lan.forEach((ip) => console.log('  Network: http://' + ip + ':' + PORT + '   (open this on the iPad / phone)'));
  console.log('Press Ctrl+C to stop.');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('Port ' + PORT + ' is already in use. Try: node serve.mjs 8090');
  else console.error('Server error:', e.message);
  process.exit(1);
});
