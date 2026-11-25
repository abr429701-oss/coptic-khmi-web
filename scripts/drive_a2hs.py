#!/usr/bin/env python3
"""State-driven Safari A2HS driver (iOS Simulator). Every action follows an OCR-classified screen.
Unknown state => save evidence and stop. usage: drive_a2hs.py UDID"""
import subprocess, sys, time, re, os, json
UDID = sys.argv[1]
CAP = "capture"
os.makedirs(CAP, exist_ok=True)
LOG = open(f"{CAP}/driver-log.txt", "a")
def log(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); LOG.write(s + "\n"); LOG.flush()
def sh(cmd): return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout
n = [0]
def snap(tag):
    n[0] += 1
    p = f"{CAP}/s{n[0]:02d}-{tag}.png"
    subprocess.run(["xcrun", "simctl", "io", UDID, "screenshot", p], capture_output=True)
    out = sh(f"/tmp/ocr {p}")
    lines = []
    for l in out.splitlines():
        parts = l.split("\t")
        if len(parts) == 3:
            lines.append((int(parts[0]), int(parts[1]), parts[2]))
    open(p.replace(".png", ".txt"), "w").write("\n".join(f"{x},{y} {t}" for x, y, t in lines))
    return p, lines
def tap(x, y, dur=0.15, wait=3):
    log("tap", x, y)
    subprocess.run(["idb", "ui", "tap", str(int(x)), str(int(y)), "--duration", str(dur), "--udid", UDID], capture_output=True)
    time.sleep(wait)
def swipe_up():
    log("swipe up")
    subprocess.run(["idb", "ui", "swipe", "220", "800", "220", "300", "--duration", "0.4", "--udid", UDID], capture_output=True)
    time.sleep(3)
def find(lines, pat):
    rx = re.compile(pat, re.I)
    for x, y, t in lines:
        if rx.search(t): return x, y, t
    return None
def has(lines, pat): return find(lines, pat) is not None
def classify(lines):
    T = " | ".join(t for _, _, t in lines)
    if has(lines, r"abr429701.*github|Dictionary") and has(lines, r"\d:\d\d") and False: pass
    if has(lines, r"personalized|Speed up your typing") and has(lines, r"Continue$"): return "continue_modal"
    if has(lines, r"Open as Web App"): return "a2hs_confirm"
    if has(lines, r"Add to Home Screen") and has(lines, r"(^|\s)Add$") and not has(lines, r"Edit Actions"): return "a2hs_confirm"
    if has(lines, r"Edit Actions") and has(lines, r"Add to Home Screen"): return "share_expanded"
    if has(lines, r"View More$") and has(lines, r"Copy$"): return "share_collapsed"
    if has(lines, r"Add to Bookmarks") and has(lines, r"(^|\s)Share$") and has(lines, r"New Private Tab|All Tabs"): return "menu_open"
    if has(lines, r"View Bookmarks|Share Menu, and Open"): return "coachmark"
    if has(lines, r"Quickly Access All Tabs|^Private$") and has(lines, r"Tab"): return "tab_overview"
    if has(lines, r"Search or enter website|qwertyuiop") : return "keyboard_url"
    if has(lines, r"Photos") and has(lines, r"Settings"): return "springboard"
    if has(lines, r"abr429701-oss\.github\.io"): return "safari_page"
    if has(lines, r"Coptic Dictionary|القاموس|جاهزة|خمي|ⲭⲏⲙⲓ"): return "app_page"
    return "unknown"
def stop(msg, tag="STOP"):
    log("STOP:", msg); open(f"{CAP}/RESULT.txt", "a").write(f"STOPPED_UNKNOWN_STATE: {msg}\n"); sys.exit(0)
def settle_state(tag, tries=3):
    for _ in range(tries):
        p, lines = snap(tag); st = classify(lines); log("state", st, p)
        if st != "unknown": return st, lines, p
        time.sleep(3)
    return "unknown", lines, p
