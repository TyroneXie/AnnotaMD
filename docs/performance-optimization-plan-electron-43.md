# AnnotaMD 性能优化方案：Electron 43 与应用层热点

> 状态：实施中（批次 A、B 与批次 C 第一阶段已完成，尚未合并发布）
> 形成日期：2026-07-19
> 适用基线：AnnotaMD 2.9.0 工作树、Electron 42.1.0
> 目标：下一版本集中改善冷启动、首次绘制、大文档输入、批注文档输入和大型目录加载性能。

## 1. 结论

下一版本直接从 Electron 42.1.0 升级到 43.1.1，不经过 42.7.0。Electron 43 的 Node
启动快照、Electron 框架与 preload V8 字节码缓存、沙箱 renderer 启动数据前推，能够直接
改善 AnnotaMD 当前的沙箱窗口启动路径。

Electron 升级只是底座优化。当前代码中更大的应用层收益来自以下四项：

1. 拆分编辑器与设置页的 renderer 首屏包。
2. 合并每次输入触发的全文序列化、深拷贝、统计和 TOC 计算。
3. 合并批注锚点更新与 SQLite 持久化，复用 DOM Range 计算。
4. 打开目录时不读取每个 Markdown 文件的完整内容，并批量构建文件树。

实施顺序应先建立基准，再升级 Electron，然后依次处理确定性热点。没有基准数据前不做
大范围重构，也不把窗口延迟显示等感知优化当作实际计算量下降。

## 2. 当前基线

本节数据来自 2026-07-19 的只读代码和 production 构建产物审计，不代表优化后的目标值。

| 项目 | 当前值 |
| --- | ---: |
| Electron 声明版本 | `~42.1.0` |
| lockfile 实际版本 | `42.1.0` |
| renderer 产物总大小 | 约 23 MB |
| renderer JavaScript 原始大小 | 约 18.45 MB |
| renderer JavaScript gzip 合计 | 约 4.42 MB |
| renderer 主入口 | 约 7.34 MB，gzip 约 1.52 MB |
| main bundle | 约 1.10 MB |
| preload bundle | 约 24 KB |
| 默认长文档 `design.md` | 81,677 字节、1,329 行 |

简单微基准显示，仅全文 BigInt 哈希和字数统计在 100 KB、500 KB、1 MB 文档上分别约需
2.3 ms、11.6 ms、22 ms。批注快照的同步 gzip 和 SHA-256 在默认长文档、500 KB、1 MB
文档上分别约需 1.3 ms、12.2 ms、25.1 ms。实际输入路径还包含 Markdown 生成、多个状态
深拷贝、history、TOC 和 DOM 高亮，因此不能用这些数值代替完整运行基准。

## 3. 统一验收基准

### 3.1 启动

在新生成的 production 安装包上分别测量冷启动和热启动，每组至少 10 次：

- 进程创建到 `app.ready`。
- 进程创建到 renderer 首次有效绘制。
- 进程创建到编辑器可接收输入。
- 恢复一个普通文件和恢复一个多标签工作区的 p50、p95。

通过主进程时间戳、renderer `performance.mark` 和 Playwright/Electron 冒烟脚本采集，避免
依赖人工秒表。Electron 升级前后使用相同机器、相同文档、相同工作区和相同构建模式。

### 3.2 编辑

使用约 80 KB、500 KB、1 MB 三档文档，分别测试无批注、20 条批注和 100 条批注：

- 连续输入时 key-to-paint 的 p50、p95。
- 50 ms 以上 Long Task 的数量和最长耗时。
- 单次输入触发的 `getMarkdown`、`getState`、`getHistory`、`getTOC` 次数。
- renderer 和 main 进程 CPU 峰值。
- 批注 IPC 次数、待持久化队列最大长度和 SQLite 事务次数。

### 3.3 目录与空闲状态

准备包含 1,000 和 10,000 个 Markdown 文件的本地测试目录：

- 首次出现完整文件树的时间。
- 初次扫描读取的文件内容字节数。
- 文件树事件数、renderer 更新批次数和排序次数。
- 打开目录后的空闲 CPU 与唤醒次数。
- macOS 原生监听、本地轮询、云盘目录三种场景的正确性和资源占用。

## 4. P0：直接升级 Electron 43.1.1

### 改动

- 根目录和 `packages/desktop` 的 Electron 版本同步改为 `~43.1.1`。
- 更新 lockfile，不保留 42.x Electron 二进制依赖。
- 不先发布或提交 42.7.0 过渡版本。

