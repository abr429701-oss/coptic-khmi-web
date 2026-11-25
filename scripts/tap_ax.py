#!/usr/bin/env python3
"""AX-driven iOS Simulator interaction via idb.
Subcommands:
  find  <udid> <regex>          -> print "x y" center of first AX match; exit 1 if none
  tap   <udid> <regex>          -> find + tap; exit 1 if none
  wait  <udid> <regex> <sec>    -> poll until match appears; exit 1 on timeout
  absent <udid> <regex> <sec>   -> poll until no match; exit 1 on timeout
  frac  <udid> <fx>,<fy>        -> tap at screen fraction
  dump  <udid>                  -> print all AX labels (debug)
"""
import json, re, subprocess, sys, time

def dump(udid):
    for _ in range(3):
        out = subprocess.run(["idb", "ui", "describe-all", "--udid", udid],
                             capture_output=True, text=True).stdout
        try:
            return json.loads(out)
        except Exception:
            time.sleep(2)
    return None

def walk(node, out):
    if isinstance(node, dict):
        out.append(node)
        for v in node.values():
            walk(v, out)
    elif isinstance(node, list):
        for v in node:
            walk(v, out)

def nodes(udid):
    data = dump(udid)
    if data is None:
        return []
    ns = []
    walk(data, ns)
    return [n for n in ns if isinstance(n, dict)]

def screen_size(ns):
    for n in ns:
        f = n.get("frame") or n.get("AXFrame")
        if isinstance(f, dict) and f.get("width", 0) > 400:
            return f["width"], f["height"]
    return None

def find(ns, pat):
    rx = re.compile(pat, re.I)
    for n in ns:
        f = n.get("frame") or n.get("AXFrame")
        if not isinstance(f, dict) or not f.get("width"):
            continue
        label = " ".join(str(n.get(k, "")) for k in
                         ("label", "value", "title", "name", "identifier", "placeholderValue"))
        if rx.search(label):
            return f["x"] + f["width"] / 2, f["y"] + f["height"] / 2, label
    return None

def tap_xy(udid, x, y):
    print(f"tap {int(x)} {int(y)}")
    subprocess.run(["idb", "ui", "tap", str(int(x)), str(int(y)), "--udid", udid])

cmd = sys.argv[1]
udid = sys.argv[2]

if cmd == "dump":
    for n in nodes(udid):
        label = " ".join(str(n.get(k, "")) for k in ("label", "value", "title", "name", "identifier"))
        f = n.get("frame") or n.get("AXFrame") or {}
        if label.strip():
            print(f"{label[:60]!r} @ {f.get('x')},{f.get('y')} {f.get('width')}x{f.get('height')}")
    sys.exit(0)

if cmd == "frac":
    ns = nodes(udid)
    ss = screen_size(ns)
    if not ss:
        print("no screen size"); sys.exit(1)
    W, H = ss
    fx, fy = (float(v) for v in sys.argv[3].split(","))
    tap_xy(udid, W * fx, H * fy)
    sys.exit(0)

pat = sys.argv[3]

if cmd == "find":
    m = find(nodes(udid), pat)
    if m:
        print(f"matched: {m[2][:80]}")
        print(f"{int(m[0])} {int(m[1])}")
        sys.exit(0)
    print("no match"); sys.exit(1)

if cmd == "tap":
    m = find(nodes(udid), pat)
    if m:
        print(f"matched: {m[2][:80]}")
        tap_xy(udid, m[0], m[1]); sys.exit(0)
    print("no match"); sys.exit(1)

if cmd == "wait":
    deadline = time.time() + float(sys.argv[4])
    while time.time() < deadline:
        m = find(nodes(udid), pat)
        if m:
            print(f"matched: {m[2][:80]}")
            print(f"{int(m[0])} {int(m[1])}")
            sys.exit(0)
        time.sleep(1.5)
    print("timeout waiting for", pat); sys.exit(1)

if cmd == "absent":
    deadline = time.time() + float(sys.argv[4])
    while time.time() < deadline:
        if not find(nodes(udid), pat):
            print("absent confirmed"); sys.exit(0)
        time.sleep(1.5)
    print("still present:", pat); sys.exit(1)

sys.exit(2)
