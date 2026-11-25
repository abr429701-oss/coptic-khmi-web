#!/usr/bin/env bash
# Real iOS Simulator capture: Safari opens the LIVE deployed PWA, A2HS attempt, offline demo.
set -x
mkdir -p capture
URL="${LIVE_URL:-https://abr429701-oss.github.io/coptic-khmi-web/}"

DT=$(xcrun simctl list devicetypes | sed -n 's/.*\(iPhone [0-9][0-9A-Za-z ]*\) (.*/\1/p' | grep -vi 'se\|mini' | sort -V | tail -1)
echo "Device type: $DT"
UDID=$(xcrun simctl create demo-iphone "$DT")
xcrun simctl boot "$UDID"
open -a Simulator
sleep 25

# idb for UI taps/typing (best effort)
python3 -m pip install --user fb-idb || true
PYBIN=$(python3 -c "import sysconfig; print(sysconfig.get_path('scripts'))" 2>/dev/null)
export PATH="$PYBIN:$HOME/Library/Python/3.9/bin:$PATH"
(brew install idb-companion >/dev/null 2>&1 || brew install facebook/fb/idb-companion >/dev/null 2>&1) || true
idb_companion --udid "$UDID" >/dev/null 2>&1 &
sleep 12
idb list-targets || true

# Open the LIVE app in real Safari on the simulator
xcrun simctl openurl "$UDID" "$URL"
sleep 35
xcrun simctl io "$UDID" screenshot capture/01-home-online.png

xcrun simctl io "$UDID" recordVideo --codec h264 capture/demo.mov &
REC=$!
sleep 2

# Search flow (coordinates in points on a ~393x852 device; verified via screenshots)
idb ui tap 196 180 --udid "$UDID" || true
sleep 3
idb ui text "love" --udid "$UDID" || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/02-search.png
idb ui tap 196 430 --udid "$UDID" || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/03-details.png

# Add to Home Screen attempt: share button (bottom center), sheet, A2HS row, Add
idb ui tap 196 800 --udid "$UDID" || true
sleep 4
xcrun simctl io "$UDID" screenshot capture/05-sharesheet.png
idb ui swipe 196 600 196 350 --udid "$UDID" || true
sleep 3
xcrun simctl io "$UDID" screenshot capture/06-sharesheet-scrolled.png
idb ui tap 196 620 --udid "$UDID" || true   # A2HS row guess
sleep 4
xcrun simctl io "$UDID" screenshot capture/07-a2hs-confirm.png
idb ui tap 350 70 --udid "$UDID" || true    # Add button top-right
sleep 4
idb ui button HOME --udid "$UDID" || true
sleep 3
xcrun simctl io "$UDID" screenshot capture/08-homescreen.png
# Relaunch from home screen icon if present: tap where the icon lands (last home screen slot guess)
xcrun simctl openurl "$UDID" "$URL"
sleep 12

# Offline demo: cut host network (simulator shares it), reload, app must render from SW
sudo ifconfig en0 down || true
sleep 4
xcrun simctl openurl "$UDID" "$URL"
sleep 15
xcrun simctl io "$UDID" screenshot capture/09-offline.png
sudo ifconfig en0 up || true
sleep 10
curl -sS -o /dev/null -w 'network restored: %{http_code}\n' https://api.github.com/zen || sudo ifconfig en0 up || true
sleep 5

kill -INT $REC || true
sleep 5
ls -la capture/