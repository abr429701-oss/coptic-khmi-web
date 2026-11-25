# Coptic Khmi — iPhone Web App (PWA)

Offline-capable web version of the Coptic dictionary, matching mobile v1.3.1 features, built to be added to an iPhone Home Screen and used fully offline after the first online setup.

## Build
```bash
npm install --legacy-peer-deps
npx expo export --platform web --output-dir dist
node scripts/build-pwa.mjs   # adds service worker, manifest links, offline fallback
```
Serve `dist/` under the base path `/coptic-khmi-web/` (GitHub Pages project site).

## Offline behavior
- First visit online installs a service worker that precaches the app shell and bundles the full dictionary snapshot, so the dictionary works offline from the first setup.
- An in-app badge shows "جاهزة للعمل بدون إنترنت" once offline-ready.
- Bible texts load on demand from static JSON and are cached after first read.
- Audio and Learn Coptic video streaming need a network connection on demand.
- Word/PowerPoint/Excel/PDF exports render in-browser and download via the browser (web equivalents of the mobile share-sheet flow).
- Not available on web (no platform equivalent): scheduled local notifications (daily word / reminders) and background downloads.
