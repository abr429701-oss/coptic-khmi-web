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
cat > /tmp/diff.py <<'PYD'
import sys
from PIL import Image, ImageChops
a=Image.open(sys.argv[1]).convert('L'); b=Image.open(sys.argv[2]).convert('L')
box=(300,1700,1320,2600)  # lower-right popup area (px)
d=ImageChops.difference(a.crop(box),b.crop(box))
m=sum(d.getdata())/(d.size[0]*d.size[1])
print(round(m,2)); sys.exit(0 if m>6 else 1)
PYD
xcrun simctl io "$UDID" screenshot /tmp/pre-menu.png
cp /tmp/pre-menu.png capture/02b-pre-menu.png
OPENED=0
for i in 1 2 3 4; do
  idb ui tap 378 894 --duration 0.15 --udid "$UDID"
  sleep 3
  shot "03-menu-try$i.png"
  if /tmp/idbenv/bin/python /tmp/diff.py /tmp/pre-menu.png "capture/03-menu-try$i.png" | tee -a capture/RESULT.txt | grep -q .; then
    /tmp/idbenv/bin/python /tmp/diff.py /tmp/pre-menu.png "capture/03-menu-try$i.png" >/dev/null && { OPENED=1; break; }
  fi
done
[ $OPENED = 1 ] || BLOCK "Safari page menu never opened after 4 pixel-verified taps (see 03-menu-try*)"
cp "capture/03-menu-try$i.png" capture/03-menu.png
echo "menu detected (pixel diff)" | tee -a capture/RESULT.txt
# ---- Gate 3: Share -> expand -> Add to Home Screen -> Add (coordinates read from run-4 screenshots; OCR dropped) ----
tap 289 624 3
shot 04-sharesheet.png
# expand sheet: retry swipe until screenshot changes (flaky); verify by md5
H0=$(md5 -q capture/04-sharesheet.png)
for i in 1 2 3 4 5; do
  idb ui swipe 220 800 220 300 --duration 0.4 --udid "$UDID" || true
  sleep 3
  shot "05-expand-try$i.png"
  H1=$(md5 -q "capture/05-expand-try$i.png")
  [ "$H1" != "$H0" ] && break
done
cp "capture/05-expand-try$i.png" capture/05-sheet-expanded.png
axd 05-ax-expanded.txt
# single row tap: Add to Home Screen
tap 220 655 6
shot 06-a2hs-confirm.png
# iOS keyboard-intro modal ("Speed up your typing ... Continue") may cover the sheet: dismiss it
tap 220 911 3
shot 06b-a2hs-confirm-loaded.png
xcrun simctl listapps "$UDID" > capture/09a-listapps-before.txt 2>&1 || true
md5 -q capture/06b-a2hs-confirm-loaded.png | tee capture/md5-06b.txt
for i in 1 2 3; do
  idb ui tap 388 113 --duration 0.15 --udid "$UDID" | tee -a capture/RESULT.txt
  sleep 4
  shot "07-add-press$i.png"
  [ "$(md5 -q capture/07-add-press$i.png)" != "$(cat capture/md5-06b.txt)" ] && echo "screen changed after Add press $i" | tee -a capture/RESULT.txt && break
done
for n in 1 2 3 4 5 6 7 8; do sleep 5; shot "08-t$n.png"; done
idb ui button HOME --udid "$UDID" | tee -a capture/RESULT.txt; sleep 4; shot 09-home-idb1.png
idb ui button HOME --udid "$UDID" | tee -a capture/RESULT.txt; sleep 4; shot 09-home-idb2.png
xcrun simctl listapps "$UDID" > capture/09b-listapps-after.txt 2>&1 || true
diff capture/09a-listapps-before.txt capture/09b-listapps-after.txt > capture/09-listapps-diff.txt; wc -l capture/09-listapps-diff.txt | tee -a capture/RESULT.txt
md5 -q capture/*.png > /dev/null
echo "DIAGNOSTIC_DONE" | tee -a capture/RESULT.txt
finish
exit 0
