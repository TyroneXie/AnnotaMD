# AnnotaMD v2.8.1

本版本正式交付 Emoji、HTML 块、完整图标主题和重新整理后的设置体验，并修复 v2.8.0 发布流水线的依赖锁文件问题。

## 新增能力

- 新增 Emoji 表情入口，可在所见即所得文档中插入并稳定保存，重新打开后不会消失。
- 新增 HTML 块渲染预览，并对空 HTML 块进行安全降级，避免预览异常。
- 新增 11 套可切换图标主题：Tabler、Lucide、Heroicons、Feather、自绘 SVG、Phosphor、Remix、Material Symbols、Hugeicons、Material Design Icons 和 Bootstrap Icons。
- 图标库资源随应用本地提供，切换主题不依赖网络。
- 外观设置支持主题预览，并集中管理主题、语言、字体、代码块和图标主题。

## 编辑体验改进

- 统一快捷插入菜单、块菜单和浮动工具栏中的段落、标题、引用、高亮、HTML、代码、列表、图表与图片图标。
- 为复制章节、创建副本、上下插入、标题层级升降和整节移动使用不同图形；所有主题均经过重复图标检查。
- 当前文件与“已打开的文件”列表保持同步，并让文件列表充分使用侧栏剩余高度。
- 设置页重新归并为更清晰的分类，控件更紧凑、对齐更统一，并移除不再需要的排除模式等专家项。

## 修复

- 修复 Emoji 插入后重新打开文档时内容丢失的问题。
- 修复 HTML 等渲染块在所见即所得模式下出现错误文字块菜单或源码表现的问题。
- 修复标题块菜单进入时图标重叠、标题数字位置不统一的问题。
- 修复部分图标主题在同一个块菜单中复用相同图形、导致操作含义难以区分的问题。
- 同步 pnpm overrides 与锁文件，确保 GitHub Actions 在 macOS、Windows 和 Linux 上可使用 frozen lockfile 安装依赖。

## 验证说明

- 已运行菜单、表格、批注核心回归与跨模块功能验证。
- Muya 全量测试 1684 项全部通过；桌面端全量测试 841 项通过，另有 13 项在 v2.7.1 基线中已存在的旧断言失败（空状态按钮、格式菜单测试夹具和侧栏初始状态），与本次改动无关。
- 本版本新增或调整的桌面端回归测试 15 项全部通过，AnnotaMD TypeScript 检查与 Electron production build 通过。
- 已使用 CI 相同的 pnpm 10.33.4 验证 frozen lockfile；并在 macOS Apple Silicon 从本次新生成的应用产物打开真实长文档完成界面冒烟验证。

## macOS 安装提示

当前构建使用免费 ad-hoc 签名，暂未使用 Apple Developer ID 签名和公证。将 AnnotaMD 拖入“应用程序”后，如 macOS 阻止启动，可执行：

```bash
xattr -cr /Applications/AnnotaMD.app
```

也可以在“系统设置 → 隐私与安全性”中选择“仍要打开”。

## 致谢

AnnotaMD 基于 MarkText 与 Muya 的开源编辑器能力开发，感谢所有上游贡献者和图标库维护者。
