# AnnotaMD v2.10.1

本版本是 Electron 43 性能优化版本的正式修复构建。v2.10.0 标签触发的流水线在创建 GitHub Release 前因 Linux 原生模块编译器不兼容而停止，没有生成对外 Release；v2.10.1 保留全部性能改进，并修复 Linux 打包链。

## Electron 43 与启动性能

- Electron 从 42.1.0 直接升级到 43.1.1，使用新版 Chromium、Node.js 和 V8，并获得主进程启动快照、preload 字节码缓存及沙箱 renderer 启动优化。
- 编辑器、设置容器和各设置分类改为按路由加载，Element Plus 只加载实际使用的组件与样式。
- renderer 初始 JavaScript 由约 7.34 MB 降至 1.62 MB，gzip 由约 1.52 MB 降至 0.379 MB，分别减少约 78% 和 75%；初始 CSS 减少约 52%。
- 同机 production 构建的 10 次启动样本中，p50 由约 1,001 ms 降至 933 ms，p95 由约 1,336 ms 降至 966 ms。该数据用于相同环境下的相对比较。

## 大文档与输入响应

- 每次输入直接复用编辑器已经产生的状态快照，避免重复深拷贝和重复生成 Markdown；字数统计、目录刷新和完整撤销历史序列化移出每个按键的关键路径。
- dirty 状态的 1 MB 文本哈希微基准由约 16.1 ms 降至 1.61 ms，成本降低约 90%。
- 修复表格单元格创建时反复深拷贝并遍历整篇文档的近似 O(n²) 热点，并避免新文档首次打开时构建两遍。
- 表格密集验证文档 `design-2026-06-30-review.md` 包含 51 张表格和 1,513 个单元格；在已启动的 production Electron 中，打开阶段由 4,063 ms 降至 430 ms，改善约 89.4%，最终 DOM 与 Markdown 往返内容一致。

## 批注、表格与目录

- 批注锚点只在坐标实际变化时写入，连续持久化任务自动合并；批注高亮、文本校验和评论栏定位复用同一份 DOM 索引与 Range。
- 批注卡片布局按帧合并并缓存高度；sticky table header 只在几何失效时重新测量。
- 打开目录时只读取 Markdown 文件元数据，目录事件批量发送、插入和排序；1,000/10,000 文件树微基准分别由约 11.22/309.17 ms 降至 2.82/19.59 ms。
- macOS 默认使用原生文件事件，网络盘和云盘仍保留 polling 回退。

## Agent 默认设置

- 新安装默认开启“允许 Agent 访问文档评论”，配置完成的本地 Agent 可直接读取和处理保存在本机的评论。
- 已有用户的持久化选择不会被覆盖，仍可随时在“设置 → Agent”中关闭。

## Linux 发布修复

- Electron 43 的 Linux V8 二进制使用 Clang 构建。v2.10.0 流水线虽然为 `native-keymap` 启用了 C++20，但 `electron-rebuild` 仍默认调用 GCC，导致 V8 头文件中的导出属性无法解析。
- Electron 43 对应的 Chromium 150 已把预编译 Clang 包从 `.tgz` 改为 `.tar.xz`，当前 `@electron/rebuild` 的 `--use-electron-clang` 仍请求旧格式地址并返回 404，因此不能依赖该下载路径。
- v2.10.1 的 Linux Release、Build 和 E2E 流水线在 Ubuntu 24.04 的 job 级别统一安装并导出系统 `clang/clang++`，覆盖 postinstall 与正式打包中的全部原生模块重建；较旧的 Ubuntu 22.04 默认 Clang 14 不支持 Electron 43 V8 头文件所需的 `std::source_location`。macOS 与 Windows 构建链保持不变。

## 发布流程防回归

- 正式版本 tag 改为在候选提交完成 Linux、Windows x64/arm64、macOS x64/arm64 五平台预检后创建，跨平台失败可以在同一候选版本内修复和重跑，不再提前占用正式版本号。
- 发布规范记录了 pnpm 冻结锁文件配置不一致、Linux 多格式打包缓存竞争、Electron 大版本原生模块工具链三类已确认故障，并要求保留与 tag commit 一致的预检 Build run ID。

## 验证说明

- desktop 全量单元测试：93 个文件、892 项通过。
- Muya 全量单元测试：241 个文件、1,698 项通过。
- 跨模块功能验证：menu、table、comments、editor 与批注 OT 共 325 项通过。
- AnnotaMD TypeScript 检查和 Electron production build 已通过。
- 已从新生成的 macOS Apple Silicon 应用产物启动表格密集真实文档，确认包内版本 2.10.1、Electron 43.1.1、51 张原始表格、长文档滚动吸顶和窗口显示正常。
- GitHub Actions 将重新构建并验收 Linux、macOS x64/arm64、Windows x64/arm64 产物与 `SHA256SUMS.txt`。

## macOS 安装提示

当前发行构建使用免费 ad-hoc 签名，暂未使用 Apple Developer ID 签名和公证。将 AnnotaMD 拖入“应用程序”后，如 macOS 阻止启动，可执行：

```bash
xattr -cr /Applications/AnnotaMD.app
```

也可以在“系统设置 → 隐私与安全性”中选择“仍要打开”。

## 下载校验

所有安装包均记录在 Release 的 `SHA256SUMS.txt` 中，可在下载目录执行：

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

## 完整变更

[查看 v2.10.0 到 v2.10.1 的完整提交差异](https://github.com/TyroneXie/AnnotaMD/compare/v2.10.0...v2.10.1)

## 致谢

AnnotaMD 基于 MarkText 与 Muya 的开源编辑器能力开发，感谢所有上游贡献者。
