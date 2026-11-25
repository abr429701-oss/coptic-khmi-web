#!/usr/bin/env bash
# A2HS capture v9: coachmark-aware, AX-gated. Live PWA only, no app build.
# Every gate saves evidence; a failed gate stops the run with a blocker note.
set -x
mkdir -p capture
URL="${LIVE_URL:-https://abr429701-oss.github.io/coptic-khmi-web/}"
cp scripts/tap_ax.py /tmp/ax.py
BLOCK() { echo "BLOCKED: $1" | tee -a capture/RESULT.txt; finish; exit 0; }
REC=""
finish() {
  [ -n "$REC" ] && kill -INT $REC 2>/dev/null && wait $REC 2>/dev/null
  sudo ifconfig en0 up 2>/dev/null || true
  sleep 3
}
DT=$(xcrun simctl list devicetypes | sed -n 's/.*\(iPhone [0-9][0-9A-Za-z ]*\) (.*/\1/p' | grep -vi 'se\|mini' | sort -V | tail -1)
echo "Device type: $DT" | tee capture/RESULT.txt
xcrun simctl list runtimes | tee -a capture/RESULT.txt
UDID=$(xcrun simctl create demo-iphone "$DT")
xcrun simctl boot "$UDID"
open -a Simulator
sleep 20
python3 -m venv /tmp/idbenv
/tmp/idbenv/bin/pip -q install fb-idb || true
export PATH=/tmp/idbenv/bin:$PATH
brew install idb-companion >/dev/null 2>&1 || brew install facebook/fb/idb-companion >/dev/null 2>&1 || true
idb_companion --udid "$UDID" >/dev/null 2>&1 &
sleep 10
brew install tesseract >/dev/null 2>&1 || true
tap() { idb ui tap "$1" "$2" --udid "$UDID"; sleep "${3:-2}"; }
shot() { xcrun simctl io "$UDID" screenshot "capture/$1"; }
axd() { python3 /tmp/ax.py dump "$UDID" > "capture/$1" 2>&1; }

xcrun simctl io "$UDID" recordVideo --codec h264 capture/a2hs.mov &
REC=$!
sleep 3
xcrun simctl openurl "$UDID" "$URL"
# Wait for the app to paint (AX shows page content); coachmark appears late.
sleep 50
shot 01-loaded.png
axd 01-ax-loaded.txt


cat > /tmp/ocr.py <<'PYEOF'
#!/usr/bin/env python3
# usage: ocr.py <png> <pt_width> <regex words joined by space> [exact]
# prints "x y" (points) of the first line whose text matches regex; exit 1 if none
import subprocess, sys, re, csv, io
png, ptw, pat = sys.argv[1], float(sys.argv[2]), sys.argv[3]
p=subprocess.run(["tesseract", png, "/tmp/ocr-out", "--psm", "11", "tsv"], capture_output=True)
open("/tmp/ocr-err.txt","ab").write(p.stderr+("rc=%s\n"%p.returncode).encode())
out = open("/tmp/ocr-out.tsv", encoding="utf-8", errors="replace").read()
rows = list(csv.DictReader(io.StringIO(out), delimiter="\t", quoting=csv.QUOTE_NONE))
from PIL import Image
W = Image.open(png).size[0]; k = ptw / W
words = [r for r in rows if r.get("text", "").strip() and float(r["conf"]) > 20]
# group into lines by (block,par,line)
lines = {}
for r in words:
    lines.setdefault((r["block_num"], r["par_num"], r["line_num"]), []).append(r)
rx = re.compile(pat, re.I)
for key, ws in lines.items():
    txt = " ".join(w["text"] for w in ws)
    if rx.search(txt):
        l = min(int(w["left"]) for w in ws); r_ = max(int(w["left"]) + int(w["width"]) for w in ws)
        t = min(int(w["top"]) for w in ws); b = max(int(w["top"]) + int(w["height"]) for w in ws)
        print(f"matched: {txt}", file=sys.stderr)
        print(int((l + r_) / 2 * k), int((t + b) / 2 * k)); sys.exit(0)
sys.exit(1)
PYEOF
/tmp/idbenv/bin/pip -q install pillow || true
PTW=440
ocr() { # name regex -> echo "x y" or return 1
  xcrun simctl io "$UDID" screenshot /tmp/ocr-cur.png
  cp /tmp/ocr-err.txt capture/ocr-err.txt 2>/dev/null; cp /tmp/ocr-out.tsv capture/ocr-last.tsv 2>/dev/null
  /tmp/idbenv/bin/python /tmp/ocr.py /tmp/ocr-cur.png $PTW "$1"
}

