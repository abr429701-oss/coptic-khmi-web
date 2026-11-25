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
    if has(lines, r"Search$") and sum(has(lines, p) for p in (r"Files", r"Utilities", r"Preview", r"Fitness", r"Contacts", r"Watch", r"Calendar", r"Reminders")) >= 3: return "springboard"
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
    # every action once, then observe up to 60s for a state change; unchanged => stop with timeline
    ACTIONS = {
        "safari_page": lambda L: tap(378, 894, wait=0.5),
        "app_page": lambda L: tap(378, 894, wait=0.5),
        "menu_open": lambda L: tap(*find(L, r"(^|\s)Share$")[:2], wait=0.5),
        "share_collapsed": lambda L: swipe_up(),
        "share_expanded": lambda L: tap(*find(L, r"Add to Home Screen")[:2], wait=0.5),
        "continue_modal": lambda L: tap(*find(L, r"Continue$")[:2], wait=0.5),
        "coachmark": lambda L: tap(400, 707, wait=0.5),
    }
    last = None
    for i in range(30):
        st, lines, p = settle_state("inst")
        if st == last and st not in ("a2hs_confirm",): stop(f"state {st} unchanged after one action + 60s observation")
        if st == "a2hs_confirm":
            a = find(lines, r"(^|\s)Add$")
            if not a or not has(lines, r"Open as Web App"):
                time.sleep(5); last = None; continue          # still loading: observe, no tap
            tap(a[0], a[1], wait=6)
            p, lines = snap("after-add"); log("after add", classify(lines))
            open(f"{CAP}/RESULT.txt", "a").write("ADD_TAPPED\n"); break
        if st not in ACTIONS: stop(f"install state {st} (no action defined)")
        t0 = time.time()
        ACTIONS[st](lines)
        last = st
        for k in range(16):
            p, ls2 = snap(f"obs{i:02d}-{k:02d}"); s2 = classify(ls2)
            log("obs", i, k, "t+%.1fs" % (time.time() - t0), s2)
            if s2 != st: last = None; break
            time.sleep(2.5)
        else:
            stop(f"state {st} unchanged 60s after action (timeline stills obsNN)")
    else: stop("install loop exhausted")

def go_home():
    subprocess.run(["idb", "ui", "button", "HOME", "--udid", UDID], capture_output=True); time.sleep(4)
LABEL = r"XHM|XHU|xhui|ⲭⲏⲙⲓ|coptic"
def launch_icon(tag, press_home=False):
    if press_home: go_home()
    ic = None
    for attempt in range(4):
        st, lines, p = settle_state(f"{tag}-sb{attempt}")
        if st != "springboard": stop(f"expected springboard, got {st}")
        ic = find(lines, LABEL)
        if ic: break
        log("icon label not on this SpringBoard page; swiping to next page")
        subprocess.run(["idb", "ui", "swipe", "380", "500", "60", "500", "--duration", "0.3", "--udid", UDID], capture_output=True)
        time.sleep(4)
    if not ic: stop("web clip label (XHMI) not found on any SpringBoard page (see pixels)")
    open(f"{CAP}/RESULT.txt", "a").write("ICON_ON_HOME_SCREEN\n")
    tap(ic[0], ic[1] - 45, wait=15)
    p, lines = snap(tag + "-launched")
    bar = has(lines, r"abr429701-oss\.github\.io")
    open(f"{CAP}/RESULT.txt", "a").write(("LAUNCHED_BUT_SAFARI_BAR_TEXT_PRESENT\n" if bar else "LAUNCHED_NO_SAFARI_ADDRESS_BAR_TEXT\n"))
    log("launched; classify", classify(lines), "bar_text", bar)
def interact(tag):
    """OCR-gated: tap search field / Bible tab if their labels are visible; log every OCR line. No repeat taps."""
    p, lines = snap(tag + "-home")
    log("OCR", tag, [l[2] for l in lines][:60])
    if len(lines) < 4: stop("app content not visible (too little text)")
    sf = find(lines, r"بحث|search|ابحث")
    if sf:
        tap(sf[0], sf[1], wait=4)
        sh("idb ui text 'a' --udid %s" % UDID); time.sleep(5)
        p, l2 = snap(tag + "-search-typed")
        log("OCR search", [l[2] for l in l2][:60])
        open(f"{CAP}/RESULT.txt", "a").write(tag.upper() + "_SEARCH_TAPPED_AND_TYPED\n")
        go_home_keep = False
    else:
        log("no search label found", tag)
    p, l3 = snap(tag + "-end")
    bible = find(l3, r"الكتاب|المقدس|bible")
    if bible:
        tap(bible[0], bible[1], wait=6)
        p, l4 = snap(tag + "-bible")
        log("OCR bible", [l[2] for l in l4][:60])
        open(f"{CAP}/RESULT.txt", "a").write(tag.upper() + "_BIBLE_TAPPED\n")
    else:
        log("no bible label found", tag)
if MODE == "launch":
    launch_icon("launch")
    r = open(f"{CAP}/RESULT.txt").read()
    # true standalone check: content visible AND no Safari chrome words
    p, lines = snap("launch-standalone")
    chrome = has(lines, r"abr429701-oss|Safari|Reload|AA$")
    open(f"{CAP}/RESULT.txt", "a").write("STANDALONE_CHROME_TEXT_PRESENT\n" if chrome else "STANDALONE_NO_CHROME_TEXT_CHECK_PIXELS\n")
    interact("online")
if MODE == "offline":
    log("terminate", sh("xcrun simctl terminate %s com.apple.webapp 2>&1" % UDID))
    launch_icon("offline", press_home=True)
    time.sleep(8)
    interact("offline")
