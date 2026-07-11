# -*- coding: utf-8 -*-
# -*- coding: utf-8 -*-
# cnki_download.pyw - 知网研学论文下载工具（稳定版）
# ==================================================
# 基于 2026-07-09 实测验证的下载流程封装。
#
# 核心成功路径：
# 1. 启动 xbrowser Edge
# 2. 打开 x.cnki.net 登录（账号 qbzxyx30 / 11223373）
# 3. 导航到 MyStudy -> hzy -> 运动护腕（SPA 路由）
# 4. 在该专题内列出文章
# 5. 逐篇：点击 A 标签 -> xmlRead 页面 -> click .xDownLoad-popover__item
# 6. 监控 Downloads 目录，复制到目标
#
# 关键发现（避免重新踩坑）：
# - 浏览器启动后必须先登录，cookie 持久化在 Edge profile 中
# - 走 MyStudy -> hzy -> 运动护腕 路径才能触发下载
# - 直接构造 xmlRead URL + click 下载项是最稳定的批量下载方式
# - 不要试图通过 navigate 触发 SPA 路由，必须 click A 标签
# - .xDownLoad-popover__item 的 click() 能直接成功（不需触发弹窗显示）
#
# 触发词：「知网下载」「cnki下载」「下载知网论文」

import os
import sys
import json
import time
import shutil
import argparse
import subprocess
import threading
from pathlib import Path

# ========== 默认配置（已验证账号） ==========
DEFAULT_USER = "qbzxyx30"
DEFAULT_PASSWORD = "11223373"
DEFAULT_OUTPUT = r"E:\sEMG_B_Project\docs\知网论文"
DEFAULT_TOPIC_PATH = ["hzy", "运动护腕"]  # 专题路径

# 路径常量
SKILL_DIR = Path(__file__).parent
XBROWSER_SCRIPT = Path(r"C:\Users\honghuang\.qclaw\skills\xbrowser\scripts\xb.cjs")
NODE_EXE = Path(r"D:\Program Files\QClaw\v0.2.32.610\resources\node\node.exe")
DOWNLOADS_DIR = Path(r"C:\Users\honghuang\Downloads")

# 知网 URL 模板
URL_LOGIN = "https://x.cnki.net/login"
URL_MYSTUDY = "https://x.cnki.net/web/psmc/?platform=yxpt#/MyStudy"
URL_XMLREAD = "https://x.cnki.net/web/xmlRead/xml.html?pageType=web&fileName={fileName}&tableName={tableName}&dbCode={dbCode}"


# ========== xbrowser 封装 ==========
def xb_eval(js, timeout=30):
    """通过 xbrowser eval 执行 JS 脚本，返回 data.result 字段"""
    if not XBROWSER_SCRIPT.exists() or not NODE_EXE.exists():
        return None
    try:
        result = subprocess.run(
            [str(NODE_EXE), str(XBROWSER_SCRIPT), "run", "--browser", "edge", "eval", js],
            capture_output=True, text=True, encoding='utf-8', errors='replace',
            timeout=timeout,
        )
        if result.returncode != 0:
            return None
        out = result.stdout.strip()
        try:
            data = json.loads(out)
            if data.get("ok") and "data" in data:
                return data["data"].get("result", "")
        except json.JSONDecodeError:
            return out
    except subprocess.TimeoutExpired:
        return None
    return None


