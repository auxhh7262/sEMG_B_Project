# -*- coding: utf-8 -*-
"""
cnki_gui.pyw — 知网文献检索（直接驱动 Edge 版，单文件 Skill）

设计说明：
  不再使用「本地 HTTP 服务 + 网页 GUI」的架构（那种方式容易出"点了搜索没反应"、
  "关掉页面后冒出多个 Edge" 等窗口错乱问题）。
  本文件只做两件事：
    1) 确保已登录的 Edge 处于知网登录态（固定账号自动登录）；
    2) 直接把 Edge 打开到知网检索页，关键词由你在 Edge 里自己输入、看结果、点链接下载。

用法（双击即可）：
  双击 cnki_gui.pyw                                   # 自动登录并打开知网检索页
  python cnki_gui.pyw                                 # 同上
  python cnki_gui.pyw --search "弯举 肌电 疲劳"        # 直接打开该关键词的检索结果页

依赖：xbrowser(node) 驱动已登录的 Edge；账号密码已固定（qbzxyx30 / 11223373），不可改动。
"""
import sys
import os
import json
import time
import shutil
import subprocess
import urllib.parse
import tempfile

# ===================== 固定路径 / 配置 =====================
DEFAULT_XB = r"C:\Users\honghuang\.qclaw\skills\xbrowser\scripts\xb.cjs"
NODE_CANDIDATES = [
    r"C:\Users\honghuang\.workbuddy\binaries\node\versions\22.22.2\node",
    r"C:\Users\honghuang\.workbuddy\binaries\node\versions\22.22.2\node.exe",
    r"D:\Program Files\QClaw\v0.2.32.610\resources\node\node.exe",
]
FIXED_USER = "qbzxyx30"
FIXED_PASSWORD = "11223373"
PSMC_HOME = "https://x.cnki.net/web/psmc/#/home"
SEARCH_ENTRY = "https://kns.cnki.net/kns8s/"  # 知网检索入口，用户在 Edge 里直接输入关键词
RESULTS_TMPL = "https://kns.cnki.net/kns8s/defaultresult/index?korder=&kw={kw}"