### 预期收益

- 主进程从内嵌 Node 启动快照恢复。
- Electron 框架代码和 preload 使用编译后的 V8 字节码缓存。
- 沙箱 renderer 的启动数据在导航前推送，避免启动阶段的阻塞 IPC。
- V8 15、Chromium 150 以及 Electron 内部 IPC、事件发送和转换热路径优化。

### 兼容检查

- Linux `frame: false` 窗口默认圆角是否符合现有设计；必要时显式设置
  `roundedCorners`。
- 下载默认目录变化是否影响导出、附件或更新流程。
- `nativeImage` 统一转换到 sRGB 后，应用图标、剪贴板和图片导出颜色是否一致。
- Linux Window Controls Overlay 和隐藏文件选择行为。
- macOS arm64/x64、Windows x64/arm64、Linux 构建及原生依赖加载。

## 5. P0：缩小 renderer 首屏工作量

### 已确认问题

`router/index.ts` 同步导入编辑器、设置容器和所有设置页。编辑窗口和设置窗口因此共享一个
大入口。`main.ts` 又全局安装完整 Element Plus 和完整 CSS。当前主入口原始大小约 7.34 MB。

### 改动

1. 将编辑器页面和设置页面改为动态路由导入。
2. General、Editing、Theme、Image、Keybindings、Agent 设置页分别懒加载。
3. Element Plus 改成实际使用组件的按需导入和按需样式。
4. Mermaid、Vega、KaTeX、导出与不在首屏出现的工具继续按功能边界加载。
5. 保持 main/preload API 和安全边界不变，不为拆包引入新的全局状态层。

### 验收

- 编辑窗口首次加载不再请求设置页 chunk。
- 设置窗口只加载当前设置分类及公共壳层。
- 记录主入口和首次加载 gzip 体积，目标为相对基线有明确下降，不只观察总产物大小。
- 验证编辑器、每个设置分类、主题样式和首次打开懒加载功能均无闪烁或缺失。

## 6. P0：合并每次输入的全文计算

### 已确认问题

Muya `json-change` 每帧触发后，桌面层会获取完整 Markdown、完整 history、TOC 和完整状态，
同时执行字数统计、游标序列化和全文内容哈希。Muya 内部对状态变更也会保存前后文档快照，
形成重复的 O(文档长度) 工作。

### 改动

1. 复用 `json-change` 已提供的 `doc`，避免同一帧再次 `getState()`。
2. 为一次变更构造一个共享派生结果，Markdown、blocks 和其他消费者不得各自重新序列化。
3. TOC 只在标题相关 block 或结构变化时重建。
4. 字数统计节流到空闲任务；保存和 UI 最终一致，不要求每个按键同步更新。
5. engine history 只在切换标签、保存恢复点或确有需要时复制。
6. 替换每次输入的 BigInt 全文哈希，但必须保留以下 dirty 语义：
   - 保存后继续编辑显示未保存。
   - 撤销回磁盘内容恢复已保存。
   - 从已保存内容分叉编辑不能误判为已保存。
7. buffer snapshot 继续 debounce，且只序列化发生变化的标签状态。

### 验收

- 用调用计数测试保证一次 `json-change` 不重复获取完整 state/Markdown。
- 保留现有 synthetic history、保存状态、撤销重做和标签恢复回归测试。
- 三档文档连续输入均无新增 50 ms 以上长任务；记录优化前后 p95，而不是只报告测试通过。

## 7. P0：批注锚点、高亮与持久化

### 已确认问题

- 存在选择批注时，锚点转换会无条件标记为变化并触发持久化。
- 每次持久化携带完整 Markdown 和全部批注，主进程同步 gzip、SHA-256 和 SQLite 事务。
- 持久化队列逐项串行执行但不合并连续输入。
- 批注文本校验、高亮、活动高亮和批注栏定位重复扫描内容块并创建 Range。
- 对整个批注 store 的订阅会被 `markdownByFile` 的每次变化唤醒。

### 改动

1. 比较转换前后的 anchor/focus，坐标实际变化时才更新 `updatedAt` 和持久化。
2. 每个文件最多保留一个运行中任务和一个最新待提交快照，覆盖中间状态。
3. 锚点变化使用增量更新，不再删除并重建该文档的全部批注和回复。
4. 快照压缩和哈希离开同步输入热路径，放到 debounce、保存时或 worker/utility process。
5. 一次构建内容块索引和 comment Range，复用给文本验证、高亮和定位。
6. 没有未解决选择批注时，跳过批注 DOM 扫描。
7. 只监听当前文件批注数组和活动批注 ID，不监听无关 store 字段。

