#!/usr/bin/env bash
# Real iOS Simulator capture v3: Safari opens the LIVE PWA; AX-driven interactions via idb (venv install).
set -x
mkdir -p capture
URL="${LIVE_URL:-https://abr429701-oss.github.io/coptic-khmi-web/}"
cp scripts/tap_ax.py /tmp/tap_ax.py

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
sleep 30
xcrun simctl io "$UDID" screenshot capture/01-home-online.png

# Dismiss Safari's first-run onboarding popup if present (Close X)
python3 /tmp/tap_ax.py "$UDID" label '^(Close|إغلاق)$' || python3 /tmp/tap_ax.py "$UDID" frac 0.90,0.75 || true
sleep 2

xcrun simctl io "$UDID" recordVideo --codec h264 capture/demo.mov &
REC=$!
sleep 2

# Search flow: tap search field by placeholder label, type, open first result
python3 /tmp/tap_ax.py "$UDID" label 'search|بحث' || python3 /tmp/tap_ax.py "$UDID" frac 0.55,0.23 || true
sleep 3
idb ui text "love" --udid "$UDID" || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/02-search.png
python3 /tmp/tap_ax.py "$UDID" frac 0.5,0.5 || true
sleep 8
xcrun simctl io "$UDID" screenshot capture/03-details.png
idb ui button HOME --udid "$UDID" || true
sleep 2
xcrun simctl openurl "$UDID" "$URL"
sleep 8

# Add to Home Screen via real Safari share sheet (best effort, AX-driven)
python3 /tmp/tap_ax.py "$UDID" label '^(Share|مشاركة)$' || python3 /tmp/tap_ax.py "$UDID" frac 0.5,0.96 || true
sleep 4
xcrun simctl io "$UDID" screenshot capture/05-sharesheet.png
python3 /tmp/tap_ax.py "$UDID" label 'Add to Home|إضافة إلى الشاشة' || python3 /tmp/tap_ax.py "$UDID" frac 0.5,0.78 || true
sleep 4
xcrun simctl io "$UDID" screenshot capture/06-a2hs-sheet.png
python3 /tmp/tap_ax.py "$UDID" label '^(Add|إضافة)$' || python3 /tmp/tap_ax.py "$UDID" frac 0.9,0.08 || true
sleep 4
idb ui button HOME --udid "$UDID" || true
sleep 3
xcrun simctl io "$UDID" screenshot capture/08-homescreen.png
xcrun simctl openurl "$UDID" "$URL"
sleep 10

# Offline demo: cut host network, reload; app must render from the service worker
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