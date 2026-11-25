// Post-process the expo web export into an offline-capable PWA for GitHub Pages.
// Usage: node scripts/build-pwa.mjs   (after `npx expo export -p web`)
import fs from 'fs';
import path from 'path';

const DIST = 'dist';
const BASE = '/coptic-khmi-web';

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

// 1) Precache list: app shell only (JS bundle, favicon, icons, manifest). Bible JSON is
//    cached on demand at runtime so first setup stays fast.
const shellFiles = walk(DIST)
  .filter(f => /_expo[\/\\]static[\/\\]js[\/\\].*\.js$/.test(f) || /favicon\.ico$/.test(f) || /\.(ttf|otf)$/.test(f))
  .map(f => BASE + '/' + f.split(path.sep).join('/').replace(/^dist\//, ''));
const precache = ['/', '/index.html', '/manifest.json', '/offline-manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', ...shellFiles]
  .map(u => u === '/' ? BASE + '/' : (u.startsWith(BASE) ? u : BASE + u));
// Offline manifest the in-app badge verifies against Cache Storage: "ready" only when
// every shell, font and dictionary-carrying bundle is durably cached on the device.
fs.writeFileSync(path.join(DIST, 'offline-manifest.json'), JSON.stringify({ version: 1, resources: precache }));

const sw = `// Coptic Khmi web app service worker. App shell precached; Bible JSON and same-origin
// GETs cached on demand. Cross-origin data (sheet sync, audio, videos) always goes to network.
const VERSION = 'khmi-shell-v2';
const RUNTIME = 'khmi-runtime-v2';
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => ![VERSION, RUNTIME].includes(k) && !k.startsWith('coptic-audio')).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // SPA navigation: serve the cached shell when offline or always (app-style).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('${BASE}/index.html', copy));
        return res;
      }).catch(() => caches.match('${BASE}/index.html'))
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // network for sheet/audio/video

  // Same-origin static (Bible JSON, assets): cache-first with runtime fill.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit ||
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
`;
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);

// 2) index.html: manifest, iOS web-app meta, icons, SW registration.
let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const headAdd = `
  <script>window.__KHMI_BASE__ = '${BASE}';</script>
  <link rel="manifest" href="${BASE}/manifest.json" />
  <meta name="theme-color" content="#8B0000" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="ⲭⲏⲙⲓ" />
  <link rel="apple-touch-icon" href="${BASE}/icons/apple-touch-icon.png" />`;
html = html.replace('</head>', headAdd + '\n</head>');
const reg = `
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('${BASE}/sw.js', { scope: '${BASE}/' }).catch(() => {});
    });
  }
</script>
</body>`;
html = html.replace('</body>', reg);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, '404.html'), html); // Pages SPA fallback
console.log('PWA files written. Precache entries:', precache.length);
