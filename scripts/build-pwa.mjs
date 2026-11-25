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
// The full Bible JSON set is listed separately: the app downloads it in the background
// after first online setup (not at SW install, which must stay fast) and the badge
// only reports offline-ready once every listed chapter file is cached.
const bibleManifest = JSON.parse(fs.readFileSync('utils/bibleManifest.json', 'utf8'));
const bibleFiles = [];
for (const lang of Object.keys(bibleManifest)) {
  for (const bookId of Object.keys(bibleManifest[lang])) {
    bibleFiles.push(BASE + '/bible/' + bibleManifest[lang][bookId].split('/').map(encodeURIComponent).join('/'));
  }
}
fs.writeFileSync(path.join(DIST, 'offline-manifest.json'), JSON.stringify({ version: 2, resources: precache, bible: bibleFiles }));
console.log('offline-manifest: ' + precache.length + ' shell + ' + bibleFiles.length + ' bible files');

const sw = `// Coptic Khmi web app service worker. App shell precached; Bible JSON and same-origin
// GETs cached on demand. Cross-origin data (sheet sync, audio, videos) always goes to network.
const VERSION = 'khmi-shell-v3';
const RUNTIME = 'khmi-runtime-v3';
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
const BUILD_STAMP = new Date().toISOString();
const reg = `
<script>
  window.__KHMI_BUILD__ = '${BUILD_STAMP}';
  (function () {
    if (!('serviceWorker' in navigator)) return;
    var RELOAD_FLAG = 'khmi-sw-reload';
    function showUpdateToast() {
      if (sessionStorage.getItem(RELOAD_FLAG)) return; // loop guard: we just reloaded for this update
      if (document.getElementById('khmi-update-toast')) return;
      var t = document.createElement('div');
      t.id = 'khmi-update-toast';
      t.dir = 'rtl';
      t.style.cssText = 'position:fixed;left:16px;right:16px;bottom:24px;z-index:99999;background:#2a2a2a;color:#fff;border:1px solid #8B0000;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 18px rgba(0,0,0,.5);font-family:inherit;';
      var msg = document.createElement('div');
      msg.style.cssText = 'flex:1;font-size:15px;line-height:1.5;';
      msg.textContent = 'متوفر إصدار جديد من التطبيق';
      var reopen = document.createElement('button');
      reopen.textContent = 'إعادة الفتح';
      reopen.style.cssText = 'background:#8B0000;color:#fff;border:none;border-radius:10px;padding:9px 14px;font-size:14px;cursor:pointer;';
      reopen.onclick = function () {
        try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch (e) {}
        location.reload();
      };
      var later = document.createElement('button');
      later.textContent = 'لاحقًا';
      later.style.cssText = 'background:transparent;color:#ccc;border:1px solid #555;border-radius:10px;padding:9px 12px;font-size:14px;cursor:pointer;';
      later.onclick = function () { t.remove(); };
      t.appendChild(msg); t.appendChild(reopen); t.appendChild(later);
      document.body.appendChild(t);
    }
    window.addEventListener('load', function () {
      // Clear the loop guard AFTER the fresh page is up: if this load came from the user's
      // tap, the new bundle is already running, so future real updates may prompt again.
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch (e) {}
      // A page that is not yet controlled is on first install: its first controllerchange is
      // the initial claim, not an update. Only prompt when the page was already controlled.
      var wasControlled = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!wasControlled) { wasControlled = true; return; }
        showUpdateToast();
      });
      navigator.serviceWorker.register('${BASE}/sw.js', { scope: '${BASE}/' }).then(function (registration) {
        var check = function () { registration.update().catch(function () {}); };
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
        setInterval(check, 5 * 60 * 1000);
      }).catch(function () {});
    });
  })();
</script>
</body>`;
html = html.replace('</body>', reg);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, '404.html'), html); // Pages SPA fallback
fs.writeFileSync(path.join(DIST, '.nojekyll'), ''); // Pages must serve _expo/* as-is
console.log('PWA files written. Precache entries:', precache.length);
