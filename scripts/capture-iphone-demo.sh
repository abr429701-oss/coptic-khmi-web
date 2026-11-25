#!/usr/bin/env bash
# Real iOS Simulator capture: Safari loads the locally served PWA, then offline demo.
set -x
mkdir -p capture

DT=$(xcrun simctl list devicetypes | sed -n 's/.*\(iPhone [0-9][0-9A-Za-z ]*\) (.*/\1/p' | grep -vi 'se\|mini' | sort -V | tail -1)
echo "Device type: $DT"
UDID=$(xcrun simctl create demo-iphone "$DT")
echo "UDID: $UDID"
xcrun simctl boot "$UDID"
open -a Simulator
sleep 25

# Serve the PWA locally (localhost = secure context, service worker works)
(cd srv && python3 -m http.server 8080 >/dev/null 2>&1 &)
sleep 3
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/coptic-khmi-web/

# idb for UI taps/typing (best effort)
python3 -m pip install --user fb-idb || true
PYBIN=$(python3 -c "import sysconfig; print(sysconfig.get_path('scripts'))" 2>/dev/null)
export PATH="$PYBIN:$HOME/Library/Python/3.9/bin:$PATH"
(brew install idb-companion >/dev/null 2>&1 || brew install facebook/fb/idb-companion >/dev/null 2>&1) || true
idb_companion --udid "$UDID" >/dev/null 2>&1 &
sleep 12
idb list-targets || true

# Open the app in real Safari on the simulator
xcrun simctl openurl "$UDID" "http://localhost:8080/coptic-khmi-web/"
sleep 30
xcrun simctl io "$UDID" screenshot capture/01-home.png

xcrun simctl io "$UDID" recordVideo capture/demo.mov &
REC=$!
sleep 2

# Interact: tap search field near top, type, open result (coordinates in points, verified via screenshots)
idb ui tap 196 180 --udid "$UDID" || true
sleep 3
idb ui text "love" --udid "$UDID" || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/02-search.png
idb ui tap 196 430 --udid "$UDID" || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/03-details.png

# Offline demo: kill the local server, reload, app should still render from the service worker
pkill -f "http.server 8080" || true
sleep 3
xcrun simctl openurl "$UDID" "http://localhost:8080/coptic-khmi-web/"
sleep 15
xcrun simctl io "$UDID" screenshot capture/04-offline.png

kill -INT $REC || true
sleep 5
ls -la capture/