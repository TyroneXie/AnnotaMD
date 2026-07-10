# AnnotaMD

AnnotaMD 是面向本地 Markdown 与 AI Agent 协作的桌面阅读、快编辑和批注工具。

当前 V2 基于 MarkText 的开源编辑器能力进行二次开发，重点提供：

- 所见即所得的 Markdown 快编辑体验
- 文件夹侧栏、多文件标签页与大纲导航
- 选区批注、全文批注以及本地 JSON 批注存储
- 供本地 Agent 读取和处理批注的协作入口
- 飞书风格的块菜单、浮动格式工具栏、代码块和图表控件
- Mermaid 图表、表格、代码高亮与图片全屏预览
- 中文和英文界面

## 开发

环境要求：Node.js 20.19+、pnpm 10+。

```bash
pnpm install
pnpm dev
```

自动打开指定 Markdown 文件：

```bash
cd packages/desktop
ANNOTAMD_OPEN_FILE=/absolute/path/to/document.md \
  ./node_modules/.bin/electron-vite --remoteDebuggingPort 9222 dev -- \
  '--remote-allow-origins=*'
```

## 验证

```bash
pnpm --filter marktext test:unit
pnpm --filter marktext typecheck:annotamd
```

## 项目资料

- 产品与架构资料：[`docs/`](docs/)
- V2 视觉原型：[`web/v2/`](web/v2/)
- V2 迁移方案：[`docs/v2-marktext-migration-plan.md`](docs/v2-marktext-migration-plan.md)

## 致谢与许可

AnnotaMD V2 基于 [MarkText](https://github.com/marktext/marktext) 开源项目开发，感谢 MarkText 及其贡献者提供的编辑器基础能力。

本项目延续上游的 MIT License，详见 [`LICENSE`](LICENSE)。