# ---- Gate 1: coachmark (X at pt ~400,707 per prior photo); verified by screenshot ----
tap 400 707 2
shot 02-coachmark-dismissed.png
sleep 2
# ---- Gate 2: "..." page menu, ONE duration tap; AX labels are None, so verify by frames/OCR ----
idb ui tap 378 894 --duration 0.15 --udid "$UDID"
sleep 3
shot 03-menu.png
axd 03-ax-menu.txt
grep -q '250x956' capture/03-ax-menu.txt || BLOCK "Safari page menu not detected by AX frames (see 03-menu.png)"
echo "menu detected" | tee -a capture/RESULT.txt
# ---- Gate 3 ----
SX=$(ocr '^Share$') && tap ${SX% *} ${SX#* } 3 || tap 289 624 3
shot 04-sharesheet.png
axd 04-ax-sheet.txt
cp /tmp/ocr-err.txt capture/ocr-err0.txt 2>/dev/null
xcrun simctl io "$UDID" screenshot /tmp/t.png; /tmp/idbenv/bin/python /tmp/ocr.py /tmp/t.png 440 "Share|Copy|Add" > capture/ocr-test.txt 2>&1; ls -la /tmp/ocr-out* >> capture/ocr-test.txt 2>&1; tesseract --version >> capture/ocr-test.txt 2>&1
for y in 1 2 3; do idb ui swipe 220 820 220 360 --udid "$UDID" || true; sleep 2; shot "04x-scroll$y.png"; axd "04x-ax$y.txt"; done
for s in 1 2 3 4; do
  if ocr 'Add to Home' >/dev/null; then break; fi
  idb ui swipe 220 800 220 400 --udid "$UDID" || true
  sleep 2
done
shot 05-sheet-scrolled.png
AX=$(ocr 'Add to Home') || BLOCK "Add to Home Screen not found by OCR in share sheet (see 04/05)"
tap ${AX% *} ${AX#* } 4
shot 06-a2hs-confirm.png
AD=$(ocr '^Add$') || BLOCK "Add button not found by OCR on confirm sheet (see 06)"
tap ${AD% *} ${AD#* } 4
shot 07-after-add.png
echo "A2HS_ADDED" | tee -a capture/RESULT.txt

# ---- Gate 4: icon on Home Screen, standalone launch ----
idb ui button HOME --udid "$UDID" || true
sleep 3
shot 08-homescreen.png
IC=$(ocr 'coptic') || BLOCK "web-clip icon label not found by OCR on Home Screen (see 08)"
echo "icon at $IC" | tee -a capture/RESULT.txt
tap ${IC% *} $(( ${IC#* } - 40 )) 15       # tap icon image just above its label
shot 10-standalone.png
axd 10-ax-standalone.txt
# standalone check: Safari bottom bar frames (y~874, 48x48 buttons) must be absent
if grep -q '@ 34,874 48x48' capture/10-ax-standalone.txt; then
  echo "NOT_STANDALONE: Safari toolbar frames present after icon launch" | tee -a capture/RESULT.txt
else
  echo "STANDALONE_NO_SAFARI_TOOLBAR_FRAMES" | tee -a capture/RESULT.txt
fi
sleep 45
shot 11-before-cut.png
# first tap = user gesture for audio; screenshot only
tap 220 500 3
shot 11b-after-gesture.png
sudo ifconfig en0 down || true
sleep 4
idb ui button HOME --udid "$UDID" || true
sleep 3
# kill the web app and relaunch from the icon with network off
xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | grep -i webapp | tee capture/12-webapp-procs.txt || true
IC2=$(ocr 'coptic') || IC2="$IC"
tap ${IC2% *} $(( ${IC2#* } - 40 )) 15
shot 12-offline-launch.png
tap 40 100 4
shot 13-offline-drawer.png
DR=$(ocr 'Bible|الكتاب') && tap ${DR% *} ${DR#* } 5 || tap 290 345 5
shot 14-offline-bible.png
tap 220 300 5
shot 15-offline-book.png
tap 120 320 5
shot 16-offline-chapter.png
finish