MODE = sys.argv[2] if len(sys.argv) > 2 else "install"
if MODE == "warmup":
    clean = 0
    for i in range(14):
        st, lines, p = settle_state("warm")
        if st == "coachmark": tap(400, 707)
        elif st == "continue_modal": tap(*find(lines, r"Continue$")[:2])
        elif st in ("keyboard_url", "tab_overview"): stop(f"warmup unexpected {st}")
        elif st in ("safari_page", "app_page"):
            clean += 1
            if clean >= 3: log("CLEAN"); open(f"{CAP}/RESULT.txt", "a").write("WARMUP_CLEAN\n"); sys.exit(0)
            time.sleep(4)
        else: stop(f"warmup state {st}")
    stop("warmup never reached a clean page")
if MODE == "install":
    menu_attempts = 0
    for i in range(30):
        st, lines, p = settle_state("inst")
        if st in ("safari_page", "app_page"):
            menu_attempts += 1
            if menu_attempts > 1: stop("page menu not opened after ONE tap and 60s observation (see timeline stills)")
            t0 = time.time()
            tap(378, 894, wait=0.5)
            seen = None
            for k in range(16):                 # observe up to ~60s, NO second tap
                p, ls2 = snap(f"menuobs{k:02d}"); s2 = classify(ls2)
                log("menuobs", k, "t+%.1fs" % (time.time() - t0), s2)
                if s2 not in ("safari_page", "app_page"): seen = s2; break
                time.sleep(2.5)
            if seen is None:
                sh(f"idb ui describe-all --udid {UDID} > {CAP}/menuobs-ax.json 2>&1")
                stop("page menu unchanged for 60s after one tap (input ignored or wrong target)")
            continue
        elif st == "tab_overview": stop("unexpected tab overview (no verified Done text; not recovering)")
        elif st == "menu_open": tap(*find(lines, r"(^|\s)Share$")[:2], wait=4)
        elif st == "share_collapsed": swipe_up()
        elif st == "share_expanded": tap(*find(lines, r"Add to Home Screen")[:2], wait=7)
        elif st == "continue_modal": tap(*find(lines, r"Continue$")[:2])
        elif st == "coachmark": tap(400, 707)
        elif st == "a2hs_confirm":
            a = find(lines, r"(^|\s)Add$")
            if not a: time.sleep(3); continue    # still loading
            time.sleep(3)
            tap(a[0], a[1], wait=6)
            p, lines = snap("after-add"); st2 = classify(lines); log("after add", st2)
            open(f"{CAP}/RESULT.txt", "a").write("ADD_TAPPED\n"); break
        else: stop(f"install state {st}")
    else: stop("install loop exhausted")

def go_home():
    subprocess.run(["idb", "ui", "button", "HOME", "--udid", UDID], capture_output=True); time.sleep(4)
def launch_icon(tag):
    go_home()
    st, lines, p = settle_state(tag + "-home")
    if st != "springboard": stop(f"expected springboard, got {st}")
    ic = find(lines, r"coptic")
    if not ic: stop("web clip label 'coptic' not on Home Screen (see pixels)")
    open(f"{CAP}/RESULT.txt", "a").write("ICON_ON_HOME_SCREEN\n")
    tap(ic[0], ic[1] - 45, wait=15)
    p, lines = snap(tag + "-launched")
    bar = has(lines, r"abr429701-oss\.github\.io")
    open(f"{CAP}/RESULT.txt", "a").write(("LAUNCHED_BUT_SAFARI_BAR_TEXT_PRESENT\n" if bar else "LAUNCHED_NO_SAFARI_ADDRESS_BAR_TEXT\n"))
    log("launched; classify", classify(lines), "bar_text", bar)
if MODE == "launch": launch_icon("launch")
if MODE == "offline":
    sh("xcrun simctl terminate %s com.apple.webapp" % UDID)
    launch_icon("offline")
    time.sleep(5)
    snap("offline-ready")
    tap(41, 105, wait=4); snap("offline-drawer")
