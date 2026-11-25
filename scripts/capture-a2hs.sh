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
finish; REC=""
cp capture/a2hs.mov capture/seg1-install.mov
cp capture/RESULT.txt capture/RESULT-after-install.txt
URLS="https://abr429701-oss.github.io/coptic-khmi-web/ https://drive.google.com/ https://docs.google.com/ https://docs.google.com/spreadsheets/d/1vCsh_P_kP-6oP0XstXvGfBwO9_TndB3GjV1HcllG8QY/edit https://coptic-app-notifications.abraammerzik56.workers.dev/ https://example.org/"
netcheck() { for u in $URLS; do echo "$1 $(curl -s -o /dev/null -m 8 -w '%{http_code}' "$u") $u"; done | tee -a capture/net-checks.txt; }
echo "scope: host-level curl to the app content hosts (404/302 online = reachable, 000 = no connection) plus an in-simulator Safari load of a unique example.org URL; simulator shares the Mac network" > capture/net-checks.txt
xcrun simctl io "$UDID" recordVideo --codec h264 capture/seg2-online.mov &
REC=$!
sleep 3
netcheck ONLINE_BASELINE
python3 scripts/drive_a2hs.py "$UDID" online2
finish; REC=""
grep -q OFFLINE_READY_CHIP_GREEN capture/RESULT.txt || { echo "NOT READY: skipping network cut" | tee -a capture/RESULT.txt; exit 0; }
cp capture/RESULT.txt capture/RESULT-after-online.txt
for i in $(ifconfig -l); do case $i in en*) sudo ifconfig $i down;; esac; done
sleep 8
ifconfig -a | grep -E '^en|status' >> capture/net-checks.txt
xcrun simctl io "$UDID" recordVideo --codec h264 capture/seg3-offline.mov &
REC=$!
sleep 3
netcheck OFFLINE_AFTER_CUT
python3 scripts/drive_a2hs.py "$UDID" simnet
python3 scripts/drive_a2hs.py "$UDID" offline2
finish
for i in $(ifconfig -l); do case $i in en*) sudo ifconfig $i up;; esac; done
