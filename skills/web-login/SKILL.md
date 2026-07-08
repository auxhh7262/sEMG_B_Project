# web-login —— 知网(CNKI)专用 自动登录 Skill

## 触发词
登录知网 / 知网登录 / 自动登录知网 / 登录研学 / 采集知网论文 / 知网论文入库

## 功能定位
本 skill **仅适用于知网(cnki.net)这一个网站**，用户名/密码已固定为项目共用账号
（**不可改动**）。它自动打开知网研学登录页、填入固定账号、勾选协议、点击登录，
并可跳过登录后的安全提示弹窗（如「密码强度不足，请尽快修改密码」→ 点「跳过」）。

它是 sEMG 项目「知网论文自动采集」工作流的前置与核心组件：
登录后配合 xbrowser，在 **我的专题 > hzy > 运动护腕** 下检索 sEMG 相关论文、
加入该专题，并下载到本地 `E:\sEMG_B_Project\docs\知网论文` 目录。

## 约束
- 只接受 cnki.net / x.cnki.net / login.cnki.net / kns.cnki.net 域名，其它 URL 一律拒绝。
- `--user` / `--password` / `--url` 均已固定；外部传入会被忽略并告警。
- 账号：`qbzxyx30` / `11223373`（项目共用，勿改）。

## 前置依赖
1. xbrowser 已初始化：`xb init` 返回 `status: ready`
2. 已配置浏览器（推荐 edge）：xbrowser 的 config.json 中 `"browser": "edge"`
3. node 运行时（脚本自动探测，或用 `--node` 指定）

## 调用方式
脚本路径：`E:\sEMG_B_Project\skills\web-login\web_login.pyw`

```powershell
# 最简：登录知网研学（固定账号，自动跳过安全提示）
pythonw E:\sEMG_B_Project\skills\web-login\web_login.pyw `
  --agree --skip-text "跳过" `
  --screenshot "C:\Users\honghuang\.qclaw\workspace\cnki_login.png"
```

参数说明：
| 参数 | 必填 | 说明 |
|------|------|------|
| `--url` | 否 | 固定为知网研学地址，无需传 |
| `--user` | 否 | 固定账号，传入会被忽略 |
| `--password` | 否 | 固定密码，传入会被忽略 |
| `--browser` | 否 | `edge`(默认) / `chrome` |
| `--agree` | 否 | 勾选页面第一个 checkbox（协议/我已阅读） |
| `--skip-text` | 否 | 登录后点击文字匹配的按钮，如 `跳过` |
| `--user-ref/--pass-ref/--login-ref/--agree-ref/--skip-ref` | 否 | 显式指定 @ref（绕过自动识别） |
| `--screenshot` | 否 | 登录完成后截图路径 |
| `--out` | 否 | 结果 JSON 路径（默认 `web_login_result.json`） |
| `--wait` | 否 | 点击登录后等待秒数，默认 5 |

## 输出
写入 `--out` 的 JSON（默认 `web_login_result.json`）并打印一行 JSON：
`ok`(bool) / `url`(最终地址) / `steps`(各步结果) / `error`(失败原因)。

## 登录流程（脚本自动完成）
1. `xb run open <知网URL>`
2. `snapshot -i` 识别 用户名/密码/登录按钮/协议框
3. 填固定账号、填固定密码
4. `--agree`：勾选协议
5. 重新快照取最新登录按钮 ref，点击登录
6. `--skip-text`：点击匹配按钮（跳过安全提示）
7. 取最终 URL + 截图

---

## 附：sEMG 论文采集工作流（Agent 驱动 xbrowser 执行）

登录后，按以下流程把项目相关论文加入「运动护腕」并下载到本地：

**目标路径**：我的专题 > hzy > 运动护腕
**本地路径**：`E:\sEMG_B_Project\docs\知网论文`（首次需新建子目录）

### 步骤
1. 登录知网研学（用本 skill）。
2. 进入「我的学习 / 我的专题 / hzy / 运动护腕」，确认其为当前激活专题。
3. 用主面板「检索添加」检索 sEMG 相关词，例如：
   - `肌电信号采集电路设计`
   - `表面肌电信号处理`
   - `肌电疲劳`
   - `肌电信号特征提取`
   - `表面肌电 假肢` 等
4. 在检索结果中逐页勾选与 sEMG/肌电直接相关的论文（排除纯脑电/心电等无关项）。
5. 点击「收藏到专题」→ 选择「运动护腕」批量加入。
6. 下载：逐篇或批量「下载」PDF，保存到 `E:\sEMG_B_Project\docs\知网论文`。
   - 若 xbrowser 下载路径不可配，先下到 Edge 默认目录，再用 PowerShell 移动到上述子目录。

### 注意事项
- 检索结果页用 `find text "<词>" click` 触发搜索；翻页用 `find text "下一页" click`。
- 「收藏到专题」会加入到**当前激活专题**，务必先确认激活的是「运动护腕」。
- 论文下载受知网权限/积分限制，部分论文可能仅能在线阅读、无法下载 PDF。
- 侧栏 treeitem 在 `snapshot -i` 中时有时无，必要时用 `find text` 或坐标右键操作。
