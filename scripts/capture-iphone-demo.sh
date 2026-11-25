#!/usr/bin/env bash
# Real iOS Simulator capture v7: A2HS FIRST in clean Safari state; coordinates verified
# from v5's real screenshots (menu open): "..." = (378,894)pt, Share = (193,623)pt.
# All swipes in valid point range (screen 440x953pt). AX only as secondary confirmation.
set -x
mkdir -p capture
URL="${LIVE_URL:-https://abr429701-oss.github.io/coptic-khmi-web/}"
cp scripts/tap_ax.py /tmp/ax.py

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
# Dismiss first-run coachmark by its known X position (px 666,1154 -> pt 403,700); harmless on empty page area
tap 403 700 3
tap 403 700 2
shot 01-home-online.png

xcrun simctl io "$UDID" recordVideo --codec h264 capture/demo.mov &
REC=$!
sleep 2

# ---- A2HS FIRST (clean Safari state) ----
tap 378 894 3                 # "..." page menu (verified button center)
shot 02-pagemenu.png
tap 193 623 4                 # "Share" row (verified from v5's open-menu screenshot)
shot 03-sharesheet.png
# scroll the sheet's action list up (valid in-sheet point range)
idb ui swipe 220 800 220 520 --udid "$UDID" || true
sleep 2
shot 04-sheet-scrolled.png
# A2HS row: after one-page scroll it is typically near the top of the visible actions; AX first, coords fallback
python3 /tmp/ax.py tap "$UDID" '^Add to Home Screen$' || tap 220 640 2 || true
sleep 3
shot 05-a2hs-confirm.png
# Confirm dialog: "Add" top-right. AX first, else its standard position (pt ~390,60)
python3 /tmp/ax.py tap "$UDID" '^Add$' || tap 390 60 2 || true
sleep 3

# ---- SpringBoard: icon + standalone launch ----
idb ui button HOME --udid "$UDID" || true
sleep 3
shot 06-homescreen.png
python3 /tmp/ax.py tap "$UDID" '(Coptic|ⲬⲎⲘⲒ|KHMI)' || true
sleep 12
shot 07-standalone.png

# ---- Search/details beats (proven working) ----
xcrun simctl openurl "$UDID" "$URL"
sleep 12
tap 220 326 3                 # search field (frac 0.5,0.342 in points)
idb ui text "love" --udid "$UDID" || true
sleep 8
shot 08-search.png
tap 220 458 6                 # first result row
shot 09-details.png

# ---- Chime gesture path: fresh reload, first-user-gesture tap (no audio claim; mechanism is code-level) ----
xcrun simctl openurl "$UDID" "$URL"
sleep 6
shot 10-resplash.png
tap 220 500 3                 # first user gesture (triggers deferred chime per f4496a5)
shot 11-after-gesture.png

# ---- Offline: network cut, reload; app must render from SW cache ----
sudo ifconfig en0 down || true
sleep 4
xcrun simctl openurl "$UDID" "$URL"
sleep 15
shot 12-offline.png

# ---- Offline UNOPENED Bible navigation (fresh sim: any chapter is unopened) ----
tap 396 103 4                 # hamburger (px 655,170)
shot 13-drawer.png
tap 260 250 5                 # 3rd drawer row = الكتاب المقدس (home/learn/bible order from DrawerMenu.tsx)
shot 14-bible.png
tap 220 250 5                 # first book entry (guess; screenshot verifies state)
shot 15-book.png
tap 80 220 5                  # chapter 1 cell (guess; screenshot verifies)
shot 16-chapter.png
sudo ifconfig en0 up || true
sleep 8
curl -sS -o /dev/null -w 'network restored: %{http_code}\n' https://api.github.com/zen || sudo ifconfig en0 up || true
sleep 3

kill -INT $REC || true
sleep 5
ls -la capture/
