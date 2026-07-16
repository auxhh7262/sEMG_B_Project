#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
align.pyw — Markdown 表格按「显示宽度」对齐（CLI + 双击 GUI 双模式，自包含单文件）

为什么：只按字符数对齐时，中文/全角字符在编辑器里渲染为 2 个半角宽，
而 ASCII 只占 1 宽——算法以为对齐了，肉眼却看到竖线错位（"差一点"）。
本工具按「显示宽度」补空格：中文/全角记 2、其余记 1，使竖线 `|` 落在相同显示列。

用法（命令行 / 指令）：
    python align.pyw <rootDir|file.md> [subdirs...] [--dry-run]
    python align.pyw E:/sEMG_B_Project                 # 递归对齐所有 *.md
    python align.pyw E:/sEMG_B_Project docs skills     # 仅 docs/ 与 skills/
    python align.pyw E:/sEMG_B_Project --dry-run       # 预演，不写回
    python align.pyw ./README.md                       # 对齐单个文件

用法（双击）：
    直接双击 align.pyw → 弹出 GUI：选择目录/文件、可限定子目录、可勾选 dry-run，
    点「开始对齐」，结果明细显示在下方文本框。

行为：自动排除依赖缓存/自动生成目录（.git/node_modules/.pio/.workbuddy 等）；
保留原换行符（CRLF/LF 不变）；幂等（已对齐文件不写回）。

