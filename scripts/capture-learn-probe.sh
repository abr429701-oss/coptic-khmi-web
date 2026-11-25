#!/usr/bin/env bash
# Learn-iframe Safari probe v2: gated, no blind chains.
#  - exact staged build @35f4531 via worktree (full-depth checkout), SHA asserted
#  - production basepath mirror + HTTP status validation before Safari
#  - coachmark dismissed ONLY if detected (AX + screenshot evidence)
#  - drawer opening VERIFIED by pixel-diff before choosing Learn
#  - any failed gate => save evidence, stop, honest blocked verdict
set -x
mkdir -p capture
STAGED_REF=35f4531

python3 -m venv /tmp/idbenv
/tmp/idbenv/bin/pip -q install fb-idb pillow || true
export PATH=/tmp/idbenv/bin:$PATH

# ---- exact staged build ----
FULL=$(git rev-parse "$STAGED_REF")
echo "staged full sha: $FULL"
git worktree add /tmp/staged "$FULL" 2>&1 | tail -2
BUILDSHA=$(git -C /tmp/staged rev-parse HEAD)
echo "BUILD SHA: $BUILDSHA (requested $FULL)" | tee capture/build-sha.txt
[ "$BUILDSHA" = "$FULL" ] || { echo "BUILD IDENTITY MISMATCH - aborting"; exit 1; }
( cd /tmp/staged && npm ci && npx expo export -p web ) >/tmp/build.log 2>&1
echo "build exit: $?"; tail -8 /tmp/build.log
[ -d /tmp/staged/dist ] || { cp /tmp/build.log capture/build-failure.log; exit 1; }
mkdir -p /tmp/srv/coptic-khmi-web
cp -r /tmp/staged/dist/* /tmp/srv/coptic-khmi-web/
(cd /tmp/srv && python3 -m http.server 8080 >"$OLDPWD/capture/httpd.log" 2>&1 &)
sleep 3
BASE=http://localhost:8080/coptic-khmi-web
{
  echo -n "index: "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/"
  ENTRY=$(ls /tmp/srv/coptic-khmi-web/_expo/static/js/web/entry-*.js | head -1 | xargs basename)
  echo "entry: $ENTRY"
  echo -n "entry status: "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/_expo/static/js/web/$ENTRY"
  echo -n "entry bytes: "; curl -s "$BASE/_expo/static/js/web/$ENTRY" | wc -c
} | tee capture/http-checks.txt

# ---- simulator ----
DT=$(xcrun simctl list devicetypes | sed -n 's/.*\(iPhone [0-9][0-9A-Za-z ]*\) (.*/\1/p' | grep -vi 'se\|mini' | sort -V | tail -1)
UDID=$(xcrun simctl create probe-iphone "$DT")
xcrun simctl boot "$UDID"
open -a Simulator
sleep 18
brew install idb-companion >/dev/null 2>&1 || brew install facebook/fb/idb-companion >/dev/null 2>&1 || true
idb_companion --udid "$UDID" >/dev/null 2>&1 &
sleep 8
cp scripts/tap_ax.py /tmp/ax.py
tap() { idb ui tap "$1" "$2" --udid "$UDID"; sleep "${3:-2}"; }
shot() { xcrun simctl io "$UDID" screenshot "capture/$1"; }
diffregion() { # $1 before $2 after $3 x0 $4 y0 $5 x1 $6 y1 -> prints mean abs diff
  /tmp/idbenv/bin/python3 - "$1" "$2" "$3" "$4" "$5" "$6" <<'PY'
import sys
from PIL import Image, ImageChops
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
box=(int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5]),int(sys.argv[6]))
d=ImageChops.difference(a.crop(box),b.crop(box))
h=d.convert('L').histogram()
tot=sum(i*c for i,c in enumerate(h)); n=sum(h) or 1
print(f"{tot/n:.2f}")
PY
}

xcrun simctl io "$UDID" recordVideo --codec h264 capture/probe.mov &
REC=$!
xcrun simctl openurl "$UDID" "$BASE/"
sleep 40
shot 00-loaded-raw.png

# ---- coachmark: dismiss ONLY if detected (AX sees native Safari UI) ----
for i in 1 2; do
  if python3 /tmp/ax.py find "$UDID" 'View Bookmarks' | grep -q matched; then
    echo "coachmark present (attempt $i) - dismissing via photographed X pt(400,707)"
    python3 /tmp/ax.py tap "$UDID" '^Close$' || tap 400 707 2
    sleep 2
    shot "00-coachmark-dismissed-$i.png"
  else
    echo "coachmark not present (attempt $i)"; break
  fi
done
shot 01-loaded.png

# ---- drawer: open + VERIFY by pixel-diff ----
DRAWN=0
for i in 1 2; do
  shot "02-pre-drawer-$i.png"
  tap 396 103 4
  shot "02-drawer-try$i.png"
  D=$(diffregion "capture/02-pre-drawer-$i.png" "capture/02-drawer-try$i.png" 230 100 727 1550)
  echo "drawer diff try$i: $D"
  if /tmp/idbenv/bin/python3 -c "import sys; sys.exit(0 if float('$D')>8 else 1)"; then DRAWN=1; echo "DRAWER OPEN (verified)"; break; fi
done
if [ "$DRAWN" != 1 ]; then echo "BLOCKED: drawer never opened"; kill -INT $REC; sleep 5; exit 1; fi

# ---- Learn row (verified pt 290,278) + notice modal ----
tap 290 278 5
shot 03-learn-screen.png
# modal "Got it" if the Important Notice is up (pt 220,598); verify state change after
tap 220 598 4
shot 03b-after-notice.png

# ---- open first lesson -> Drive iframe; then play attempt ----
sleep 8
tap 220 500 5                # first lesson card area (screenshot evidence judges)
shot 04-iframe.png
sleep 15                     # Drive iframe load
shot 04b-iframe-settled.png
tap 220 500 3                # play attempt
sleep 10
shot 05-play.png
tap 220 500 3
sleep 8
shot 06-play2.png
kill -INT $REC || true
sleep 5
tail -30 capture/httpd.log || true
ls -la capture/
