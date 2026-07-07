# AnnotaMD

面向 AI agent 协作的 macOS Markdown 阅读、批注与编辑工具。

AnnotaMD 解决的是一个很具体的问题：Markdown 文件经常散落在不同项目里，AI agent 写完方案、设计稿、评审文档之后，你需要像在飞书或 Word 里一样直接对渲染后的内容做批注、标注和修改意见，然后让 AI 根据这些意见继续改。AnnotaMD 保留 Markdown 纯文本文件本身，同时提供渲染阅读、源码编辑、选中批注和复制给 AI 的工作流。

![macOS 14+](https://img.shields.io/badge/macOS-14+-blue)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

## 核心能力

| 能力 | 说明 |
|------|------|
| 阅读 / 编辑双模式 | 阅读模式查看渲染后的 Markdown，编辑模式直接修改源码，支持保存、撤销/重做 |
| 双击定位编辑 | 在阅读模式双击段落，自动切到编辑模式并跳到对应源码位置 |
| 选中文字工具条 | 支持正文/标题级别、加粗、斜体、下划线、行内代码、删除、高亮和评论 |
| CriticMarkup 批注 | 批注以纯文本 CriticMarkup 写回 Markdown，AI agent 可以直接读取并按意见修改 |
| 复制给 AI | 一键复制带说明的 CriticMarkup 全文，粘贴给任意 AI 继续修订 |
| 表格增强 | 表格默认与正文同宽，超宽时只在表格内部横向滚动，支持拖拽单列调宽 |
| 图片与图表缩放 | 图片、Mermaid、PlantUML 默认撑满画布，支持按钮和 Mac 触控板手势独立缩放 |
| 代码块优化 | 显示代码语言，默认自动换行，长代码不再撑宽页面 |
| 大纲导航 | 右侧大纲默认打开，适合长文档快速定位 |
| 窗口大小记忆 | 可在设置中开启启动时保持上次退出前窗口大小 |

## 适合的场景

- 审阅 AI 生成的 Markdown 方案、设计文档、接口说明、PRD、调研报告
- 在渲染页面上直接留下“这里删掉”“这里补充”“这段改标题”等修改意见
- 把修改意见保存在 Markdown 文件里，让本地 AI agent 或对话模型继续处理
- 在分散的项目目录中打开单个 `.md` 文件，不需要统一导入到笔记库

## 批注方式

阅读模式下选中文本，会出现浮动工具条：

- `T`：改为正文或 H1-H6 标题
- `B` / `I` / `U`：加粗、斜体、下划线
- `</>`：行内代码
- `S`：删除建议
- `A`：高亮
- 评论图标：添加评论

批注会写成 CriticMarkup。它仍然是普通 Markdown 文本，不绑定私有数据库，也方便 AI agent 读取。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘O` | 打开文件或文件夹 |
| `⌘S` | 保存文件 |
| `⌘⇧E` | 切换阅读 / 编辑模式 |
| `⌘B` / `⌘I` / `⌘U` | 加粗 / 斜体 / 下划线 |
| `⌘⇧K` | 行内代码 |
| `⌘⇧C` | 复制带批注的全文给 AI |
| `⌘F` | 查找 |
| `⌘[` / `⌘]` | 后退 / 前进 |
| `⌘\` | 显示 / 隐藏侧边栏 |
| `⌘,` | 设置 |

## 支持的渲染

- GitHub Flavored Markdown
- 表格、任务列表、脚注、删除线
- Mermaid
- PlantUML
- KaTeX 数学公式
- Prism.js 代码高亮
- 本地和远程图片
- PDF 导出
- Finder Quick Look 预览

## 安装

从 GitHub Releases 下载 `AnnotaMD.dmg`，打开后把 `AnnotaMD.app` 拖到 Applications。

如果首次打开遇到 macOS 安全提示，可以右键 App 选择“打开”，或运行：

```bash
xattr -cr /Applications/AnnotaMD.app
```

系统要求：macOS 14.0 或更高版本，支持 Apple Silicon 和 Intel Mac。

## 构建

```bash
swift build
swift test

# 构建 .app
./build-app.sh --release --sign

# 构建 DMG
./package.sh
```

构建产物：

- `AnnotaMD.app`
- `AnnotaMD.dmg`

## 致谢

AnnotaMD fork 自 [easychen/markmark](https://github.com/easychen/markmark)。感谢原项目提供的 macOS Markdown 评论功能。

## License

MIT