### 验收

- 编辑不影响批注范围外的文字时，不产生不必要的批注写入。
- 快速连续输入后，数据库最终状态与最后一次 renderer 状态一致，中间任务不会无限排队。
- 保留锚点随输入移动、被批注文字变化后删除、外部修改映射和 Agent 编辑的回归测试。
- SQLite 故障和 revision 冲突仍能恢复到明确状态，不能静默丢失批注。

## 8. P0：大型目录初次加载

### 已确认问题

目录 watcher 的 `add` 事件会对每个 Markdown 文件调用 `loadMarkdownFile()`。renderer 构建文件树
时实际只需要路径、文件名、时间和类型；完整内容仅在已打开文件或刚创建文件的特殊流程需要。
同时，文件事件逐条进入响应式树并逐次有序插入，在大目录中会放大排序和渲染成本。

### 改动

1. `dir` watcher 的 `add` 只做 `stat`，不加载 Markdown 内容。
2. `file` watcher 继续负责已打开文件的内容变化。
3. 新建文件由创建 IPC 直接返回初始内容，不依赖目录 watcher 携带内容。
4. 初次扫描事件按短时间窗口分批发送；renderer 批量插入后统一排序。
5. 保留排除规则、多个 workspace root、重命名、删除和 mtime 排序语义。

### 验收

- 打开目录时读取内容字节数接近零，只保留必要 metadata I/O。
- 1,000/10,000 文件目录的树结构、顺序和折叠状态正确。
- 新建文件仍会立即成为当前文件，外部创建文件无需等待一秒。
- 多根目录和已打开文件 watcher 互不串线。

## 9. P0：确定性低风险修复

### 设置语言轮询

设置侧栏模块加载时启动永久的 1 秒轮询。改为 Vue/i18n 的响应式监听，并在作用域卸载时停止。
路由拆分完成后，编辑窗口也不应加载该设置模块。

### 文件树监听器泄漏

文件树每次挂载会增加一个 bus 监听和三个 `document` 监听，但卸载时未移除。改为命名 handler，
在 `onBeforeUnmount` 中成对清理。重复收起和展开侧栏后，单次点击或 Escape 只能触发一次处理。

### MCP 客户端预热

保留设置页固定客户端行和缓存，但将外部 `codex`/`claude` CLI 探测从 IPC 注册阶段移到首个
编辑窗口有效绘制后的 idle 阶段。用户主动刷新仍强制重新探测。

## 10. P1：测量后决定

以下项目有优化价值，但风险或场景依赖更高，不与 P0 混在同一个无基准改动中：

- 将 production `electron-log` 文件输出从同步写改为异步写，并验证异常退出日志完整性。
- 延迟构造非首屏 main 服务，缩短创建首个 BrowserWindow 前的同步初始化。
- 编辑窗口先隐藏，在首次有效绘制后显示；此项只改善白屏和感知时序。
- macOS 默认使用原生文件事件，仅在云盘或异常卷上回退 polling。
- 优化长文档多表格滚动时 sticky header 的布局测量。
- 批注栏 ResizeObserver 和逐条高度测量的批量化。

macOS watcher polling 不能直接移除。必须分别验证本地 APFS、iCloud/网盘、外部磁盘和原子替换
写入，否则可能用较低 CPU 换来漏事件。

## 11. 实施批次

### 批次 A：基准与 Electron

- 加入只在测试/性能模式启用的启动 mark 和输入计数器。
- 保存 Electron 42.1.0 production 基线。
- 升级 43.1.1，处理兼容问题并重新测量。

### 批次 B：快速修复与首屏

- 清理语言轮询、文件树监听器和 MCP 启动竞争。
- 路由拆包与 Element Plus 按需加载。
- 对比首次加载资源、首次绘制和设置页打开时间。

### 批次 C：输入与批注

- 先合并通用 `json-change` 派生计算。
- 再处理批注锚点变化判断、队列合并和 Range 复用。
- 最后调整 SQLite 增量写入，避免同时改变太多正确性边界。

### 批次 D：目录与空闲性能

- 去除目录初次扫描的文件内容读取。
- 批量发送和构建文件树。
- 根据 trace 决定日志、main 初始化和 macOS watcher 策略。

## 12. 发布前验证