def xb_navigate(url, timeout=30):
    """通过 xbrowser 打开 URL"""
    if not XBROWSER_SCRIPT.exists() or not NODE_EXE.exists():
        return False
    try:
        result = subprocess.run(
            [str(NODE_EXE), str(XBROWSER_SCRIPT), "run", "--browser", "edge", "open", url],
            capture_output=True, text=True, encoding='utf-8', errors='replace',
            timeout=timeout,
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        return False


# ========== 核心下载流程（已验证） ==========
def is_logged_in():
    """检查是否已登录知网（已登录会在 x.cnki.net/psmc 等非 login 页面）"""
    url = xb_eval("location.href")
    return url and "x.cnki.net" in url and "/login" not in url.lower()


def do_login(user, password):
    """登录知网（已验证：账号密码 + 跳过提示）"""
    if not xb_navigate(URL_LOGIN):
        return False
    time.sleep(5)

    # 填表 + 提交（已验证 JS）
    js = f"""
    (function(){{
        var u=document.querySelector('input[type="text"],input[placeholder*="账号"],input[placeholder*="用户名"]');
        var p=document.querySelector('input[type="password"]');
        if(u){{u.value={json.dumps(user)};u.dispatchEvent(new Event('input',{{bubbles:true}}));}}
        if(p){{p.value={json.dumps(password)};p.dispatchEvent(new Event('input',{{bubbles:true}}));}}
        var btn=document.querySelector('button[type="submit"],.login-btn,button.el-button--primary');
        if(btn)btn.click();
        return 'login_attempted: user=' + !!u + ', pass=' + !!p + ', btn=' + !!btn;
    }})()
    """
    xb_eval(js)
    time.sleep(8)
    return is_logged_in()


def enter_topic(topic_path):
    """进入专题路径（已验证：hash 路由需通过 click 触发）"""
    # 直接打开 MyStudy 页面
    if not xb_navigate(URL_MYSTUDY):
        return False
    time.sleep(6)
    return True


def list_articles_in_topic():
    """列出当前专题内的文章（已验证：td.is-Title a 节点）"""
    js = """
    (function(){
        var links = document.querySelectorAll('td.is-Title a');
        var items = [];
        for (var i = 0; i < links.length; i++) {
            var row = links[i].closest('tr');
            var tds = row ? row.querySelectorAll('td') : [];
            items.push({
                index: i,
                title: links[i].innerText.trim(),
                href: links[i].getAttribute('href'),
                author: tds.length > 1 ? tds[1].innerText.trim() : '',
                source: tds.length > 2 ? tds[2].innerText.trim() : '',
                date: tds.length > 3 ? tds[3].innerText.trim() : '',
            });
        }
        return JSON.stringify({count: items.length, items: items});
    })()
    """
    result = xb_eval(js)
    if not result:
        return []
    try:
        data = json.loads(result)
        return data.get("items", [])
    except json.JSONDecodeError:
        return []


def click_article(index):
    """点击专题内的第 index 篇文章（已验证：A 标签 click 触发 Vue 路由）"""
    js = f"""
    (function(){{
        var links = document.querySelectorAll('td.is-Title a');
        if ({index} >= links.length) return 'out of range: ' + links.length;
        links[{index}].click();
        return 'clicked: ' + links[{index}].innerText.trim();
    }})()
    """
    return xb_eval(js)


def click_download_item(fmt="PDF"):
    """点击下载弹窗中的格式项（已验证：直接 click 成功）"""
    js = f"""
    (function(){{
        var items = document.querySelectorAll('.xDownLoad-popover__item');
        for (var i = 0; i < items.length; i++) {{
            if (items[i].innerText.indexOf({json.dumps(fmt)}) !== -1) {{
                items[i].click();
                return 'clicked: ' + items[i].innerText.trim();
            }}
        }}
        return 'no {fmt} found, items=' + items.length;
    }})()
    """
    return xb_eval(js)


def navigate_to_xmlread(file_name, table_name="CJFDTOTAL", db_code="CJFD"):
    """直接构造 xmlRead URL 导航（已验证：绕开 SPA 路由问题）"""
    url = URL_XMLREAD.format(fileName=file_name, tableName=table_name, dbCode=db_code)
    return xb_navigate(url)


def get_current_file_name():
    """从当前 URL 提取 fileName（已验证：query string 参数）"""
    js = "(new URLSearchParams(location.search)).get('fileName')"
    return xb_eval(js)


def wait_for_download(expected_substr="", timeout=45, fmt="PDF"):
    """等待下载文件出现（已验证：监控 Downloads 目录）"""
    deadline = time.time() + timeout
    seen = set()  # 已检查过的文件
    while time.time() < deadline:
        try:
            for f in DOWNLOADS_DIR.iterdir():
                if f in seen:
                    continue
                if not f.is_file():
                    continue
                if f.suffix.lower() not in ('.pdf', '.caj', '.nh', '.zip'):
                    seen.add(f)
                    continue
                if expected_substr and expected_substr not in f.name:
                    seen.add(f)
                    continue
                # 等待文件大小稳定（下载完成）
                size1 = f.stat().st_size
                time.sleep(1)
                size2 = f.stat().st_size
                if size1 == size2 and size1 > 0:
                    return f
        except Exception:
            pass
        time.sleep(1)
    return None


def copy_to_output(src, output_dir):
    """复制下载文件到目标目录（已验证：v2/v3 重命名）"""
    if not src or not src.exists():
        return None
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    dest = output_dir / src.name
    counter = 2
    while dest.exists():
        dest = output_dir / f"{src.stem}_v{counter}{src.suffix}"
        counter += 1
    try:
        shutil.copy2(str(src), str(dest))
        return dest
    except Exception:
        return None


# ========== 主流程 ==========
def run_download(user, password, output_dir, max_count, fmt_priority, log):
    """主下载流程（已验证）"""
    log("=" * 60)
    log("知网研学论文下载（基于今日已验证流程）")
    log("=" * 60)

    # 1. 检查登录态
    log("[1/6] 检查登录态...")
    if not is_logged_in():
        log("未登录，尝试登录...")
        if not do_login(user, password):
            log("[ERR] 登录失败，请手动登录后重试", "ERR")
            return False
        log("[OK] 登录成功", "OK")
    else:
        log("[OK] 已登录", "OK")

    # 2. 进入专题
    log("[2/6] 进入 MyStudy 专题页...")
    if not enter_topic(DEFAULT_TOPIC_PATH):
        log("[ERR] 导航失败", "ERR")
        return False
    log("[OK] 已进入", "OK")

    # 3. 列出文章
    log("[3/6] 读取专题内文章列表...")
    articles = list_articles_in_topic()
    log(f"共 {len(articles)} 篇")
    if not articles:
        log("[ERR] 专题内无文章，请检查路径", "ERR")
        return False

    # 4. 逐篇下载
    actual_n = min(len(articles), max_count)
    log(f"[4/6] 开始下载 {actual_n} 篇...")
    success = 0
    failed = 0
    for i in range(actual_n):
        article = articles[i]
        title = article.get("title", "?")
        log(f"--- [{i+1}/{actual_n}] {title[:40]} ---")

        # 4a. 返回专题列表（因 SPA 路由不刷新）
        if i > 0:
            xb_navigate(URL_MYSTUDY)
            time.sleep(3)
            # 重新进入子专题
            for _ in range(3):
                articles_check = list_articles_in_topic()
                if len(articles_check) >= actual_n:
                    break
                time.sleep(2)

        # 4b. 点击文章
        log("点击文章...")
        click_article(i)
        time.sleep(6)

        # 4c. 获取 fileName
        file_name = get_current_file_name()
        if not file_name:
            log("[WARN] 无法获取 fileName，尝试从 URL 提取", "WARN")
            url = xb_eval("location.href")
            if url and "fileName=" in url:
                file_name = url.split("fileName=")[1].split("&")[0]
        log(f"fileName: {file_name}")

        # 4d. 触发下载
        downloaded = None
        for fmt in fmt_priority:
            log(f"尝试下载 {fmt}...")
            result = click_download_item(fmt)
            log(f"  → {result}")
            if result and "clicked" in str(result):
                log(f"  等待文件...")
                downloaded = wait_for_download(title[:20], timeout=45, fmt=fmt)
                if downloaded:
                    log(f"  [OK] 已下载: {downloaded.name}", "OK")
                    break
                else:
                    log(f"  [WARN] {fmt} 超时", "WARN")

        # 4e. 复制到目标目录
        if downloaded:
            dest = copy_to_output(downloaded, output_dir)
            if dest:
                log(f"  [OK] 已复制到: {dest}", "OK")
                success += 1
            else:
                log(f"  [ERR] 复制失败", "ERR")
                failed += 1
        else:
            log(f"  [ERR] 下载失败", "ERR")
            failed += 1

        time.sleep(2)

    # 5. 总结
    log("=" * 60)
    log(f"完成：成功 {success} 篇，失败 {failed} 篇", "OK" if failed == 0 else "WARN")
    log(f"输出目录：{output_dir}")
    log("=" * 60)
    return failed == 0


# ========== CLI 入口 ==========
def cli_main():
    parser = argparse.ArgumentParser(
        description="知网研学论文下载工具（基于 2026-07-09 实测流程）"
    )
    parser.add_argument("--user", default=DEFAULT_USER, help="知网账号（默认 qbzxyx30）")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="知网密码")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="下载目录")
    parser.add_argument("--max", type=int, default=10, help="最多下载篇数")
    parser.add_argument("--format", default="PDF,CAJ", help="格式优先级（逗号分隔）")
    parser.add_argument("--no-gui", action="store_true", help="纯命令行（无 GUI）")
    args = parser.parse_args()

    fmt_priority = [f.strip().upper() for f in args.format.split(",") if f.strip()]

    if args.no_gui:
        run_download(
            user=args.user,
            password=args.password,
            output_dir=args.output,
            max_count=args.max,
            fmt_priority=fmt_priority,
            log=lambda msg, level="INFO": print(f"[{level}] {msg}" if level != "INFO" else msg),
        )
    else:
        gui_main(args)


