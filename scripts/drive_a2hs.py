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
    for attempt in range(2):
        tap(ic[0], ic[1] - 45, wait=15)
        for k in range(8):
            p, lines = snap(f"{tag}-launched{attempt}-{k}"); st = classify(lines)
            log("launch observe", attempt, k, st)
            if st != "springboard": break
            time.sleep(4)
        if st != "springboard": break
        log("still SpringBoard 45s after tap; ONE retap (launch only)")
    if st == "springboard": stop("icon tap did not leave SpringBoard after one retap")
    if st != "app_page": stop(f"after launch state is {st}, not app content")
    bar = has(lines, r"abr429701-oss\.github\.io|Reload|Safari")
    open(f"{CAP}/RESULT.txt", "a").write(("LAUNCHED_BUT_SAFARI_TEXT_PRESENT\n" if bar else "LAUNCHED_APP_CONTENT_NO_SAFARI_TEXT\n"))
    return lines

def sig(lines): return set(t for _, _, t in lines)
def changed(a, b):
    A, B = sig(a), sig(b)
    return len(A ^ B) > max(3, 0.25 * max(len(A | B), 1))
def key_return():
    subprocess.run(["idb", "ui", "key", "40", "--udid", UDID], capture_output=True); time.sleep(2)
def feature_proof(tag, book_idx, chap_idx, query):
    R = lambda m: open(f"{CAP}/RESULT.txt", "a").write(f"{tag.upper()}_{m}\n")
    p, base = snap(tag + "-f0-base")
    if classify(base) != "app_page": stop("app content not visible before feature taps")
    tap(200, 327, wait=4)
    subprocess.run(["idb", "ui", "text", query, "--udid", UDID], capture_output=True); time.sleep(8)
    p, s1 = snap(tag + "-f1-search-typed")
    log("OCR search", [t for _, _, t in s1][:60])
    if changed(base, s1): R("SEARCH_SCREEN_CHANGED_CHECK_PIXELS")
    else: R("SEARCH_NO_VISIBLE_CHANGE")
    p, s1b = snap(tag + "-f1b-search-results")
    key_return(); p, s1c = snap(tag + "-f1c-after-return")
    tap(357, 323, wait=8)
    p, s2 = snap(tag + "-f2-bible-button")
    log("OCR bible", [t for _, _, t in s2][:60])
    if not changed(s1c, s2): stop("Bible button tap produced no visible change")
    R("BIBLE_SCREEN_OPENED")
    cands = [l for l in s2 if 330 < l[1] < 850 and l[0] > 20 and l[2] not in sig(s1c) and len(l[2]) >= 2]
    log("book candidates", cands[:12])
    if len(cands) <= book_idx: stop("no book candidate lines")
    b = cands[book_idx]; tap(b[0], b[1], wait=8)
    p, s3 = snap(tag + "-f3-book"); log("OCR book", [t for _, _, t in s3][:60])
    if not changed(s2, s3): stop("book tap produced no visible change")
    R("BOOK_OPENED")
    nums = [l for l in s3 if re.fullmatch(r"\d{1,3}", l[2]) and 330 < l[1] < 850]
    log("chapter candidates", nums[:20])
    if len(nums) <= chap_idx: stop("no chapter number candidates")
    c = nums[chap_idx]; tap(c[0], c[1], wait=8)
    p, s4 = snap(tag + "-f4-chapter"); log("OCR chapter", [t for _, _, t in s4][:80])
    if not changed(s3, s4): stop("chapter tap produced no visible change")
    R("CHAPTER_OPENED")
    swipe_up(); snap(tag + "-f5-chapter-scrolled")

if MODE == "baseline":
    sh("xcrun simctl openurl %s https://example.com" % UDID); time.sleep(15)
    snap("net-sim-safari-example"); go_home()
if MODE == "launch":
    lines = launch_icon("launch")
    feature_proof("online", 0, 0, "love")
if MODE == "offline":
    log("terminate", sh("xcrun simctl terminate %s com.apple.webapp 2>&1" % UDID))
    sh("xcrun simctl openurl %s https://example.com" % UDID); time.sleep(15)
    snap("net-sim-safari-example-offline")
    lines = launch_icon("offline", press_home=True)
    time.sleep(5)
    feature_proof("offline", 3, 2, "water")
