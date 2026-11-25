#!/usr/bin/env python3
"""Tap a UI element in an iOS Simulator via idb, by accessibility label regex or screen fraction."""
import json, re, subprocess, sys

udid, mode, arg = sys.argv[1], sys.argv[2], sys.argv[3]

def dump():
    import time
    for _ in range(3):
        out = subprocess.run(["idb", "ui", "describe-all", "--udid", udid], capture_output=True, text=True).stdout
        try:
            return json.loads(out)
        except Exception:
            time.sleep(2)
    return None

def tap(x, y):
    print(f"tap {x} {y}")
    subprocess.run(["idb", "ui", "tap", str(int(x)), str(int(y)), "--udid", udid])

def walk(node, out):
    if isinstance(node, dict):
        out.append(node)
        for v in node.values():
            walk(v, out)
    elif isinstance(node, list):
        for v in node:
            walk(v, out)

data = dump()
if data is None:
    print("AX dump unavailable")
    sys.exit(1)
nodes = []
walk(data, nodes)
frames = [n.get("frame") or n.get("AXFrame") for n in nodes if isinstance(n, dict)]
frames = [f for f in frames if isinstance(f, dict) and f.get("width", 0) > 400]
if not frames:
    print("no root frame")
    sys.exit(1)
W = frames[0]["width"]; H = frames[0]["height"]
print(f"screen points: {W}x{H}")

if mode == "frac":
    fx, fy = (float(x) for x in arg.split(","))
    tap(W * fx, H * fy)
    sys.exit(0)

pat = re.compile(arg, re.I)
best = None
for n in nodes:
    if not isinstance(n, dict):
        continue
    f = n.get("frame") or n.get("AXFrame")
    if not isinstance(f, dict) or not f.get("width"):
        continue
    label = " ".join(str(n.get(k, "")) for k in ("label", "value", "title", "name", "identifier", "placeholderValue"))
    if pat.search(label):
        best = (f, label)
        break
if best:
    f, label = best
    print("matched:", label[:80])
    tap(f["x"] + f["width"] / 2, f["y"] + f["height"] / 2)
else:
    print("no AX match for", arg)
    sys.exit(1)