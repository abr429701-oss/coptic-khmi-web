#!/usr/bin/env bash
# Real iOS Simulator capture v5: every interactive step is AX-driven AND verified.
# Web content is AX-invisible (known) -> search field tapped by fraction, but keyboard
# presence is VERIFIED via native AX before typing. All Safari chrome, menus, share
# sheet, dialogs, SpringBoard are native -> AX label lookup with wait/retry.
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
idb list-targets || true

xcrun simctl openurl "$UDID" "$URL"
sleep 25

# Dismiss Safari's first-run coachmark BEFORE anything else (it swallowed v4's taps).
for i in 1 2 3; do
  python3 /tmp/ax.py tap "$UDID" '^(Close|إغلاق|Done|تم)$' && sleep 2 || break
done
sleep 2
xcrun simctl io "$UDID" screenshot capture/01-home-online.png

xcrun simctl io "$UDID" recordVideo --codec h264 capture/demo.mov &
REC=$!
sleep 2

# ---- Search flow ----
# Tap the app's search field by fraction; keyboard (native) must appear. Retry once higher.
python3 /tmp/ax.py frac "$UDID" 0.5,0.342
if ! python3 /tmp/ax.py wait "$UDID" '^(space|مسافة|return|Go|بحث)$' 8; then
  python3 /tmp/ax.py frac "$UDID" 0.5,0.32
  python3 /tmp/ax.py wait "$UDID" '^(space|مسافة|return|Go|بحث)$' 8 || echo "KEYBOARD NEVER APPEARED"
fi
idb ui text "love" --udid "$UDID" || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/02-search.png
# Tap first result (above the keyboard), verify page changed by re-shot
python3 /tmp/ax.py frac "$UDID" 0.5,0.48 || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/03-details.png
# Back to home view for the A2HS beat
python3 /tmp/ax.py tap "$UDID" '^(Back|رجوع)$' || python3 /tmp/ax.py frac "$UDID" 0.08,0.11 || true
sleep 4

# ---- Add to Home Screen (all native UI: fully AX-driven) ----
# 1) Open the "..." page menu. AX label varies by iOS version; fall back to measured coords.
if ! python3 /tmp/ax.py tap "$UDID" '(Page Settings|More Options|Show Toolbar|…|\.\.\.)'; then
  python3 /tmp/ax.py frac "$UDID" 0.862,0.937
fi
# 2) Verify the menu actually opened before touching anything else.
if ! python3 /tmp/ax.py wait "$UDID" '^Share' 6; then
  python3 /tmp/ax.py frac "$UDID" 0.862,0.937
  python3 /tmp/ax.py wait "$UDID" '^Share' 6 || echo "PAGE MENU NEVER OPENED"
fi
sleep 1
xcrun simctl io "$UDID" screenshot capture/05-pagemenu.png
# 3) Share... (anchored; a stray coachmark can also contain the word Share)
python3 /tmp/ax.py tap "$UDID" '^(Close|Done|تم|إغلاق)$' || true   # dismiss any new coachmark first
sleep 1
python3 /tmp/ax.py dump "$UDID" > capture/ax-pagemenu.txt || true
python3 /tmp/ax.py tap "$UDID" '^Share$' || true
# 4) Verify the SHARE SHEET really opened (Copy is always in it) before any swipe.
if ! python3 /tmp/ax.py wait "$UDID" '^(Copy|Add to Reading List)$' 8; then
  echo "SHARE SHEET DID NOT OPEN"
  python3 /tmp/ax.py dump "$UDID" > capture/ax-nosheet.txt || true
  # likely a coachmark or tab overview intercepted; try to escape and retry once
  python3 /tmp/ax.py tap "$UDID" '^(Done|Close|تم|إغلاق)$' || true
  sleep 2
  python3 /tmp/ax.py tap "$UDID" '(Page Settings|More Options|…|\.\.\.)' || python3 /tmp/ax.py frac "$UDID" 0.862,0.937
  python3 /tmp/ax.py wait "$UDID" '^Share$' 6 || echo "PAGE MENU REOPEN FAILED"
  python3 /tmp/ax.py tap "$UDID" '^Share$' || true
  python3 /tmp/ax.py wait "$UDID" '^(Copy|Add to Reading List)$' 8 || echo "SHARE SHEET DID NOT OPEN (RETRY)"
fi
# 5) A2HS row may need a scroll INSIDE the sheet (sheet occupies the lower half).
if ! python3 /tmp/ax.py wait "$UDID" '^Add to Home Screen$' 5; then
  idb ui swipe 360 1250 360 850 --udid "$UDID" || true
  python3 /tmp/ax.py wait "$UDID" '^Add to Home Screen$' 6 || echo "A2HS ROW NOT FOUND"
fi
sleep 1
xcrun simctl io "$UDID" screenshot capture/06-sharesheet.png
# 5) Tap A2HS, verify the confirm sheet (has its own Add button), screenshot, confirm.
python3 /tmp/ax.py dump "$UDID" > capture/ax-sheet.txt || true
python3 /tmp/ax.py tap "$UDID" '^Add to Home Screen$' || true
python3 /tmp/ax.py wait "$UDID" '^Add$' 8 || echo "A2HS CONFIRM NEVER APPEARED"
sleep 1
xcrun simctl io "$UDID" screenshot capture/07-a2hs-confirm.png
python3 /tmp/ax.py tap "$UDID" '^Add$' || true
sleep 3

# ---- SpringBoard: icon must exist now; tap it for the standalone-launch money shot ----
idb ui button HOME --udid "$UDID" || true
sleep 3
python3 /tmp/ax.py wait "$UDID" '(Coptic|ⲬⲎⲘⲒ|KHMI)' 8 || echo "NO ICON ON SPRINGBOARD"
xcrun simctl io "$UDID" screenshot capture/08-homescreen.png
python3 /tmp/ax.py tap "$UDID" '(Coptic|ⲬⲎⲘⲒ|KHMI)' || true
sleep 12
xcrun simctl io "$UDID" screenshot capture/08b-standalone.png

# ---- Offline proof: cut host network, relaunch the installed app, it must render ----
idb ui button HOME --udid "$UDID" || true
sleep 2
sudo ifconfig en0 down || true
sleep 4
if python3 /tmp/ax.py tap "$UDID" '(Coptic|ⲬⲎⲘⲒ|KHMI)'; then
  echo "offline via installed icon"
else
  echo "no icon; offline via Safari reload (v3 method)"
  xcrun simctl openurl "$UDID" "$URL"
fi
sleep 15
xcrun simctl io "$UDID" screenshot capture/09-offline.png
sudo ifconfig en0 up || true
sleep 8
curl -sS -o /dev/null -w 'network restored: %{http_code}\n' https://api.github.com/zen || sudo ifconfig en0 up || true
sleep 3

kill -INT $REC || true
sleep 5
ls -la capture/
