# -*- coding: utf-8 -*-
"""
web_login.pyw - 知网(CNKI)专用 自动登录 Skill

本 skill 仅适用于知网(cnki.net)这一个网站，用户名/密码已固定（项目共用账号，
不可改动）。通过 xbrowser (Edge/Chrome) 自动打开知网研学登录页、填入固定账号、
勾选协议、点击登录，并可选地跳过登录后的安全提示弹窗（如「密码强度不足，请尽快
修改密码」提示，点「跳过」）。

它也是 sEMG 项目「知网论文自动采集」工作流的前置步骤：登录后可配合 xbrowser
在「我的专题 > hzy > 运动护腕」下检索 sEMG 相关论文、加入该专题，并下载到本地
E:\sEMG_B_Project\docs\知网论文 目录。

依赖：
  - xbrowser 已初始化（xb init 返回 ready），且已配置浏览器（edge/chrome）
  - node 运行时（自动探测，或 --node 指定）

用法：
  pythonw web_login.pyw [--agree] [--skip-text 跳过] [--screenshot 路径]

说明：
  --url / --user / --password 均已固定为知网研学地址与项目账号，外部传入会被忽略
  并告警。仅接受 cnki.net 域名的 URL，其它站点一律拒绝。

常用选项：
  --browser <edge|chrome>      浏览器，默认 edge
  --agree                      勾选页面上第一个 checkbox（协议/我已阅读）
  --skip-text <文字>           登录后点击文字包含该内容的按钮（如 "跳过"）
  --user-ref / --pass-ref / --login-ref / --agree-ref / --skip-ref
                                显式指定元素 @ref（绕过自动识别，最稳）
  --screenshot <路径>          登录后截图保存路径
  --out <路径>                 结果 JSON 输出路径（默认写同目录 web_login_result.json）
  --wait <秒>                  点击登录后的等待时间，默认 5

结果：
  写入 --out 指定的 JSON 文件，并打印一行 JSON。字段含 ok / url / steps / error。
"""

import subprocess
import json
import sys
import argparse
import os
import time
import shutil

DEFAULT_XB = r"C:\Users\honghuang\.qclaw\skills\xbrowser\scripts\xb.cjs"
QCLAW_NODE = r"D:\Program Files\QClaw\v0.2.32.610\resources\node\node.exe"

# ===== 知网专用固定配置（用户名/密码不可改动）=====
CNKI_DOMAINS = ("cnki.net", "x.cnki.net", "login.cnki.net", "kns.cnki.net")
FIXED_USER = "qbzxyx30"
FIXED_PASSWORD = "11223373"
DEFAULT_CNKI_URL = "https://x.cnki.net/web/psmc/#/home"
# sEMG 项目论文本地存放目录（下载到此目录下的子目录）
DEFAULT_LOCAL_DIR = r"E:\sEMG_B_Project\docs\知网论文"


def is_cnki_url(url):
    if not url:
        return False
    u = url.lower()
    return any(("://" + d) in u or u.startswith(d) for d in CNKI_DOMAINS)


def find_node():
    c = shutil.which("node")
    if c:
        return c
    if os.path.exists(QCLAW_NODE):
        return QCLAW_NODE
    return None


def find_xb(explicit):
    if explicit:
        return explicit if os.path.exists(explicit) else None
    if os.path.exists(DEFAULT_XB):
        return DEFAULT_XB
    base = r"C:\Users\honghuang\.qclaw\skills"
    if os.path.isdir(base):
        for root, _, files in os.walk(base):
            if os.path.basename(root) == "scripts" and "xb.cjs" in files:
                return os.path.join(root, "xb.cjs")
    return None


def run_xb(node, xb, browser, action_args, timeout=60):
    cmd = [node, xb, "run", "--browser", browser] + action_args
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except Exception as e:
        return {"ok": False, "error": "exec failed: %s" % e}
    out = (r.stdout or "").strip()
    try:
        return json.loads(out)
    except Exception:
        return {"ok": False, "raw": out, "stderr": r.stderr}


def get_refs(j):
    try:
        return j["data"]["result"]["data"]["refs"]
    except Exception:
        return {}


def detect(refs, user_ref=None, pass_ref=None, login_ref=None, agree_ref=None):
    """自动识别 用户名/密码/登录按钮/协议勾选框。
    若显式指定了三个核心 ref，直接返回。"""
    if user_ref and pass_ref and login_ref:
        return user_ref, pass_ref, login_ref, agree_ref
    pw = None
    user = None
    login = None
    agree = None
    textboxes = []
    for k, v in refs.items():
        role = v.get("role")
        name = (v.get("name") or "")
        nl = name.lower()
        if role == "textbox":
            textboxes.append((k, name))
            if any(w in nl for w in ["密码", "password", "pass"]):
                pw = k
        if role == "button" and any(
            w in nl
            for w in ["登录", "login", "sign in", "signin", "提交", "log in", "登陆", "signin "]
        ):
            if login is None:
                login = k
        if role == "checkbox" and agree is None:
            agree = k
    # 用户名：优先匹配含 用户名/账号/手机/email 等占位符的输入框，否则取第一个非密码框
    for k, name in textboxes:
        nl = name.lower()
        if any(
            w in nl
            for w in ["用户名", "用户", "账号", "帐号", "手机", "email", "user", "mail", "登录名"]
        ):
            user = k
            break
    if user is None and pw is not None:
        for k, _ in textboxes:
            if k != pw:
                user = k
                break
    if user is None and textboxes:
        user = textboxes[0][0]
    return user, pw, login, agree


