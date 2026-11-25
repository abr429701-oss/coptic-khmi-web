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

def key_return():
    subprocess.run(["idb", "ui", "key", "40", "--udid", UDID], capture_output=True); time.sleep(2)
def sig(lines): return set(t for _, _, t in lines)
def changed(a, b):
    A, B = sig(a), sig(b)
    return len(A ^ B) > max(3, 0.25 * max(len(A | B), 1))
def R(m): open(f"{CAP}/RESULT.txt", "a").write(m + "\n")
def texts(lines): return [t for _, _, t in lines]
def snapd(tag):
    """snap; if the OS notification-permission dialog is up, tap Don't Allow ONCE, then re-snap."""
    p, lines = snap(tag)
    if has(lines, r"Would Like to Send|Send You\s*Notif"):
        d = find(lines, r"Don.?t Allow")
        log("notification dialog up; tapping Don't Allow once", d)
        if d:
            tap(d[0], d[1], wait=4); R("NOTIFICATION_DIALOG_DISMISSED_DONT_ALLOW")
            p, lines = snap(tag + "-after-dialog")
        else: stop("notification dialog but no Don't Allow label found")
    return p, lines
def green_count(p, box=(420, 1080, 900, 1230)):
    out = sh("/tmp/ocr %s green %d %d %d %d" % ((p,) + box)).strip()
    try: return int(out)
    except: return -1
def wait_ready(maxsec=360):
    t0 = time.time()
    while time.time() - t0 < maxsec:
        p, lines = snapd("ready-check")
        gc = green_count(p); log("ready check green px", gc, "t+%ds" % (time.time() - t0))
        if gc > 300: R("OFFLINE_READY_CHIP_GREEN_AFTER_%ds" % (time.time() - t0)); return True
        time.sleep(20)
    R("OFFLINE_READY_NOT_REACHED"); stop("ready-offline chip not green within wait")
EN_RX = r"November|Wed|Thu|Fri|Sat|Sun|Mon|Tue|Hator|Coptic Dictionary"
def ensure_english(tag):
    for k in range(3):
        p, lines = snapd(f"{tag}-lang{k}")
        if has(lines, r"November|Nov|Wed|WED"): R("UI_ENGLISH"); return lines
        log("not English yet; tapping AB language toggle once", k)
        tap(357, 323, wait=6)
    stop("could not reach English UI via AB toggle")
def search_proof(tag, query):
    p, base = snapd(tag + "-search-base")
    tap(200, 327, wait=4)
    subprocess.run(["idb", "ui", "text", query, "--udid", UDID], capture_output=True); time.sleep(10)
    p, s1 = snapd(tag + "-search-typed")
    time.sleep(10); p, s2 = snapd(tag + "-search-results")
    log("OCR search", texts(s2)[:80])
    rows = [l for l in s2 if 400 < l[1] < 800 and l[2].lower() != query]
    if len(rows) >= 2: R(tag.upper() + "_SEARCH_RESULT_ROWS_OCR_%d" % len(rows))
    else: R(tag.upper() + "_SEARCH_NO_RESULT_ROWS_FOUND"); log("no result rows in OCR; check pixels")
    key_return(); snapd(tag + "-search-after-return")
def bible_proof(tag, book, chap_tap=None):
    tap(41, 105, wait=5)
    p, l1 = snapd(tag + "-drawer"); log("OCR drawer", texts(l1)[:60])
    b = find(l1, r"Holy Bible|Coptic Holy Bible|Bible")
    if not b: stop("drawer open but no Bible label in OCR (see pixels)")
    R(tag.upper() + "_DRAWER_BIBLE_LABEL_FOUND")
    tap(b[0], b[1], wait=10)
    p, l2 = snapd(tag + "-bible-screen"); log("OCR bible screen", texts(l2)[:80])
    if not has(l2, r"Old Testament|New Testament|Genesis|Holy Bible"): stop("Bible screen labels not seen")
    R(tag.upper() + "_BIBLE_SCREEN_LABELS_SEEN")
    found = None
    for k in range(5):
        found = find(l2, r"^" + book + r"\b|\b" + book + r"$|" + book)
        if found: break
        swipe_up(); p, l2 = snapd(tag + "-bible-scroll%d" % k)
    if not found: stop("book %s not found in OCR" % book)
    tap(found[0], found[1], wait=8)
    p, l3 = snapd(tag + "-book-opened"); log("OCR book", texts(l3)[:80])
    if not changed(l2, l3): stop("book tap produced no visible change")
    R(tag.upper() + "_BOOK_OPENED_" + book)
    if chap_tap:
        c = find(l3, r"^%s$" % chap_tap)
        if c: tap(c[0], c[1], wait=8); p, l4 = snapd(tag + "-chapter"); log("OCR chapter", texts(l4)[:80]); R(tag.upper() + "_CHAPTER_TAPPED_" + chap_tap)
    time.sleep(5); snapd(tag + "-bible-text-final"); swipe_up(); snapd(tag + "-bible-text-scrolled")
def cold_relaunch_prepare():
    out = sh("xcrun simctl listapps %s" % UDID)
    ids = sorted(set(re.findall(r'(com\.apple\.webapp[A-Za-z0-9.\-]*)', out)))
    log("web clip bundle ids", ids)
    open(f"{CAP}/listapps-ids.txt", "w").write("\n".join(ids))
    for i in ids: log("terminate", i, sh("xcrun simctl terminate %s %s 2>&1" % (UDID, i)))
    R("COLD_TERMINATED_IDS_%d" % len(ids))
def sim_net_check():
    nonce = int(time.time())
    sh("xcrun simctl openurl %s 'https://example.org/?n=%d'" % (UDID, nonce)); time.sleep(25)
    p, l = snapd("simnet-safari-unique-url"); log("OCR simnet", texts(l)[:40])
    if has(l, r"Not Connected|not connected|offline|Internet|cannot|Cannot|Unable"): R("SIM_SAFARI_UNIQUE_URL_FAILED_AS_OFFLINE")
    else: R("SIM_SAFARI_UNIQUE_URL_SHOWS_NO_ERROR_TEXT_CHECK_PIXELS")
    go_home()

if MODE == "online2":
    launch_icon("launch")
    wait_ready()
    snapd("online-home")
    search_proof("online", "love")
    ensure_english("online")
    bible_proof("online", "Genesis", chap_tap="1")
if MODE == "simnet":
    sim_net_check()
if MODE == "offline2":
    cold_relaunch_prepare()
    launch_icon("offline", press_home=True)
    time.sleep(10)
    p, l = snapd("offline-home")
    if classify(l) != "app_page": stop("app content not visible offline after cold launch")
    R("OFFLINE_COLD_LAUNCH_APP_CONTENT")
    search_proof("offline", "love")
    ensure_english("offline")
    bible_proof("offline", "Ruth", chap_tap="2")
