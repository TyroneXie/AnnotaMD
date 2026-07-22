<h1 align="center">AnnotaMD</h1>

<p align="center">
  <strong>本地优先、具有飞书文档体验的所见即所得 Markdown 编辑器</strong><br/>
  <sub>保留 Markdown 的开放与可迁移，加入批注联动与 Agent 协作能力</sub>
</p>

<p align="center">
  <a href="https://github.com/TyroneXie/AnnotaMD/releases"><img src="https://img.shields.io/github/v/release/TyroneXie/AnnotaMD?style=flat-square&label=Release&color=1b9e6b" alt="Latest Release" /></a>
  <a href="https://github.com/TyroneXie/AnnotaMD/blob/main/LICENSE"><img src="https://img.shields.io/github/license/TyroneXie/AnnotaMD?style=flat-square&label=License&color=6b7a71" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Electron-42-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/macOS-arm64%20%7C%20x64-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-x64%20%7C%20arm64-0078D4?style=flat-square&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Linux-x64-FCC624?style=flat-square&logo=linux&logoColor=black" alt="Linux" />
</p>

---

<p align="center">
  <img src="docs/assets/annotamd-readme-showcase.png" alt="AnnotaMD — 本地优先的所见即所得 Markdown 编辑器" width="100%" />
</p>

## ✨ 主要特性

<table>
  <tr>
    <td width="50%">
      <h3>📝 所见即所得快编辑</h3>
      <p>默认直接编辑渲染后的 Markdown，不需要在阅读与源码模式之间反复切换。表格、代码块、Mermaid 图表、任务列表——一切都在文档中即时呈现。</p>
    </td>
    <td width="50%">
      <h3>🎨 飞书式交互体验</h3>
      <p>现代三栏布局、块菜单、选区浮动工具栏、紧凑代码块和图表工具栏。熟悉的现代文档编辑器交互方式，零学习成本。</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>💬 面向 Agent 的批注</h3>
      <p>支持选区批注与全文批注，批注独立存储、不污染 Markdown 正文。本地 AI Agent 可直接读取批注、定位原文并按意见修改文档。</p>
    </td>
    <td width="50%">
      <h3>🏠 本地优先</h3>
      <p>直接打开本地文件和文件夹，同时管理多个工作区、文件标签页和文档大纲。文件始终是开放的 Markdown，随时可用其他工具打开或迁移。</p>
    </td>
  </tr>
</table>

<details>
<summary><strong>更多能力</strong></summary>

- **完整 Markdown 支持** — 表格、任务列表、代码高亮、行号、自动换行、Mermaid 图表、图片预览与四角缩放等。
- **源码模式** — 需要精确修改 Markdown 时，可从"视图"菜单切换源码模式，编辑宽度与所见即所得模式一致。
- **图片编辑** — 飞书式图片块菜单，支持四角等比缩放、磁吸全宽、对齐方式切换。
- **表格增强** — 列拖拽调整宽度、标题行吸顶、横向滚动、紧凑列布局。
- **链接编辑** — 飞书式链接编辑器，支持复制链接地址和原始 URL。
- **多语言界面** — 中文 / English 双语支持，跟随系统语言自动切换。

</details>

## 📥 下载

前往 [GitHub Releases](https://github.com/TyroneXie/AnnotaMD/releases) 下载最新版本，支持 macOS（arm64 / x64）、Windows（x64 / arm64）和 Linux（x64）。

### macOS 用户提示

当前使用免费 ad-hoc 签名，未经过 Apple 公证。首次打开时如被系统阻止：

> **系统设置 → 隐私与安全性 → 安全性 → 找到 AnnotaMD → 点击"仍要打开"**
>
> 确认一次后，后续可正常双击启动。

## 🔄 批注与 Agent 协作

AnnotaMD 不是在线协作文档，而是**连接本地 Markdown 与 AI Agent 的审阅界面**：

```
选中正文 → 留下批注 → Agent 读取 → 修改原文件
```

1. 在文档中选中文字并添加批注
2. 批注保存在本地元数据中，不写入 Markdown 渲染正文
3. 本地 Agent 可读取批注、定位原文，并按意见修改 Markdown
4. 后续版本会继续完善 SQLite 存储和更标准的 Agent 工具接入

## 🛠 开发

环境要求：**Node.js 20.19+**、**pnpm 10+**。

```bash
pnpm install
pnpm dev
```

自动打开指定文档进行调试：

```bash
cd packages/desktop
ANNOTAMD_OPEN_FILE=/absolute/path/to/document.md \
  ./node_modules/.bin/electron-vite --remoteDebuggingPort 9222 dev -- \
  '--remote-allow-origins=*'
```

运行验证：

```bash
npm run verify:quick     # 核心模块快速冒烟
npm run verify:feature   # 跨模块功能验证
npm run build            # Electron production build
```

## 📂 项目结构

```
AnnotaMD/
├── packages/
│   ├── desktop/          # Electron 桌面应用
│   ├── muyajs/           # Muya 编辑器引擎
│   └── ...
├── docs/                 # 开发与发布资料
├── scripts/              # 验证与构建脚本
└── web/                  # 视觉原型
```

## 📖 项目资料

- 开发与发布资料：[`docs/`](docs/)

## 🙏 致谢与许可

AnnotaMD 使用 Muya 开源编辑器内核，并在此基础上持续发展本地写作、批注与 Agent 协作能力。

本项目采用 [MIT License](LICENSE)。上游代码与依赖的版权和许可声明见
[`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt)。
