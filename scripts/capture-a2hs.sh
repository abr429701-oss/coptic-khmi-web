#!/usr/bin/env bash
# v21: state-driven (Vision OCR) A2HS capture. Warm up first-run Safari overlays BEFORE recording.
set -x
mkdir -p capture
URL="${LIVE_URL:-https://abr429701-oss.github.io/coptic-khmi-web/}"
finish() { [ -n "$REC" ] && kill -INT $REC 2>/dev/null && wait $REC 2>/dev/null; sudo ifconfig en0 up 2>/dev/null || true; sleep 3; }
REC=""
swiftc -O scripts/ocr.swift -o /tmp/ocr 2>&1 | tail -5
DT=$(xcrun simctl list devicetypes | sed -n 's/.*\(iPhone [0-9][0-9A-Za-z ]*\) (.*/\1/p' | grep -vi 'se\|mini' | sort -V | tail -1)
echo "Device type: $DT" | tee capture/RESULT.txt
UDID=$(xcrun simctl create demo-iphone "$DT")
xcrun simctl boot "$UDID"; open -a Simulator; sleep 20
python3 -m venv /tmp/idbenv; /tmp/idbenv/bin/pip -q install fb-idb || true
export PATH=/tmp/idbenv/bin:$PATH
brew install idb-companion >/dev/null 2>&1 || brew install facebook/fb/idb-companion >/dev/null 2>&1 || true
idb_companion --udid "$UDID" >/dev/null 2>&1 &
sleep 10
xcrun simctl openurl "$UDID" "$URL"
sleep 45
python3 scripts/drive_a2hs.py "$UDID" warmup
grep -q WARMUP_CLEAN capture/RESULT.txt || { echo "BLOCKED at warmup" | tee -a capture/RESULT.txt; exit 0; }
xcrun simctl io "$UDID" recordVideo --codec h264 capture/a2hs.mov &
REC=$!
sleep 3
python3 scripts/drive_a2hs.py "$UDID" install
grep -q ADD_TAPPED capture/RESULT.txt || { echo "BLOCKED at install" | tee -a capture/RESULT.txt; finish; exit 0; }
python3 scripts/drive_a2hs.py "$UDID" launch
grep -q ICON_ON_HOME_SCREEN capture/RESULT.txt || { finish; exit 0; }
sleep 60
sudo ifconfig en0 down || true
sleep 4
python3 scripts/drive_a2hs.py "$UDID" offline
finish