完成代码后按实际影响运行最小验证集；性能版本发布前再执行完整发布验证：

- `npm run verify:feature`
- `npm --prefix packages/desktop run test:unit`
- `npm --prefix packages/muya test`
- `npm --prefix packages/desktop run typecheck:annotamd`
- `npm --prefix packages/desktop run build`
- 当前架构 macOS production 打包并从新产物启动

必须在 Electron 中打开真实长文档验证输入、批注、表格滚动和标签切换；再用大型临时目录验证
文件树。最终报告同时列出功能回归、性能基准、构建产物版本和未实施的 P1 项，不能只写
“Electron 43 性能更好”或“单元测试通过”。

## 13. 官方资料

- [Electron 43 发布说明](https://www.electronjs.org/blog/electron-43-0)
- [Electron 版本列表](https://releases.electronjs.org/release)
- [Node 主进程启动快照基准](https://releases.electronjs.org/pr/51703)
- [沙箱 preload 与首次绘制优化](https://releases.electronjs.org/pr/51602)

## 14. 2026-07-19 第一阶段实施结果

本节记录 `codex/performance-electron-43` 分支的实际结果。它不是发布结论；合入 `main` 和
正式打包仍需完成剩余优化、全量回归和用户确认。

### 已完成

- Electron 依赖和 lockfile 已升级到 `43.1.1`，Electron 实机测试读取到的运行时版本也是
  `43.1.1`。
- 编辑器、设置容器和各设置分类已改成动态路由；为避免懒加载组件错过一次性启动 IPC，
  renderer 首入口会暂存 bootstrap，主进程收到 renderer 初始化确认后才发送打开文件和目录
  事件。
- renderer 初始 JavaScript 从约 7.34 MB、gzip 1.52 MB 降到 2.83 MB、gzip 0.619 MB，
  分别下降约 61% 和 59%。JavaScript 总量仍约 18.45 MB，说明本阶段收益来自减少首屏解析，
  不是隐藏总依赖体积。
- 移除了设置模块永久的 1 秒语言轮询，改用 i18n locale 响应式更新。
- 文件树组件卸载时会成对移除 bus、document 和 DOM 监听，避免反复挂载后重复响应。
- 外部 MCP 客户端 CLI 探测从 IPC 注册阶段延迟到首个窗口完成加载之后，降低冷启动竞争。
- `json-change` 直接复用事件携带的 post-edit state 生成 Markdown 和 blocks，不再额外执行两次
  全文 state 深拷贝。
- dirty tracker 从逐字符 BigInt 哈希改为两个 32 位 `Math.imul` 哈希通道。1 MB 文本微基准
  从约 16.1 ms 降到约 1.61 ms，哈希成本下降约 90%。
- 批注坐标实际未变化时不再刷新 `updatedAt` 和写数据库；连续写入合并为“一个运行中任务 +
  一个最新状态”，不再为每个中间按键排队 SQLite 事务。
- 目录 watcher 初次发现 Markdown 文件时只读取 stat 元数据，不再读取全部文件内容；应用内
  新建文件改为创建成功后直接打开，已通过真实 Electron 新建文件回归。

### 当前验证

- `npm run verify:feature`：通过，覆盖 menu、table、comments、editor 和批注 OT，共 324 个测试。
- AnnotaMD desktop TypeScript 检查：通过。
- Electron production build：通过；main 约 1.096 MB，preload 约 24 KB。
- Electron 43.1.1 production 实机：编辑器懒加载、设置页懒加载、真实长文档
  `design.md`、输入后 Markdown 快照、批注锚点、语言切换和侧栏新建文件均已完成冒烟。
- Muya 全包 `tsc --noEmit` 仍存在一组本分支修改前已有的类型错误，需作为独立基线债务处理；
  本次受影响的 desktop 类型检查和定向 Muya/desktop 测试已通过。

### 下一阶段

1. 根据 bundle trace 决定 Element Plus 按需注册方式；必须保持全局 locale 和所有现有控件样式。
2. 将 word count、TOC 和 engine history 的全文计算按变更类型拆分或调度到空闲阶段。
3. 合并批注 DOM Range 构建，避免文本校验、高亮、hover 和定位重复扫描同一批内容块。
4. 对目录初次事件做批量发送、批量插入和统一排序，并补充 1,000/10,000 文件基准。
5. 发布前补齐安装包冷/热启动和 key-to-paint p50/p95；当前构建体积和微基准不能替代最终
   安装包性能结论。