def find_button_by_text(refs, text):
    tl = text.lower()
    for k, v in refs.items():
        if v.get("role") == "button" and tl in (v.get("name") or "").lower():
            return k
    return None


def finish(out, args, extra, steps=None):
    out.update({k: v for k, v in extra.items() if k not in out or v})
    if steps is not None:
        out["steps"] = steps
    out_path = args.out or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "web_login_result.json"
    )
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    try:
        print(json.dumps(out, ensure_ascii=False))
    except Exception:
        pass
    return 0 if out.get("ok") else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_CNKI_URL,
                    help="知网 URL（固定，仅限 cnki.net 域名）")
    ap.add_argument("--user", default=FIXED_USER, help="知网用户名（已固定，勿改）")
    ap.add_argument("--password", default=FIXED_PASSWORD, help="知网密码（已固定，勿改）")
    ap.add_argument("--browser", default="edge")
    ap.add_argument("--agree", action="store_true", help="勾选页面第一个 checkbox（协议）")
    ap.add_argument("--skip-text", default=None, help="登录后点击文字包含该内容的按钮，如 跳过")
    ap.add_argument("--user-ref", default=None)
    ap.add_argument("--pass-ref", default=None)
    ap.add_argument("--login-ref", default=None)
    ap.add_argument("--agree-ref", default=None)
    ap.add_argument("--skip-ref", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--xb", default=None)
    ap.add_argument("--node", default=None)
    ap.add_argument("--screenshot", default=None)
    ap.add_argument("--wait", type=int, default=5)
    args = ap.parse_args()

    # 仅限知网，拒绝其它站点
    if not is_cnki_url(args.url):
        return finish(
            out,
            args,
            {"error": "本 skill 仅适用于知网(cnki.net)，拒绝非知网 URL: %s" % args.url},
            steps,
        )
    # 用户名/密码固定，忽略外部传入
    if args.user != FIXED_USER or args.password != FIXED_PASSWORD:
        print("[warn] 知网账号已固定，忽略传入的用户名/密码，使用固定凭据")
        args.user = FIXED_USER
        args.password = FIXED_PASSWORD

    node = args.node or find_node()
    xb = find_xb(args.xb)
    steps = []
    out = {"ok": False}

    if not node:
        return finish(out, args, {"error": "未找到 node 运行时（可用 --node 指定）"})
    if not xb:
        return finish(
            out,
            args,
            {"error": "未找到 xbrowser (xb.cjs)；请先初始化 xbrowser (xb init)"},
        )

    # 1) 打开登录页
    j = run_xb(node, xb, args.browser, ["open", args.url])
    if not j.get("ok"):
        return finish(out, args, {"step": "open", "error": j}, steps)
    time.sleep(1.5)

    # 2) 快照 + 识别字段
    j = run_xb(node, xb, args.browser, ["snapshot", "-i"])
    refs = get_refs(j)
    if not refs:
        return finish(out, args, {"step": "snapshot", "error": "无页面元素", "raw": j}, steps)
    user, pw, login, agree = detect(
        refs, args.user_ref, args.pass_ref, args.login_ref, args.agree_ref
    )
    if not user or not pw:
        return finish(
            out,
            args,
            {"step": "detect", "error": "未找到用户名/密码输入框", "refs_count": len(refs)},
            steps,
        )

    # 3) 填用户名 / 密码
    jf = run_xb(node, xb, args.browser, ["fill", "@" + user, args.user])
    steps.append({"fill_user": jf.get("ok")})
    jf = run_xb(node, xb, args.browser, ["fill", "@" + pw, args.password])
    steps.append({"fill_pass": jf.get("ok")})

    # 4) 勾选协议
    if args.agree:
        aref = args.agree_ref or agree
        if aref:
            jc = run_xb(node, xb, args.browser, ["click", "@" + aref])
            steps.append({"agree": jc.get("ok")})
        else:
            steps.append({"agree": "no checkbox found"})

    # 5) 重新快照取最新登录按钮 ref，再点击
    j = run_xb(node, xb, args.browser, ["snapshot", "-i"])
    refs = get_refs(j)
    _, _, login2, _ = detect(refs, args.user_ref, args.pass_ref, args.login_ref, args.agree_ref)
    login_ref = login2 or login
    if not login_ref:
        return finish(out, args, {"step": "login", "error": "未找到登录按钮"}, steps)
    jl = run_xb(node, xb, args.browser, ["click", "@" + login_ref])
    steps.append({"click_login": jl.get("ok")})
    time.sleep(args.wait)

    # 6) 可选：跳过安全提示弹窗
    if args.skip_text:
        j = run_xb(node, xb, args.browser, ["snapshot", "-i"])
        refs = get_refs(j)
        sk = args.skip_ref or find_button_by_text(refs, args.skip_text)
        if sk:
            js = run_xb(node, xb, args.browser, ["click", "@" + sk])
            steps.append({"skip": js.get("ok")})
        else:
            steps.append({"skip": "button not found: " + args.skip_text})
        time.sleep(2)

    # 7) 取最终 URL + 截图
    ju = run_xb(node, xb, args.browser, ["get", "url"])
    try:
        url = ju["data"]["result"]["data"]["url"]
    except Exception:
        url = None
    if args.screenshot:
        run_xb(node, xb, args.browser, ["screenshot", "--full", args.screenshot])

    out["ok"] = True
    out["url"] = url
    out["steps"] = steps
    return finish(out, args, {})


if __name__ == "__main__":
    sys.exit(main())
