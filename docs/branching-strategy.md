# 多线并行分支策略

> 本文档记录 MarkdownReader 多产品线并行开发的分支策略、代码组织和发布方案。

## 当前状态

- `main` 在 v1.0.10 tag，渲染引擎为 Textual
- 唯一外部依赖：Textual v0.3.1+

## 产品线规划

### 当前聚焦：双线并行

| 产品线 | 分支 | 渲染引擎 | 状态 |
|--------|------|----------|------|
| v1.x Textual 维护线 | `release/1.x` | Textual | 维护中（bugfix only） |
| v2.x WKWebView 前进线 | `main` | WKWebView | 开发中 |

### 远期可能性（不纳入当前规划）

| 产品线 | 仓库 | 渲染引擎 | 状态 |
|--------|------|----------|------|
| v3.x Electron 跨平台线 | 独立仓库 | Chromium | 远期可能性 |

如果将来启动跨平台版本，详见 [远期跨平台备忘](#远期跨平台备忘)。

---

## v1.x Textual 维护线

### 分支管理

- 从 v1.0.10 tag 切出 `release/1.x` 分支
- **只修 bug，不做新功能**
- EOL 条件：v2.1.0 发布后进入仅安全修复模式

### 版本发布

- 版本号继续 v1.0.11、v1.0.12...
- Bundle ID：`com.markdownreader.app`（保持不变）
- DMG 分发，文件名：`MarkdownReader-macOS-v1.0.x.dmg`
- GitHub Release tag：`v1.0.x`

### v1 → v2 更新合并展示

在 v1.x 的更新弹窗中同时展示 v2.x 新版本信息，用户可选择更新 v1.x 或直接下载 v2.x。

#### 核心原则

- **不额外弹窗**：v2.x 信息直接集成在 v1.x 的更新弹窗中，不单独弹出
- **永远可见**：不管用户是否更新 v1.x，每次检查更新都能看到 v2.x 信息
- **用户自主选择**：v1.x 更新和 v2.x 下载并列展示，不强制

#### 弹窗布局

```
头部：v1.x 更新（图标 + v1.0.12 版本号）
  → 安装模式提示
  → Release Notes（v1.0.12 的修复内容）
  → 下载进度
  → 按钮区（跳过 / 稍后 / 下载 v1.0.12）

─── 分隔线 ───

v2.x 新版本（不同颜色图标 + v2.0.0 标签）
  → 简要说明：「基于新渲染引擎，支持 Mermaid 图表等扩展功能」
  → 按钮：「下载 v2」（打开 v2.x 的 DMG 下载链接）
```

- v2.x 区域只有「下载 v2」按钮，没有「安装并重启」——因为 v2.x 是不同 Bundle ID 的独立应用，用户需手动拖入 Applications
- 即使 v1.x 没有可用更新，v2.x 区域仍然展示（如果 v2.x 有新 release）

#### UpdateService 改动

当前 `checkForUpdates()` 只查 `releases/latest`，返回单个 release。改造后：

1. 查询 `releases` 列表（不是 `releases/latest`），获取最近的所有 release
2. 分别找到最新的 `v1.*` release 和最新的 `v2.*` release
3. `UpdateViewModel` 持有两个可选的 `GitHubRelease?`：`v1Release` 和 `v2Release`
4. `UpdateView` 根据两个值的存在情况展示不同内容

#### 注意

- 此逻辑只在 `release/1.x` 分支存在，不影响 v2.x 代码

---

## v2.x WKWebView 前进线

### 分支管理

- 使用 `main` 分支
- 渐进式开发，main 在过渡期始终可构建

### 开发阶段

```
阶段 1：加 WebView 视图文件 + WebResources/ 独立目录（不改现有文件）
阶段 2：DisplayMode 切换到 WebView 为默认渲染器
阶段 3：移除 Textual 依赖（v2.0.0 发布）
```

### 核心架构决策

1. **不搞 Renderer 协议抽象**：直接在 `DisplayMode` 枚举里加 case，DetailView 用 ZStack 叠放。这是现有模式，不是新架构。

2. **JS/CSS 代码独立存放**：所有 WebView 相关的前端代码放在 `WebResources/` 目录，强制分离关注点：

```
Sources/MarkdownReader/WebResources/
├── renderer/
│   ├── index.html        # 入口
│   ├── markdown.js       # markdown 渲染封装
│   └── highlight.js      # 代码高亮
├── themes/
│   ├── base.css          # CSS 变量定义
│   └── *.css             # 主题样式
├── bridge.js             # Swift ↔ JS 通信
└── outline.js            # 大纲跳转逻辑
```

独立目录的好处：
- 强制分离关注点：Swift 管 UI 壳，JS/CSS 管渲染逻辑
- 调试效率：可用浏览器 DevTools 直接调试渲染逻辑
- 未来可替换：换 JS 渲染库只改 WebResources 目录
- 远期复用：如果做跨平台版，JS/CSS 代码可直接复用

3. **先硬写再抽象**：不提前设计 Renderer 协议，跑通后再看哪些代码重复了再提取共享层。

### 版本发布

- 版本号从 v2.0.0 开始
- Bundle ID：`com.markdownreader.app.v2`（与 v1.x 不同，实现设置和升级隔离）
- DMG 分发，文件名：`MarkdownReader-macOS-v2.0.x.dmg`
- GitHub Release tag：`v2.0.x`

### 设置隔离

v2.x 使用不同 Bundle ID，macOS 自动隔离：
- UserDefaults（设置不冲突）
- Keychain
- 应用支持目录

两个版本可以并存安装，方便对比测试。

---

## Bug 同步策略

v1.x 和 v2.x 之间的 bug 同步：

- **共享层 bug**（FileService、OutlineService、LocalizationService 等）：手动 cherry-pick，不建立正式同步流程
- **Textual 专属 bug**：只在 v1.x 修复，不同步到 main
- **WKWebView 专属 bug**：只在 main 修复，不同步到 v1.x

实际同步工作量接近零——共享层的纯逻辑 bug 很少，大部分 bug 集中在渲染层（本来就不共享）。

---

## 升级系统隔离

当前使用自建 `UpdateService`（基于 GitHub Releases API），非 Sparkle。

### v1.x vs v2.x 隔离

- 两条线共用同一个 GitHub API 端点，但客户端做 tag 前缀过滤
- v1.x 的 `UpdateService` 只匹配 `v1.*` tag 的 release
- v2.x 的 `UpdateService` 只匹配 `v2.*` tag 的 release
- 不同 Bundle ID → UserDefaults 隔离 → `skippedVersion` 和 `lastUpdateCheckTime` 各自独立，天然不冲突

### v2.x vs 跨平台版隔离

- 天然隔离（不同平台、不同仓库）
- 跨平台版使用独立的 GitHub 仓库，各自发 Release

### 如果将来加 Sparkle

获得 Apple Developer ID 后如果引入 Sparkle，各线用不同 appcast URL：

```
https://markdownreader.com/appcast-v1.xml  → v1.x 更新
https://markdownreader.com/appcast-v2.xml  → v2.x 更新
```

这是 Sparkle 的标准做法，不需要额外开发。

---

## CI/CD 适配

当前 `release.yml` 通过 `v*` tag 触发。双线后用 tag 前缀区分：

- `v1.*` tag → `release/1.x` 分支构建（Textual）
- `v2.*` tag → `main` 分支构建（WKWebView）

可在 workflow 中加分支校验，或使用不同 workflow 文件。

---

## 远期跨平台备忘

> 以下内容为远期可能性，不纳入当前规划。等 v2.x 稳定后再评估是否启动。

### 仓库组织

跨平台版必须独立仓库（零代码共享、CI/CD 不同、Issue 隔离）：

```
github.com/davidhoo/
├── MarkdownReader              (Swift, release/1.x + main v2.x)
└── MarkdownReader-Electron     (JS/TS, Electron 跨平台版)
```

### 技术方案选择

| 框架 | 包体积 | 空闲内存 | macOS 渲染 | 推荐度 |
|------|--------|----------|------------|--------|
| Electron | 150MB+ | 100-200MB | Chromium | 主选 |
| Tauri | 3-10MB | 20-50MB | WKWebView | 备选（更轻量） |

- **Electron**：生态成熟，但包体积违背「极小极轻」的产品定位
- **Tauri**：macOS 上用 WKWebView（和 v2.x 一致），包体积 ~5-10MB，更符合定位；但后端需 Rust，开发量不可低估

如果 Electron 包体积严重影响下载转化率，可切换 Tauri（前端 JS/CSS 代码不变，只换后端）。

### 目标平台

建议 Windows + Linux only，macOS 保留 v2.x 原生版。

理由：
- 产品定位是「原生 macOS 应用」，macOS 用户对原生体验敏感
- Electron 在 macOS 上体验差距明显（字体渲染、滚动惯性、内存占用）
- Typora 的路线：macOS 用原生渲染，Windows/Linux 用 Electron/WebView

### 版本号

跨平台版使用独立版本序列（从 v1.0.0 起），不和 macOS 版共享版本号。避免用户误解为跨平台版落后于 macOS 版。

### 代码复用

v2.x 开发过程中产出的 JS/CSS 代码（WebResources/）可直接复用到跨平台版：
- JS 渲染逻辑（markdown → HTML）
- CSS 主题变量系统
- 大纲跳转的 JS 桥通信
- 查找高亮的 JS 实现

区别只是宿主环境从 WKWebView 变成 Electron BrowserWindow，通信方式从 `WKScriptMessageHandler` 变成 `ipcMain/ipcRenderer`。

### 启动时机

等 v2.x WKWebView 验证通过后再启动跨平台开发。v2.x 就是跨平台版的技术 POC：
- v2.x 渲染效果好、性能可接受 → 跨平台版风险低
- v2.x 有致命问题 → 跨平台版也会有同样问题，不值得投入

可在 v2.x 阶段 1 结束后花 1-2 天搭建跨平台版骨架，验证 JS 代码兼容性。

---

## 核心原则

> **先做 v2.x，跑通了再说。不过度规划。**
