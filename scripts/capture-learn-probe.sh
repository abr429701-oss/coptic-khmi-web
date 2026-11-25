#!/usr/bin/env bash
# Targeted Learn-iframe Safari probe: staged source @35f4531 (exact), built in a
# worktree so identification is preserved; served under the PRODUCTION basepath
# (/coptic-khmi-web/) so asset paths match github.io. Bundle HTTP statuses are
# validated BEFORE driving Safari. No A2HS, no deploy, no other beats.
set -x
mkdir -p capture
STAGED_SHA=35f4531

# ---- boot simulator while the build runs ----
DT=$(xcrun simctl list devicetypes | sed -n 's/.*\(iPhone [0-9][0-9A-Za-z ]*\) (.*/\1/p' | grep -vi 'se\|mini' | sort -V | tail -1)
UDID=$(xcrun simctl create probe-iphone "$DT")
xcrun simctl boot "$UDID"
open -a Simulator
sleep 20
python3 -m venv /tmp/idbenv
/tmp/idbenv/bin/pip -q install fb-idb || true
export PATH=/tmp/idbenv/bin:$PATH
brew install idb-companion >/dev/null 2>&1 || brew install facebook/fb/idb-companion >/dev/null 2>&1 || true
idb_companion --udid "$UDID" >/dev/null 2>&1 &
sleep 8
tap() { idb ui tap "$1" "$2" --udid "$UDID"; sleep "${3:-2}"; }
shot() { xcrun simctl io "$UDID" screenshot "capture/$1"; }

# ---- exact staged build (worktree at 35f4531; capture scripts on main are the only later diff) ----
git worktree add /tmp/staged "$STAGED_SHA" 2>&1 | tail -2
cd /tmp/staged
echo "BUILD SHA: $(git rev-parse HEAD)" | tee "$GITHUB_WORKSPACE/capture/build-sha.txt"
( npm ci && npx expo export -p web ) >/tmp/build.log 2>&1
echo "build exit: $?"; tail -15 /tmp/build.log
[ -d dist ] || { cp /tmp/build.log "$GITHUB_WORKSPACE/capture/build-failure.log"; echo "BUILD FAILED"; exit 1; }

# ---- serve under the PRODUCTION basepath ----
mkdir -p /tmp/srv/coptic-khmi-web
cp -r dist/* /tmp/srv/coptic-khmi-web/
(cd /tmp/srv && python3 -m http.server 8080 >"$GITHUB_WORKSPACE/capture/httpd.log" 2>&1 &)
sleep 3

# ---- validate bundle HTTP statuses BEFORE Safari ----
BASE=http://localhost:8080/coptic-khmi-web
{
  echo -n "index: "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/"
  ENTRY=$(ls /tmp/srv/coptic-khmi-web/_expo/static/js/web/entry-*.js | head -1 | xargs basename)
  echo "entry bundle: $ENTRY"
  echo -n "entry: "; curl -s -o /dev/null -w '%{http_code}\n' "$BASE/_expo/static/js/web/$ENTRY"
  echo -n "entry bytes: "; curl -s "$BASE/_expo/static/js/web/$ENTRY" | wc -c
} | tee "$GITHUB_WORKSPACE/capture/http-checks.txt"

# ---- drive real Safari ----
xcrun simctl io "$UDID" recordVideo --codec h264 "$GITHUB_WORKSPACE/capture/probe.mov" &
REC=$!
xcrun simctl openurl "$UDID" "$BASE/"
sleep 40                     # 18MB bundle parse on simulator is slow
tap 403 700 2                # coachmark X if present (harmless)
tap 403 700 2
shot 01-loaded.png
tap 396 103 4                # hamburger
shot 02-drawer.png
tap 290 278 5                # Learn Coptic row (verified v7 drawer pixels)
sleep 3
shot 03-learn-screen.png
tap 220 598 4                # "Got it" on the Important Notice modal (verified)
sleep 15                     # Drive iframe load
shot 04-iframe.png
tap 220 500 3                # play attempt in lesson area
sleep 10
shot 05-play.png
tap 220 500 3                # second play attempt
sleep 8
shot 06-play2.png
kill -INT $REC || true
sleep 5
echo "=== httpd requests tail ==="
tail -30 "$GITHUB_WORKSPACE/capture/httpd.log" || true
ls -la "$GITHUB_WORKSPACE/capture/"