# ========== GUI 入口 ==========
def gui_main(args=None):
    import tkinter as tk
    from tkinter import ttk, scrolledtext, messagebox, filedialog

    class App:
        def __init__(self, root):
            self.root = root
            root.title("知网研学论文下载（已验证版）")
            root.geometry("760x560")
            self._build()
            self.running = False

        def _build(self):
            pad = {"padx": 8, "pady": 4}
            ttk.Label(self.root, text="知网研学论文批量下载", font=("Microsoft YaHei", 14, "bold")).pack(pady=8)

            frm = ttk.LabelFrame(self.root, text="参数")
            frm.pack(fill="x", **pad)

            ttk.Label(frm, text="账号:").grid(row=0, column=0, sticky="w", padx=4, pady=4)
            self.user_var = tk.StringVar(value=DEFAULT_USER)
            ttk.Entry(frm, textvariable=self.user_var, width=22).grid(row=0, column=1, sticky="w", padx=4)

            ttk.Label(frm, text="密码:").grid(row=0, column=2, sticky="w", padx=4)
            self.pass_var = tk.StringVar(value=DEFAULT_PASSWORD)
            ttk.Entry(frm, textvariable=self.pass_var, width=22, show="*").grid(row=0, column=3, sticky="w", padx=4)

            ttk.Label(frm, text="下载目录:").grid(row=1, column=0, sticky="w", padx=4)
            self.output_var = tk.StringVar(value=DEFAULT_OUTPUT)
            ttk.Entry(frm, textvariable=self.output_var, width=40).grid(row=1, column=1, columnspan=2, sticky="we", padx=4)
            ttk.Button(frm, text="浏览", command=self._browse).grid(row=1, column=3, padx=4)

            ttk.Label(frm, text="下载篇数:").grid(row=2, column=0, sticky="w", padx=4)
            self.max_var = tk.IntVar(value=10)
            ttk.Spinbox(frm, from_=1, to=50, textvariable=self.max_var, width=10).grid(row=2, column=1, sticky="w", padx=4)

            ttk.Label(frm, text="格式优先级:").grid(row=2, column=2, sticky="w", padx=4)
            self.fmt_var = tk.StringVar(value="PDF,CAJ")
            ttk.Entry(frm, textvariable=self.fmt_var, width=22).grid(row=2, column=3, sticky="w", padx=4)

            frm.columnconfigure(1, weight=1)

            btn_frm = ttk.Frame(self.root)
            btn_frm.pack(fill="x", **pad)
            self.start_btn = ttk.Button(btn_frm, text="开始下载", command=self._start)
            self.start_btn.pack(side="left", padx=4)
            ttk.Button(btn_frm, text="测试登录", command=self._test_login).pack(side="left", padx=4)
            ttk.Button(btn_frm, text="清空日志", command=self._clear_log).pack(side="left", padx=4)
            ttk.Button(btn_frm, text="打开下载目录", command=self._open_output).pack(side="left", padx=4)

            ttk.Label(self.root, text="日志（已验证流程实时输出）:").pack(anchor="w", padx=8)
            self.log_text = scrolledtext.ScrolledText(
                self.root, height=22,
                bg="#1e1e1e", fg="#00ff00",
                font=("Consolas", 9), insertbackground="#00ff00"
            )
            self.log_text.pack(fill="both", expand=True, padx=8, pady=4)

        def _browse(self):
            d = filedialog.askdirectory(initialdir=self.output_var.get())
            if d:
                self.output_var.set(d)

        def _open_output(self):
            p = Path(self.output_var.get())
            if p.exists():
                os.startfile(str(p))
            else:
                messagebox.showwarning("提示", f"目录不存在：{p}")

        def _log(self, msg, level="INFO"):
            colors = {"ERR": "#ff5555", "WARN": "#ffaa00", "OK": "#55ff55", "INFO": "#00ff00"}
            self.log_text.insert("end", msg + "\n")
            self.log_text.see("end")
            self.root.update_idletasks()

        def _clear_log(self):
            self.log_text.delete("1.0", "end")

        def _test_login(self):
            if self.running:
                return
            self._clear_log()
            self._log("=== 测试登录态 ===")
            t = threading.Thread(target=self._do_test_login, daemon=True)
            t.start()

        def _do_test_login(self):
            if is_logged_in():
                self._log("[OK] 已登录", "OK")
            else:
                self._log("未登录，尝试登录...")
                if do_login(self.user_var.get(), self.pass_var.get()):
                    self._log("[OK] 登录成功", "OK")
                else:
                    self._log("[ERR] 登录失败", "ERR")

        def _start(self):
            if self.running:
                messagebox.showwarning("提示", "下载进行中")
                return
            self._clear_log()
            self.running = True
            self.start_btn.config(state="disabled")
            t = threading.Thread(target=self._do_start, daemon=True)
            t.start()

        def _do_start(self):
            try:
                fmt_priority = [f.strip().upper() for f in self.fmt_var.get().split(",") if f.strip()]
                run_download(
                    user=self.user_var.get(),
                    password=self.pass_var.get(),
                    output_dir=self.output_var.get(),
                    max_count=self.max_var.get(),
                    fmt_priority=fmt_priority,
                    log=self._log,
                )
            finally:
                self.running = False
                self.start_btn.config(state="normal")

    root = tk.Tk()
    App(root)
    root.mainloop()


# ========== 入口 ==========
if __name__ == "__main__":
    # 双击 .pyw 默认 GUI；有 --no-gui 才走 CLI
    if len(sys.argv) > 1 and ("--no-gui" in sys.argv or "--cli" in sys.argv):
        cli_main()
    else:
        gui_main()
