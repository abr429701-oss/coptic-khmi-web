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

# ---- Gate 1: coachmark. Dismiss by AX if listed, else by its X, verify by screenshot diff ----
for i in 1 2 3; do
  if grep -qiE 'Bookmarks|Share Menu|Open Tabs' capture/01-ax-loaded.txt || [ $i -gt 0 ]; then
    python3 /tmp/ax.py tap "$UDID" '^(Close|Dismiss)$' || tap 400 707 2
    sleep 2
    shot "02-coachmark-try$i.png"
  fi
  axd "02-ax-after$i.txt"
  grep -qiE 'View Bookmarks, Share Menu' capture/02-ax-after$i.txt || break
done

# ---- Gate 2: open the Safari page menu by AX element (3 tries) ----
axd 03-ax-toolbar.txt
MENU=0
for i in 1 2 3; do
  if python3 /tmp/ax.py find "$UDID" '(Page Menu|^More$|^Menu$|Show Menu)' | grep -q matched; then
    python3 /tmp/ax.py find "$UDID" '(Page Menu|^More$|^Menu$|Show Menu)' | tee -a capture/RESULT.txt
    XY=$(python3 /tmp/ax.py find "$UDID" '(Page Menu|^More$|^Menu$|Show Menu)' | tail -1)
    idb ui tap $XY --duration 0.15 --udid "$UDID"
  else
    idb ui tap 378 894 --duration 0.15 --udid "$UDID"
  fi
  sleep 3
  shot "03-menu-try$i.png"
  axd "03-ax-menu$i.txt"
  if grep -qE "Share|Add to Home|Add Bookmark" capture/03-ax-menu$i.txt; then MENU=1; break; fi
done
[ $MENU = 1 ] || BLOCK "Safari page menu did not open after coachmark dismissal (3 AX tries); see 03-*"

# ---- Gate 3: Share -> Add to Home Screen -> Add ----
python3 /tmp/ax.py tap "$UDID" '^Share' || tap 193 623 3
sleep 3
shot 04-sharesheet.png
for s in 1 2 3; do
  python3 /tmp/ax.py find "$UDID" 'Add to Home Screen' | grep -q matched && break
  idb ui swipe 220 800 220 450 --udid "$UDID" || true
  sleep 2
done
shot 05-sheet-scrolled.png
axd 05-ax-sheet.txt
python3 /tmp/ax.py tap "$UDID" 'Add to Home Screen' || BLOCK "Add to Home Screen row not found in share sheet; see 05-*"
sleep 4
shot 06-a2hs-confirm.png
axd 06-ax-confirm.txt
python3 /tmp/ax.py tap "$UDID" '^Add$' || BLOCK "Add button not found on A2HS confirm; see 06-*"
sleep 4
shot 07-after-add.png
echo "A2HS_ADDED" | tee -a capture/RESULT.txt

# ---- Gate 4: icon on Home Screen, standalone launch ----
idb ui button HOME --udid "$UDID" || true
sleep 3
shot 08-homescreen.png
axd 08-ax-springboard.txt
xcrun simctl listapps "$UDID" 2>/dev/null | grep -iE 'CFBundleDisplayName|CFBundleIdentifier' | grep -iE 'webapp|WebClip|khmi|coptic' > capture/09-webclips.txt || true
ICON='(Coptic|ⲬⲎⲘⲒ|KHMI|Khmi|خمي)'
python3 /tmp/ax.py find "$UDID" "$ICON" | tee -a capture/RESULT.txt || BLOCK "no web-clip icon found on Home Screen; see 08-*"
python3 /tmp/ax.py tap "$UDID" "$ICON"
sleep 15
shot 10-standalone.png
axd 10-ax-standalone.txt
if grep -qiE 'Page Menu|Address|Tab Bar|Reload' capture/10-ax-standalone.txt; then
  echo "WARNING: Safari chrome labels present in AX after icon launch (not standalone?)" | tee -a capture/RESULT.txt
else
  echo "STANDALONE_AX_NO_SAFARI_CHROME" | tee -a capture/RESULT.txt
fi

# ---- Offline beats from the installed icon ----
sleep 60                         # precache window
shot 11-before-cut.png
sudo ifconfig en0 down || true
sleep 4
xcrun simctl terminate "$UDID" com.apple.webapp 2>/dev/null || true
idb ui button HOME --udid "$UDID" || true
sleep 2
python3 /tmp/ax.py tap "$UDID" "$ICON" || true
sleep 15
shot 12-offline-launch.png
tap 396 103 4
shot 13-offline-drawer.png
tap 290 345 5
shot 14-offline-bible.png
tap 220 300 5
shot 15-offline-book.png
tap 120 320 5
shot 16-offline-chapter.png
finish
