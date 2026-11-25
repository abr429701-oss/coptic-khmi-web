// Drives the packaged Windows Electron build on the windows-latest desktop.
// Screenshots ONLY the app window UI. No tokens, no personal data, no device rows.
// Any log line containing an ID-shaped token is masked before printing.
const { _electron: electron } = require('playwright-core');
const mask = (s) => String(s).replace(/[A-Za-z]+_[a-z0-9]{10,}/g, '[device-id]').replace(/ExponentPushToken\[[^\]]+\]/g, '[push-token]');
(async () => {
  const exePath = process.argv[2];
  const outDir = process.argv[3] || 'shots';
  const app = await electron.launch({ executablePath: exePath, timeout: 90000 });
  const page = await app.firstWindow({ timeout: 90000 });
  page.on('console', (m) => { const t = mask(m.text()); if (/error|regist|update|إصدار/i.test(t)) console.log('CONSOLE:', t.slice(0, 160)); });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(25000); // splash + boot + registration settle
  const shot = async (name) => page.screenshot({ path: `${outDir}/${name}.png` });
  await shot('01-home');
  // Real production chain, correct suppression: app 1.0.11 vs latest-windows.json 1.0.11
  const noticeShown = await page.evaluate(() => document.body.innerText.includes('متوفر إصدار جديد'));
  console.log('NOTICE_SHOWN(expect false):', noticeShown);
  // Drawer
  const ham = await page.evaluate(() => {
    let f = null;
    document.querySelectorAll('div[role="button"], div[tabindex="0"]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 140 && r.width === 46 && !(el.textContent || '').trim() && r.left < 100) f = { x: r.x + 23, y: r.y + 22 };
    });
    return f;
  });
  if (ham) { await page.mouse.click(ham.x, ham.y); await page.waitForTimeout(1500); await shot('02-drawer'); }
  // Bible: drawer -> الكتاب المقدس -> إنجيل متى -> chapter 1 -> verses
  const clickText = async (re, maxLen = 60) => page.evaluate(([src, fl, ml]) => {
    const rx = new RegExp(src, fl);
    const el = [...document.querySelectorAll('div')].find((d) => { const t = (d.textContent || '').trim(); return rx.test(t) && t.length < ml; });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [re.source, re.flags, maxLen]);
  let p = await clickText(/^الكتاب المقدس/);
  if (p) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(4000); }
  p = await clickText(/^إنجيل متى/);
  if (p) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(3500); await shot('03-bible-books'); }
  p = await clickText(/^1$/, 12);
  if (p) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(4000); }
  const verses = await page.evaluate(() => document.body.innerText.includes('كِتَابُ مِيلَادِ') || document.body.innerText.includes('The book of the generation'));
  console.log('BIBLE_VERSES_REACHED(expect true):', verses);
  await shot('04-bible-verses');
  // Offline beat: cut network in the Electron session, re-open a chapter
  const ctx = page.context();
  console.log('DONE');
  await app.close();
  process.exit(0);
})().catch((e) => { console.error('HARNESS_ERROR', mask(e.message).slice(0, 300)); process.exit(1); });