同源：stock-daily-brief skill 的 scripts/lib/align-md.js 是 JS 同源实现；
改对齐算法（disp_width/is_wide_cp/sep_cell）时两处须同步。
"""
import sys
import os
import re

EXCLUDE_DIRS = {
    '.git', 'node_modules', '__pycache__', '.pio', 'vendor', 'dist', 'build',
    '.workbuddy', 'venv', '.venv', 'env', '.tox', 'site-packages', 'target', 'bin', 'obj',
    'archive'  # 历史快照目录：刻意保持原貌，不对其表格做任何对齐改动
}
EXCLUDE_FILES = {'.DS_Store', 'Thumbs.db'}


# ---------- 显示宽度 ----------
def is_wide_cp(cp):
    """仅「明确宽」字符记 2；歧义宽度(Ambiguous)字符（弯引号/破折号/箭头/数学符/希腊字母）记 1。"""
    return (
        (0x1100 <= cp <= 0x115F) or   # Hangul Jamo
        (0x2E80 <= cp <= 0x303E) or   # CJK 部首/康熙/中文标点/平假名起始区
        (0x3041 <= cp <= 0x33FF) or   # 平假名/片假名/注音/汉字围框/符号
        (0x3400 <= cp <= 0x4DBF) or   # CJK 扩展A
        (0x4E00 <= cp <= 0x9FFF) or   # CJK 统一表意
        (0xA000 <= cp <= 0xA4CF) or   # 彝文
        (0xAC00 <= cp <= 0xD7A3) or   # 谚文音节
        (0xF900 <= cp <= 0xFAFF) or   # CJK 兼容表意
        (0xFE30 <= cp <= 0xFE4F) or   # CJK 兼容形式
        (0xFF00 <= cp <= 0xFF60) or   # 全角字母/标点
        (0xFFE0 <= cp <= 0xFFE6) or   # 全角符号
        (0x1F300 <= cp <= 0x1FAFF) or # emoji/符号（宽）
        (0x2150 <= cp <= 0x218F) or   # 数字形式（罗马数字 ⅠⅡⅢ…，宽=2）
        (0x2460 <= cp <= 0x24FF) or   # 带圈数字 ①②③（宽=2）
        (0x3200 <= cp <= 0x32FF)      # 带圈/括注 CJK（宽=2）
    )


def disp_width(s):
    w = 0
    for ch in str(s):
        w += 2 if is_wide_cp(ord(ch)) else 1
    return w


# ---------- 表格对齐 ----------
def split_row(line):
    l = line.strip()
    if l.startswith('|'):
        l = l[1:]
    if l.endswith('|'):
        l = l[:-1]
    return [c.strip() for c in l.split('|')]


def split_row_aware(line):
    """按显示语义拆行，但**忽略行内代码/数学跨度里的 `|`**，避免被当成列分隔符。

    典型场景：附录公式表里的绝对值 `$|x|$（如 $S=1-\\mathrm{clamp}(\\frac{|RMS-..|-..}{..})$）`
    若按普通 `split('|')` 会被绝对值竖线劈成多列。本函数对以下跨度内字符跳过 `|` 判定：
      - 行内代码  `...`  （反引号成对切换）
      - 数学公式  $...$ / $$...$$ （美元号成对切换；连续 `$$` 也成对处理）
    其余位置（含全角竖线 ｜ U+FF5C）仍按普通 `|` 拆列。
    """
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    cells = []
    cur = []
    in_math = False
    in_code = False
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch == '`' and not in_math:
            in_code = not in_code
            cur.append(ch); i += 1; continue
        if ch == '$' and not in_code:
            in_math = not in_math
            cur.append(ch); i += 1; continue
        if ch == '|' and not in_math and not in_code:
            cells.append(''.join(cur).strip())
            cur = []
            i += 1; continue
        cur.append(ch); i += 1
    cells.append(''.join(cur).strip())
    return cells


def is_separator_row(cells):
    return len(cells) > 0 and all(re.match(r':?-+:?$', c.strip()) for c in cells)


def detect_align(cells):
    res = []
    for c in cells:
        t = c.strip()
        if t.startswith(':') and t.endswith(':'):
            res.append('center')
        elif t.endswith(':'):
            res.append('right')
        else:
            res.append('left')
    return res


def pad_cell(s, width, align):
    s = str(s)
    pad = max(0, width - disp_width(s))
    if align == 'right':
        return ' ' * pad + s
    if align == 'center':
        left = pad // 2
        return ' ' * left + s + ' ' * (pad - left)
    return s + ' ' * pad


def sep_cell(align, width):
    w = max(1, width)
    if align == 'right':
        return '-' * max(1, w - 1) + ':'
    if align == 'center':
        if w <= 2:
            return ':-' if w == 2 else '-'
        return ':' + '-' * (w - 2) + ':'
    return '-' * w


def align_block(block):
    rows = [split_row_aware(b) for b in block]
    sep_idx = -1
    for r in range(len(rows)):
        if is_separator_row(rows[r]):
            sep_idx = r
            break
    header = rows[0]
    sep_cells = rows[sep_idx] if sep_idx >= 1 else ['---'] * len(header)
    aligns = detect_align(sep_cells)
    body = rows[sep_idx + 1:] if sep_idx >= 1 else rows[1:]
    col_count = max(len(header), max((len(r) for r in body), default=0), len(sep_cells))

    def norm(row):
        a = row[:col_count]
        while len(a) < col_count:
            a.append('')
        return a

    header_n = norm(header)
    sep_n = norm(sep_cells)
    body_n = [norm(r) for r in body]
    full_aligns = norm(aligns)
    widths = [0] * col_count

    def consider(row):
        for c in range(col_count):
            widths[c] = max(widths[c], disp_width(row[c] if c < len(row) else ''))

    consider(header_n)
    consider(sep_n)
    for r in body_n:
        consider(r)

    out_header = '| ' + ' | '.join(pad_cell(c, widths[k], 'left') for k, c in enumerate(header_n)) + ' |'
    out_sep = '| ' + ' | '.join(sep_cell(full_aligns[k], widths[k]) for k in range(col_count)) + ' |'
    out_body = ['| ' + ' | '.join(pad_cell(c, widths[k], full_aligns[k]) for k, c in enumerate(r)) + ' |' for r in body_n]
    return [out_header, out_sep] + out_body


# ---------- 盒子绘图（代码围栏内）对齐 ----------

BOX_DRAWING_RE = re.compile(
    r'[┌┐└┘├┤┬┴┼│─━┃┻┣┫┳╋╏╍═╔╗╚╝║╠╣╦╩╬▸◂►◄▼▲↕↑↓←→↔⇐⇒⇔⇕]'
)

# ─ 系列的 Unicode 范围（含变体）
DASH_CHARS = set('─━═-')

CORNER_TEE_CHARS = set('┌┐└┘├┤┬┴┼╔╗╚╝║╠╣╦╩╬┃┻┣┫┳╋')


def _has_box_and_cjk(lines):
    """检查行列表是否同时含盒子绘图字符和 CJK。"""
    found_box = False
    for line in lines:
        if BOX_DRAWING_RE.search(line):
            found_box = True
        if any('\u4e00' <= ch <= '\u9fff' for ch in line):
            return True
    return found_box


def _bar_positions(line):
    """返回一行中所有 │ (U+2502) 的字符位置列表。"""
    return [i for i, ch in enumerate(line) if ch == '│']


def _is_mostly_dashes(segment):
    """判断分段是否主要为边框填充（>60% 非空格字符属于 ─ 系列）。"""
    non_space = [c for c in segment if c != ' ']
    if not non_space:
        return False  # 纯空格不算边框线
    dash_ratio = sum(1 for c in non_space if c in DASH_CHARS) / len(non_space)
    return dash_ratio > 0.6


def _adjust_seg_to_dw(seg, target_dw):
    """把分段 seg 的显示宽度精确调整到 target_dw：
    - 更宽 → 优先删末尾空格，再删末尾 ─ 系列；若末尾是非空格非─内容则停止（不破坏文字）
    - 更窄 → 末尾补宽：若段末尾是 ─ 系列或整体以 ─ 为主，补 ─；否则补空格
    用于边框行(┌─┐/└─┘)把角之间的 ─ 填充精确贴合目标网格。
    """
    dw = disp_width(seg)
    if dw == target_dw:
        return seg
    if dw > target_dw:
        s = seg
        # 先删末尾空格
        while disp_width(s) > target_dw and s and s[-1] == ' ':
            s = s[:-1]
        # 再删末尾 ─ 系列
        while disp_width(s) > target_dw and s and s[-1] in DASH_CHARS:
            s = s[:-1]
        # 若仍超宽且末尾是普通内容，无法安全删（会破坏文字），保留现状
        return s
    # dw < target_dw：补宽
    pad = target_dw - dw
    if seg and seg[-1] in DASH_CHARS:
        return seg + seg[-1] * pad
    if _is_mostly_dashes(seg):
        style = '─'
        for c in seg:
            if c in DASH_CHARS:
                style = c
                break
        return seg + style * pad
    return seg + ' ' * pad


def _align_border_line(line, vcols):
    """对齐不含 │ 但含盒子角(┌┐└┘)的边框行。

    用「最小距离连续窗口」把该行 m 个角映射到 vcols 中连续的 m 条竖线，
    再调整角之间的 ─ 填充数量，使边框线贴合主体 │ 对齐后的网格。
    例如双盒顶边 `┌─┐  HTTP  ┌─┐` → 角落到 [0,40,66,92]（而非两个角重叠吸附）。

    单角行(m==1)：右角(┐/┘)吸附到最右列 vcols[-1]（配合 align_box_art_block
    的"扩展最右列"，只增不减，绝不删文字）；左角(┌/└)保留原样，以免破坏
    流程图分支（如 `   └─ netOk → ...` 的缩进）。
    """
    corner = set('┌┐└┘├┤┬┴┼╔╗╚╝║╠╣╦╩╬┃┻┣┫┳╋')
    marks = []  # [(cur_dw, char_index, char)]
    cur = 0
    for idx, ch in enumerate(line):
        if ch in corner:
            marks.append([cur, idx, ch])
        cur += 1  # 盒子字符/─/空格 均为 1 宽
    m = len(marks)
    if m == 0:
        return line
    if m == 1:
        c = marks[0][2]
        idx = marks[0][1]
        if c in '┐┘':
            # 右角：去掉前导缩进使盒子左缘与 │ 行一致落在 col 0，角放到最右列。
            # 不删文字——只调整前导空格与角后的填充。
            tgt = vcols[-1]
            prefix = line[:idx]
            label = prefix.lstrip()
            suffix = line[idx + 1:]
            pad = tgt - disp_width(label)
            if pad >= 0:
                return label + ' ' * pad + c + suffix
            # 标签比最右列还宽（理论上 step-2 已把最右列扩到此处）：标签后直接接角
            return label + c + suffix
        # 左角/丁字角：保留原样，以免破坏流程图分支（如 `   └─ netOk → ...`）
        return line
    if m > len(vcols):
        return line
    # 特殊处理：m==2 且为顶/底边框（┌┐ 或 └┘）
    # 若起点已在 vcols[0] 附近 → 统一撑满到 [vcols[0], vcols[-1]]（无论终点在哪，防止振荡）
    targets = None
    if m == 2 and marks[0][2] in '┌└' and marks[1][2] in '┐┘':
        if abs(marks[0][0] - vcols[0]) <= 2:
            targets = [vcols[0], vcols[-1]]

    if targets is None:
        # 在 vcols 中找长度为 m 的连续窗口，使各角到对应竖线距离和最小
        best_s, best_cost = 0, None
        for s in range(0, len(vcols) - m + 1):
            cost = sum(abs(marks[i][0] - vcols[s + i]) for i in range(m))
            if best_cost is None or cost < best_cost:
                best_cost, best_s = cost, s
        targets = [vcols[best_s + i] for i in range(m)]

    out = []
    prefix = line[:marks[0][1]]
    p_dw = disp_width(prefix)
    need = targets[0] - p_dw
    if need > 0:
        out.append(prefix + ' ' * need)
    else:
        pre = prefix
        while need < 0 and pre and pre[-1] == ' ':
            pre = pre[:-1]; need += 1
        out.append(pre)
    out.append(marks[0][2])

    for j in range(1, m):
        between = line[marks[j - 1][1] + 1:marks[j][1]]
        cur_dw = sum(disp_width(x) for x in out) + disp_width(between)
        need = targets[j] - cur_dw
        if need != 0:
            between = _adjust_seg_to_dw(between, disp_width(between) + need)
        out.append(between)
        out.append(marks[j][2])

    out.append(line[marks[-1][1] + 1:])
    return ''.join(out)


def align_box_art_block(lines):
    """对齐代码围栏内的盒子绘图。

    策略（累积段宽）：
      1. 把每行按 │ 切成若干「段」（段 i = 第 i 个│ 到第 i+1 个│之间）。
      2. 每段取所有行中的最大显示宽度 seg_max[i]。
      3. 第 k 个 │ 的目标显示列 = 前 k-1 段最大宽度之和。
      这样不同列数的行里，语义相同的竖线（左盒右 / 右盒左 / 右盒右）都落到同一列，
      且盒子宽度由最长内容行决定，短行补空格、内容不被截断。
      对不含 │ 的边框行（┌─┐/└─┘），用最小距离连续窗口映射到同一网格。
    """
    if not _has_box_and_cjk(lines):
        return lines

    bar_idx = [_bar_positions(ln) for ln in lines]
    max_k = max((len(b) for b in bar_idx), default=0)
    if max_k < 2:
        return lines

    # 每段(段 i = │i→│i+1)的最大显示宽度
    # 关键：纯空格/近空格段不参与计算。这既过滤了「补 │ 后产生的空段」，
    # 也防止跨轮振荡——因为填充段永远不撑大 seg_max。
    seg_max = [0] * max_k
    for ln, bpos in zip(lines, bar_idx):
        for i in range(len(bpos) - 1):
            seg_text = ln[bpos[i] + 1:bpos[i + 1]]
            stripped = seg_text.strip()
            # 纯空格段或近空格段（<20% 非空格）→ 跳过，视为自动填充产物
            if not stripped:
                continue
            non_space = sum(1 for c in seg_text if c != ' ')
            if non_space < len(seg_text) * 0.2:
                continue
            w = disp_width(seg_text)
            if w > seg_max[i]:
                seg_max[i] = w

    # 累积目标：target[k] = 第 k 个 │ 的显示列
    # 第 k 个 │ 显示列 = (k-1)个│各占 1 宽 + 前(k-1)段内容最大宽之和
    # 约定 target[1] = 0（第 1 个 │ 在起点）
    target = [0] * (max_k + 1)
    running = 0
    for k in range(2, max_k + 1):
        running += seg_max[k - 2]
        target[k] = (k - 1) + running

    # 扩展最右列：用「无 │ 的纯角行」中落在行尾的右角(┐/┘)扩展 target[max_k]。
    # 这样盒子宽度能容纳比 │ 行更宽的顶/底标签（如 肌电算法说明 的顶行 ┐@49），
    # 使右边缘(┐/│/┘)共线。只扩展右列、不扩展左列，避免破坏流程图分支。
    for ln, bpos in zip(lines, bar_idx):
        if bpos:
            continue  # 只处理不含 │ 的纯角行
        cs = [c for c in ln if c in CORNER_TEE_CHARS]
        if len(cs) != 1 or cs[0] not in '┐┘':
            continue  # 仅处理单右角
        stripped = ln.rstrip()
        if not stripped or stripped[-1] != cs[0]:
            continue  # 该角须在行尾
        cur = 0
        corner_col = None
        for ch in ln:
            if ch == cs[0] and corner_col is None:
                corner_col = cur
            cur += disp_width(ch)
        if corner_col is not None and corner_col > target[max_k]:
            target[max_k] = corner_col

    vcols = sorted(set(target[1:max_k + 1]))

    out = []
    for ln, bpos in zip(lines, bar_idx):
        if len(bpos) >= 2:
            # 含 │ 行：逐 │ 放到 target[k]，段内容原样、段间补/删空格
            new = ''
            prev = 0
            for ki in range(len(bpos)):
                k = ki + 1
                bar_at = bpos[ki]
                seg = ln[prev:bar_at]
                seg_dw = disp_width(seg)
                # 第 k 个 │ 应在显示列 target[k]：seg 紧跟其后（│列 = 当前累计宽 + seg宽），故 seg 需补到 (target[k]-当前累计宽)
                need = (target[k] - disp_width(new)) - seg_dw
                if need > 0:
                    seg += ' ' * need
                elif need < 0:
                    while need < 0 and seg and seg[-1] == ' ':
                        seg = seg[:-1]; need += 1
                new += seg + '│'
                prev = bar_at + 1
            # 残余段（最后一个 │ 之后的内容）
            tail = ln[prev:]
            # 关键修复：若该行 │ 数少于 max_k，补齐剩余的 │ 到完整网格宽度
            if len(bpos) < max_k:
                for ki in range(len(bpos), max_k):
                    k = ki + 1
                    tail_dw = disp_width(tail)
                    need = (target[k] - disp_width(new)) - tail_dw
                    if need > 0:
                        tail += ' ' * need
                    elif need < 0:
                        while need < 0 and tail and tail[-1] == ' ':
                            tail = tail[:-1]; need += 1
                    new += tail + '│'
                    tail = ''  # 后续段为空
                new += tail
            else:
                new += tail
            out.append(new)
        else:
            if any(c in '┌┐└┘┬┴' for c in ln):
                out.append(_align_border_line(ln, vcols))
            else:
                out.append(ln)
    return out


def align_tables_in_text(text):
    lines = text.split('\n')
    out = []
    i = 0
    in_fence = False
    fence_lang = ''  # ```python, ```text, etc.
    fence_lines = []  # 围栏内行缓存
    fence_start_idx = 0
    while i < len(lines):
        raw = lines[i]
        trimmed = raw.strip()
        if trimmed.startswith('```') or trimmed.startswith('~~~'):
            if in_fence:
                # 围栏结束：先对齐盒子绘图（循环到稳定，通常 1-2 轮）
                aligned_fence = align_box_art_block(fence_lines)
                # 再跑一次确认幂等（补 │ 行可能导致 seg_max 微调）
                stabilized = align_box_art_block(aligned_fence)
                if '\n'.join(stabilized) != '\n'.join(aligned_fence):
                    aligned_fence = stabilized  # 第 2 轮有修正，取稳定结果
                out.extend(aligned_fence)
                out.append(raw)  # 结束围栏标记
                fence_lines = []
                in_fence = False
            else:
                # 开始新围栏：记录语言标记（如 ```text）
                out.append(raw)  # 起始围栏标记
                fence_lang = trimmed[3:].strip() if trimmed.startswith('```') else ''
                fence_lines = []
                fence_start_idx = i + 1
                in_fence = True
            i += 1
            continue
        if in_fence:
            fence_lines.append(raw)
            i += 1
            continue
        # 非围栏区域：处理 GFM 表格
        if trimmed.startswith('|'):
            block = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                block.append(lines[i]); i += 1
            if len(block) >= 2:
                out.extend(align_block(block))
            else:
                out.extend(block)
        else:
            out.append(raw); i += 1

    # 文件末尾可能未关闭的围栏（防御性）
    if in_fence and fence_lines:
        aligned_fence = align_box_art_block(fence_lines)
        stabilized = align_box_art_block(aligned_fence)
        if '\n'.join(stabilized) != '\n'.join(aligned_fence):
            aligned_fence = stabilized
        out.extend(aligned_fence)

    return '\n'.join(out)


# ---------- 文件遍历与对齐 ----------
def walk_md(dir_path, out):
    try:
        entries = os.listdir(dir_path)
    except (PermissionError, FileNotFoundError, NotADirectoryError, OSError):
        return
    for name in entries:
        p = os.path.join(dir_path, name)
        if os.path.isdir(p):
            if name.startswith('.'):
                if name in EXCLUDE_DIRS:
                    continue
                continue  # 其他隐藏目录也跳过
            if name in EXCLUDE_DIRS:
                continue
            walk_md(p, out)
        elif os.path.isfile(p):
            if name in EXCLUDE_FILES:
                continue
            if name.endswith('.md'):
                out.append(p)


def align_target(target, subdirs, dry_run):
    if not target:
        return 0, 0, ["未提供路径"]
    target = os.path.abspath(target)
    files = []
    root_for_rel = target
    if target.lower().endswith('.md'):
        if os.path.isfile(target):
            files = [target]
            root_for_rel = os.path.dirname(target)
        else:
            return 0, 0, [f"文件不存在: {target}"]
    elif os.path.isdir(target):
        if subdirs:
            for sd in subdirs:
                sd_path = os.path.join(target, sd)
                if os.path.isdir(sd_path):
                    walk_md(sd_path, files)
                # 非目录的子目录参数静默忽略
        else:
            walk_md(target, files)
    else:
        return 0, 0, [f"目标既不是 .md 文件也不是目录: {target}"]

    files.sort()
    lines = []
    scanned = 0
    affected = 0
    for f in files:
        scanned += 1
        try:
            with open(f, 'r', encoding='utf-8', newline='') as fh:
                text = fh.read()
        except Exception as e:
            lines.append(f"  [跳过] {os.path.relpath(f, root_for_rel)} (读错误: {e})")
            continue
        crlf = '\r\n' in text
        normalized = text.replace('\r\n', '\n').replace('\r', '\n')
        aligned = align_tables_in_text(normalized)
        if aligned == normalized:
            continue  # 已对齐，跳过（幂等）
        affected += 1
        out_text = aligned.replace('\n', '\r\n') if crlf else aligned
        rel = os.path.relpath(f, root_for_rel)
        if dry_run:
            lines.append(f"  [将改动] {rel}")
        else:
            try:
                with open(f, 'w', encoding='utf-8', newline='') as fh:
                    fh.write(out_text)
                lines.append(f"  [已对齐] {rel}")
            except Exception as e:
                lines.append(f"  [写失败] {rel} ({e})")
    return scanned, affected, lines


# ---------- CLI ----------
def run_cli(argv):
    if not argv:
        print("usage: python align.pyw <rootDir|file.md> [subdirs...] [--dry-run]")
        return 2
    dry_run = '--dry-run' in argv or '--check' in argv
    positional = [a for a in argv if not a.startswith('--')]
    if not positional:
        print("missing target")
        return 2
    target = positional[0]
    subdirs = positional[1:]
    scanned, affected, lines = align_target(target, subdirs, dry_run)
    print(f"扫描 md: {scanned}")
    print(f"{'将改动' if dry_run else '已对齐'}: {affected}")
    if lines:
        print('\n'.join(lines))
    print("(dry-run，未写回)" if dry_run else "完成")
    return 0


# ---------- GUI（双击） ----------
def run_gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, scrolledtext
    root = tk.Tk()
    root.title("Markdown 表格对齐器")
    root.geometry("700x560")
    tk.Label(root, text="路径（目录或 .md 文件）：", anchor='w').pack(fill='x', padx=12, pady=(12, 2))
    path_var = tk.StringVar()
    tk.Entry(root, textvariable=path_var).pack(fill='x', padx=12)
    bf = tk.Frame(root)
    bf.pack(fill='x', padx=12, pady=4)
    tk.Button(bf, text="选择目录…", command=lambda: path_var.set(filedialog.askdirectory())).pack(side='left', padx=(0, 6))
    tk.Button(bf, text="选择文件…", command=lambda: path_var.set(filedialog.askopenfilename(filetypes=[('Markdown', '*.md'), ('All', '*.*')]))).pack(side='left')
    tk.Label(root, text="限定子目录（可选，空格分隔，如 docs skills）：", anchor='w').pack(fill='x', padx=12, pady=(6, 2))
    sub_var = tk.StringVar()
    tk.Entry(root, textvariable=sub_var).pack(fill='x', padx=12)
    dry_var = tk.BooleanVar()
    tk.Checkbutton(root, text="仅预演（dry-run，不写回文件）", variable=dry_var).pack(anchor='w', padx=12, pady=(6, 2))

    def do_run():
        t = path_var.get().strip()
        if not t:
            messagebox.showwarning("提示", "请先填写或选择路径")
            return
        subdirs = sub_var.get().split()
        scanned, affected, lines = align_target(t, subdirs, dry_var.get())
        log.delete('1.0', tk.END)
        head = (f"扫描 md: {scanned}\n{'将改动' if dry_var.get() else '已对齐'}: {affected}\n"
                + ("（dry-run，未写回）\n" if dry_var.get() else "") + "\n")
        log.insert(tk.END, head + ('\n'.join(lines) if lines else "（无需改动，已全部对齐）"))

    tk.Button(root, text="开始对齐", command=do_run).pack(anchor='w', padx=12, pady=(4, 8))
    log = scrolledtext.ScrolledText(root)
    log.pack(fill='both', expand=True, padx=12, pady=(0, 12))
    root.mainloop()


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] == '--gui':
        try:
            run_gui()
            return 0
        except Exception as e:
            print(f"GUI 模式启动失败（可能当前无图形界面）：{e}")
            print("请改用命令行模式：python align.pyw <路径> [--dry-run]")
            return 1
    else:
        return run_cli(argv)


if __name__ == '__main__':
    sys.exit(main() or 0)
