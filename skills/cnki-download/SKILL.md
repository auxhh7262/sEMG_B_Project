# cnki-download 知网研学论文下载

> 基于 2026-07-09 实测流程封装的稳定下载工具

## 触发词

- 「知网下载 关键词=xxx」
- 「cnki下载 关键词=xxx」
- 「下载知网论文 关键词=xxx」

## 核心能力

- 自动登录知网研学（默认 qbzxyx30 / 11223373）
- 从「我的专题 → hzy → 运动护腕」批量下载论文
- 支持 PDF/CAJ 格式自动回退
- GUI + CLI 双模式

## 使用方式

### GUI（双击 .pyw）

```powershell
pythonw E:\sEMG_B_Project\skills\cnki-download\cnki_download.pyw
```

填账号密码 → 选目录 → 点「开始下载」

### CLI

```powershell
# 默认（10篇 PDF 优先）
pythonw E:\sEMG_B_Project\skills\cnki-download\cnki_download.pyw --cli --no-gui

# 限制篇数
pythonw E:\sEMG_B_Project\skills\cnki-download\cnki_download.pyw --cli --no-gui --max 5

# CAJ 优先
pythonw E:\sEMG_B_Project\skills\cnki-download\cnki_download.pyw --cli --no-gui --format CAJ,PDF

# 自定义目录
pythonw E:\sEMG_B_Project\skills\cnki-download\cnki_download.pyw --cli --no-gui --output "E:\docs\papers"
```

## 已验证下载流程

```
[1/6] 检查登录态 → 未登录则自动填表登录
[2/6] 进入 MyStudy 专题页
[3/6] 读取 td.is-Title a 文章列表
[4/6] 逐篇：
  a. 点击文章 A 标签触发 Vue 路由
  b. 等待 xmlRead 页面加载
  c. .click() 触发 .xDownLoad-popover__item 中 PDF/CAJ
  d. 监控 Downloads 目录捕获新文件
  e. 复制到目标目录（v2/v3 重命名防冲突）
[5/6] 输出统计
```

## 关键技术细节

| 步骤 | 实现 |
|------|------|
| 登录 | `input[type="text"]` + `input[type="password"]` + submit button |
| 列文章 | `document.querySelectorAll('td.is-Title a')` |
| 进入阅读 | click 第 i 个 A 标签（SPA 路由必须用 click 不用 navigate） |
| 触发下载 | `document.querySelectorAll('.xDownLoad-popover__item')[i].click()` |
| 等待文件 | 监控 `C:\Users\honghuang\Downloads` 文件大小稳定后捕获 |

## 已知坑

1. **必须走 MyStudy → 子专题路径**，搜索页不能直接下载
2. **不能 navigate 触发 SPA 路由**，必须 click A 标签
3. **下载弹窗不需显示**，直接 click item 即可触发
4. **浏览器启动后必须先登录**，cookie 持久化在 Edge profile
5. **每次会话后必须重登**，关闭浏览器后 cookie 失效

## 依赖

- xbrowser 技能：`C:\Users\honghuang\.qclaw\skills\xbrowser\scripts\xb.cjs`
- Node.js：`D:\Program Files\QClaw\v0.2.32.610\resources\node\node.exe`
- Edge 浏览器（系统已装）

## 历史战绩

- 2026-07-09：成功下载 3 篇 sEMG 论文
  - 表面肌电信号采集设备的电路设计研究_荣华.pdf
  - 表面肌电信号采集电路的设计_韩晓新.pdf
  - 基于深度学习的手部肌电信号识别与交互控制研究_王虎.caj
- 已封装为 skill，无需再手动调试

## 文件

```
E:\sEMG_B_Project\skills\cnki-download\
├── cnki_download.pyw   19KB  GUI + CLI
└── SKILL.md            本文档
```
