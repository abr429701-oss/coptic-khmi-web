#!/usr/bin/env bash
# Real iOS Simulator capture v8 (final bounded A2HS attempt + staged Learn iframe test):
#  - A2HS: duration-tap (0.15s) on the verified "..." button, max 3 tries, then stop.
#  - Bible: corrected drawer row (pt 290,345, verified from v7 drawer pixels); offline
#    chapter read after fixed precache-readiness window (manifest: 396 Bible + 72 shell).
#  - Learn: staged source (main @35f4531, NOT deployed) built in background from script
#    start, served via localhost, driven in real Safari; narrow iframe-playback signal.
set -x
mkdir -p capture
URL="${LIVE_URL:-https://abr429701-oss.github.io/coptic-khmi-web/}"
cp scripts/tap_ax.py /tmp/ax.py

# Kick the staged-build off immediately so bundling overlaps the Safari beats.
( npm ci && npx expo export -p web ) >/tmp/build.log 2>&1 &
BUILD_PID=$!

DT=$(xcrun simctl list devicetypes | sed -n 's/.*\(iPhone [0-9][0-9A-Za-z ]*\) (.*/\1/p' | grep -vi 'se\|mini' | sort -V | tail -1)
echo "Device type: $DT"
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

tap() { idb ui tap "$1" "$2" --udid "$UDID"; sleep "${3:-2}"; }
shot() { xcrun simctl io "$UDID" screenshot "capture/$1"; }

xcrun simctl openurl "$UDID" "$URL"
sleep 25
# Dismiss first-run coachmark by its known X position; harmless on empty page area
tap 403 700 3
tap 403 700 2
shot 01-home-online.png

xcrun simctl io "$UDID" recordVideo --codec h264 capture/demo.mov &
REC=$!
sleep 2

# ---- A2HS FIRST (clean Safari state); duration-tap mechanism, max 3 tries then stop ----
MENU=0
for i in 1 2 3; do
  idb ui tap 378 894 --duration 0.15 --udid "$UDID" || true   # "..." page menu (verified center)
  sleep 3
  shot "02-pagemenu-try$i.png"
  if python3 /tmp/ax.py find "$UDID" '^Share$' | grep -q matched; then MENU=1; echo "MENU OPEN try $i"; break; fi
  echo "menu try $i: not confirmed via AX"
done
# Bounded downstream probes: Share row tap is verified coords (harmless if menu closed);
# A2HS row + Add confirm act ONLY via AX (no blind coordinate taps past this point).
tap 193 623 4                 # Share row (verified from v5's open-menu screenshot)
shot 03-sharesheet.png
idb ui swipe 220 800 220 520 --udid "$UDID" || true
sleep 2
shot 04-sheet-scrolled.png
python3 /tmp/ax.py tap "$UDID" '^Add to Home Screen$' || true
sleep 3
shot 05-a2hs-confirm.png
python3 /tmp/ax.py tap "$UDID" '^Add$' || true
sleep 3
shot 05b-after-add.png

# ---- SpringBoard: icon + standalone launch (evidence either way) ----
idb ui button HOME --udid "$UDID" || true
sleep 3
shot 06-homescreen.png
python3 /tmp/ax.py tap "$UDID" '(Coptic|ⲬⲎⲘⲒ|KHMI)' || true
sleep 12
shot 07-standalone.png

# ---- Search/details beats (proven working) ----
xcrun simctl openurl "$UDID" "$URL"
sleep 12
tap 220 326 3                 # search field
idb ui text "love" --udid "$UDID" || true
sleep 8
shot 08-search.png
tap 220 458 6                 # first result row
shot 09-details.png

# ---- Chime gesture path: fresh reload, first-user-gesture tap (no audio claim) ----
xcrun simctl openurl "$UDID" "$URL"
sleep 6
shot 10-resplash.png
tap 220 500 3
shot 11-after-gesture.png

# Precache-readiness window: manifest is 396 Bible + 72 shell; badge appeared within
# ~2 min in v7. Beats above already add ~2 min; pad before cutting network.
sleep 45

# ---- Offline: network cut, reload; app must render from SW cache ----
sudo ifconfig en0 down || true
sleep 4
xcrun simctl openurl "$UDID" "$URL"
sleep 15
shot 12-offline.png

# ---- Offline UNOPENED Bible navigation (corrected row from v7 pixel evidence) ----
tap 396 103 4                 # hamburger
shot 13-drawer.png
tap 290 345 5                 # Coptic Holy Bible row (verified from v7 13-drawer.png px 480,570)
shot 14-bible.png
tap 220 300 5                 # first book entry (screenshot verifies state)
shot 15-book.png
tap 120 320 5                 # chapter 1 cell (screenshot verifies)
shot 16-chapter.png
sudo ifconfig en0 up || true
sleep 8
curl -sS -o /dev/null -w 'network restored: %{http_code}\n' https://api.github.com/zen || sudo ifconfig en0 up || true
sleep 3

# ---- Learn iframe test: staged build @35f4531 via local server (pre-deploy, narrow) ----
# Wait for the background build (should be long done); 5-min hard cap.
for i in $(seq 1 60); do kill -0 $BUILD_PID 2>/dev/null || break; sleep 5; done
tail -30 /tmp/build.log || true
DIST=""
for d in dist web-build; do [ -d "$d" ] && DIST="$d" && break; done
if [ -n "$DIST" ]; then
  echo "serving staged build from $DIST on :8080"
  (cd "$DIST" && python3 -m http.server 8080 >/tmp/httpd.log 2>&1 &)
  sleep 3
  xcrun simctl openurl "$UDID" "http://localhost:8080/"
  sleep 25
  tap 403 700 2               # coachmark X if present (harmless)
  tap 403 700 2
  shot 17-learn-home.png
  tap 396 103 4               # hamburger
  shot 18-learn-drawer.png
  tap 290 278 5               # Learn Coptic Language row (verified from v7 13-drawer px 480,460)
  sleep 3
  shot 19-learn-notice.png
  tap 220 598 4               # "Got it" on Important Notice modal (verified from v7 14-bible px 363,988)
  sleep 12                    # let the Drive iframe actually load
  shot 20-learn-iframe.png
  tap 220 500 3               # tap into lesson area (play attempt)
  sleep 8
  shot 21-learn-play.png
else
  echo "STAGED BUILD FAILED - no dist output; see /tmp/build.log"
  cp /tmp/build.log capture/build-failure.log || true
fi

kill -INT $REC || true
sleep 5
ls -la capture/