# ===================== 日志（便于排查，不影响主流程）=====================
def _log(msg):
    try:
        with open(os.path.join(tempfile.gettempdir(), "cnki_gui.log"), "a", encoding="utf-8") as f:
            f.write("%s  %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg))
    except Exception:
        pass


# ===================== node / xbrowser 探测 =====================
def find_node():
    for c in NODE_CANDIDATES:
        if os.path.exists(c):
            return c
    n = shutil.which("node")
    if n:
        return n
    return None


def find_xb():
    if os.path.exists(DEFAULT_XB):
        return DEFAULT_XB
    base = r"C:\Users\honghuang\.qclaw\skills"
    if os.path.isdir(base):
        for root, _, files in os.walk(base):
            if os.path.basename(root) == "scripts" and "xb.cjs" in files:
                return os.path.join(root, "xb.cjs")
    return None


NODE = find_node()
XB = find_xb()


def xb(args, timeout=60000):
    """运行一条 xbrowser 命令，返回解析后的 JSON（失败返回 {}）。"""
    if not NODE or not XB:
        return {}
    kwargs = dict(
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    # Windows 下用 CREATE_NO_WINDOW 让 node 子进程在后台静默运行，避免每次调用都弹控制台窗口
    if sys.platform == "win32":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    try:
        r = subprocess.run(
            [NODE, XB, "run", "--browser", "edge"] + args,
            **kwargs,
        )
    except subprocess.TimeoutExpired:
        # xbrowser 命令超时（常见：页面长连接/networkidle 等导致），不要抛崩整个流程
        return {}
    try:
        return json.loads(r.stdout)
    except Exception:
        return {}


def xb_eval(js, timeout=60000):
    j = xb(["eval", js], timeout=timeout)
    try:
        return j["data"]["result"]["data"]["result"]
    except Exception:
        return None


def xb_open(url):
    try:
        xb(["open", url], timeout=15000)
    except Exception:
        pass
    # 不用 wait --load networkidle：知网页面有长连接/轮询，networkidle 永远等不满会卡满超时。
    # 固定短等待即可。
    time.sleep(2.5)


def xb_navigate(url):
    """在当前 Edge 标签页原地跳转到 url（避免每次都开新标签页）。"""
    try:
        xb(["eval", "window.location.href = %s" % json.dumps(url)], timeout=15000)
    except Exception:
        pass
    time.sleep(3.0)


# ===================== 登录（原 web-login 逻辑内联）=====================
def ensure_login():
    """确保知网研学已登录（带固定账号）。返回是否登录成功。"""
    _log("ensure_login: open psmc")
    xb_open(PSMC_HOME)
    # SPA 异步加载，轮询等待账号名出现（最多 ~6s），避免误判未登录
    logged = False
    for _ in range(6):
        logged = xb_eval("document.body.innerText.indexOf('%s')>=0" % FIXED_USER)
        if logged:
            _log("ensure_login: already logged in")
            return True
        time.sleep(1.0)
    if not NODE or not XB:
        return False
    # 未登录 -> 走固定账号自动登录（当前已在登录页，无需重复 open）
    _log("ensure_login: try auto login")
    j = xb(["snapshot", "-i"])
    refs = {}
    try:
        refs = j["data"]["result"]["data"]["refs"]
    except Exception:
        refs = {}
    user = pw = login = agree = None
    textboxes = []
    for k, v in refs.items():
        role = v.get("role")
        name = (v.get("name") or "")
        nl = name.lower()
        if role == "textbox":
            textboxes.append((k, name))
            if any(w in nl for w in ["密码", "password", "pass"]):
                pw = k
        if role == "button" and any(w in nl for w in ["登录", "login", "sign in", "提交", "登陆"]):
            if login is None:
                login = k
        if role == "checkbox" and agree is None:
            agree = k
    for k, name in textboxes:
        nl = name.lower()
        if any(w in nl for w in ["用户名", "用户", "账号", "帐号", "手机", "email", "user", "登录名"]):
            user = k
            break
    if user is None and pw is not None:
        for k, _ in textboxes:
            if k != pw:
                user = k
                break
    if user is None and textboxes:
        user = textboxes[0][0]
    if not user or not pw or not login:
        _log("ensure_login: cannot find login form")
        return False
    xb(["fill", "@" + user, FIXED_USER])
    xb(["fill", "@" + pw, FIXED_PASSWORD])
    if agree:
        xb(["click", "@" + agree])
    xb(["click", "@" + login])
    time.sleep(5)
    # 跳过安全提示弹窗（如"密码强度不足，请尽快修改密码"）
    j = xb(["snapshot", "-i"])
    try:
        refs = j["data"]["result"]["data"]["refs"]
    except Exception:
        refs = {}
    for k, v in refs.items():
        if v.get("role") == "button" and "跳过" in (v.get("name") or ""):
            xb(["click", "@" + k])
            break
    time.sleep(2)
    logged = xb_eval("document.body.innerText.indexOf('%s')>=0" % FIXED_USER)
    _log("ensure_login: result=%s" % bool(logged))
    return bool(logged)


# ===================== 打开检索页（核心）=====================
def open_search_page(keyword=None):
    """确保登录后，把 Edge 打开/跳转到知网检索页。
    keyword 为空 -> 打开检索入口页（用户在 Edge 里自己输入关键词）；
    keyword 非空 -> 直接打开该关键词的检索结果页。"""
    if not NODE or not XB:
        _log("open_search_page: missing node/xb")
        return
    if not ensure_login():
        _log("open_search_page: login failed, still open search page for manual login")
    if keyword:
        url = RESULTS_TMPL.format(kw=urllib.parse.quote(keyword))
        _log("open_search_page: results for %r" % keyword)
    else:
        url = SEARCH_ENTRY
        _log("open_search_page: search entry")
    xb_navigate(url)


# ===================== 单实例保护 =====================
def _pid_alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except Exception:
        return False


def _already_running():
    lock = os.path.join(tempfile.gettempdir(), "cnki_gui.lock")
    try:
        if os.path.exists(lock):
            mtime = os.path.getmtime(lock)
            if time.time() - mtime < 120:  # 2 分钟内视为正在运行
                with open(lock) as f:
                    pid = f.read().strip()
                if pid and _pid_alive(pid):
                    return True
    except Exception:
        pass
    return False


def main():
    args = sys.argv[1:]

    # 命令行直接检索模式：打开指定关键词的结果页（不起服务、不开本地页面）
    if "--search" in args:
        i = args.index("--search")
        kw = args[i + 1] if i + 1 < len(args) else ""
        open_search_page(kw)
        return

    # 单实例：避免连续双击开出多个 Edge 窗口
    lock = os.path.join(tempfile.gettempdir(), "cnki_gui.lock")
    if _already_running():
        _log("main: another instance running, exit")
        return
    try:
        with open(lock, "w") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    try:
        # 双击默认行为：确保登录 -> 打开知网检索入口页，用户在 Edge 里直接输入关键词
        open_search_page()
    finally:
        try:
            os.remove(lock)
        except Exception:
            pass


if __name__ == "__main__":
    main()
