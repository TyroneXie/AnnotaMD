# AnnotaMD 性能优化方案：Electron 43 与应用层热点

> 状态：计划内 P0/P1 优化已全部完成并合入 `main`，进入 v2.10.0 发布验证
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

## 10. P1：实测后决定

本轮基于 production 构建、重复启动基准和真实 Electron 场景完成全部 P1：

- production `electron-log` 文件输出改为异步写，Electron 冒烟会轮询确认主进程日志实际落盘。
- 评论 SQLite 服务和 MCP HTTP 桥从 main 默认启动入口移出，只在首次评论 IPC 或启用 MCP 时
  动态加载；退出监听也只在服务真正实例化后注册。
- 编辑窗口默认隐藏，懒加载 editor route 接收 bootstrap 并确认初始化后再显示，避免空窗口。
- macOS 默认使用 Chokidar 5 原生文件事件；普通覆盖写、atomic inode replacement，以及目录
  创建、重命名、删除均已在真实 Electron 中验证。现有 `watcherUsePolling` 继续作为网络盘和
  云盘的显式回退，不删除兼容路径。
- sticky table header 在内容变化时缓存表格纵向几何，滚动帧用二分查找当前表格，只测量滚动
  容器和活动表格，不再遍历所有表格、逐单元格读取宽度。
- 批注栏用一个 animation frame 合并 watch、锚点和 ResizeObserver 更新，并缓存已观察卡片的
  border-box 高度；回复/编辑导致卡片变高时仍会重新布局。

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

## 14. 2026-07-19 实施结果

本节记录 `codex/performance-electron-43` 分支的实际结果。相关提交已于 2026-07-19 快进合入
`main`，正式发布结论仍以 v2.10.0 的全量回归、安装包与 Release 验收为准。第一阶段已提交为 `e0732a7`，第二阶段提交为
`921ec75`，第三阶段提交为 `0351a50`，第四阶段提交为 `2b5ccbd`；本节也包含随后发现的真实
长文档打开性能修复。

### 已完成

- Electron 依赖和 lockfile 已升级到 `43.1.1`，Electron 实机测试读取到的运行时版本也是
  `43.1.1`。
- 编辑器、设置容器和各设置分类已改成动态路由；为避免懒加载组件错过一次性启动 IPC，
  renderer 首入口会暂存 bootstrap，主进程收到 renderer 初始化确认后才发送打开文件和目录
  事件。
- renderer 初始 JavaScript 先通过路由拆分降到约 2.83 MB、gzip 0.619 MB；Element Plus 再从
  全量插件注册改为只注册实际使用的 22 个组件，最终入口约 1.62 MB、gzip 0.379 MB。相对
  7.34 MB、gzip 1.52 MB 的基线分别下降约 78% 和 75%。Element Plus 样式也改成按组件加载，
  初始 CSS 从 400,290 字节降到 189,970 字节，下降约 52.5%。
- 移除了设置模块永久的 1 秒语言轮询，改用 i18n locale 响应式更新。
- 文件树组件卸载时会成对移除 bus、document 和 DOM 监听，避免反复挂载后重复响应。
- 外部 MCP 客户端 CLI 探测从 IPC 注册阶段延迟到首个窗口完成加载之后，降低冷启动竞争。
- `json-change` 直接复用事件携带的 post-edit state 生成 Markdown 和 blocks，不再额外执行两次
  全文 state 深拷贝。
- Markdown、dirty 状态和自动保存继续同步更新；全文字数统计和 TOC 改为输入停止 180 ms 后
  合并刷新，完整 engine undo/redo 序列化只在保存、切换标签和进入源码模式前执行，不再在
  每个按键上深拷贝历史栈。
- dirty tracker 从逐字符 BigInt 哈希改为两个 32 位 `Math.imul` 哈希通道。1 MB 文本微基准
  从约 16.1 ms 降到约 1.61 ms，哈希成本下降约 90%。
- 批注坐标实际未变化时不再刷新 `updatedAt` 和写数据库；连续写入合并为“一个运行中任务 +
  一个最新状态”，不再为每个中间按键排队 SQLite 事务。
- 批注高亮、活动批注和评论栏锚点复用同一份内容块索引与 Range 集合；一次输入后校验多条
  批注文本也只扫描一次内容块 DOM，不再为每条批注重新遍历整篇文档。
- 目录 watcher 初次发现 Markdown 文件时只读取 stat 元数据，不再读取全部文件内容；应用内
  新建文件改为创建成功后直接打开，已通过真实 Electron 新建文件回归。
- 目录 watcher 将 16 ms 内的树事件合并为一次 IPC；renderer 对纯新增批次统一插入并只排序
  一次，混合的重命名、删除和修改事件仍按原顺序处理。微基准中 1,000 文件从约 11.22 ms
  降至 2.82 ms，10,000 文件从约 309.17 ms 降至 19.59 ms。
- 评论与 MCP 被构建为 14.65 KB 和 8.44 KB 的独立分块，main 入口不再静态解析评论数据库、
  HTTP 和加密代码。MCP 评论访问现已默认开启，并在 Electron ready 后动态加载；用户明确关闭
  时仍会保留选择且不会加载该分块。
- production 日志由同步文件写入改为异步队列，并加入真实 Electron 日志落盘回归检查。
- 编辑 BrowserWindow 改为 route 初始化后显示；最终 10 次启动样本 p50 约 933 ms、p95 约
  966 ms，没有因隐藏/显示握手增加启动等待。
- macOS watcher 不再强制轮询；原生事件覆盖文件普通写入、内容相同写入、atomic replacement，
  以及目录创建、重命名和删除。轮询偏好仍可强制启用。
- sticky table header 的纵向位置和表头宽度改为失效时测量、滚动时复用。24 张表格真实文档中，
  12 个滚动帧共记录 33 次相关布局读取，读取量不再随前方表格数量线性增长。
- 批注卡片高度由单个 ResizeObserver 缓存，布局请求按帧合并；两条同锚点批注中打开回复编辑器
  后，后一张卡片会按新的缓存高度下移，已通过 Electron 交互测试。
- Node 25 无有效 `--localstorage-file` 时暴露不完整 `localStorage` 的测试环境问题已通过统一
  MemoryStorage setup 修复；旧按钮测试也已对齐当前组件选择器和实际 primary 主题变量，未通过
  跳过或降低覆盖率来消除失败。
- 新标签此前会先发出 `file-changed`、再发出 `file-loaded`，导致同一 Markdown 连续构建两次；
  新文件现只走 `file-loaded`，已有标签切换仍走 `file-changed`。同时，InlineRenderer 曾在创建
  每个富文本叶子时深拷贝并遍历整份状态以收集引用定义，表格密集文档因此形成近似 O(n²)；现以
  JSON state revision 为缓存边界，同一 revision 只扫描一次，`setContent`/OT dispatch 后自动失效。
- 真实文件 `design-2026-06-30-review.md`（137,008 字节、51 张表、496 行表格、1,513 个单元格、
  1,894 个编辑叶子）在已启动的 production Electron 中打开由 4,063 ms 降到 430 ms，改善约
  89.4%。CPU profile 中原先约 1.38 秒的 `TableCellContent → _collectReferenceDefinitions →
  getState → deepClone` 热点已消失；最终 DOM 数量和 Markdown 往返内容均一致。

### 当前验证

- `npm run verify:feature`：通过，覆盖 menu、table、comments、editor 和批注 OT，共 325 个测试。
- desktop 完整单测：93 个文件、892 项全部通过。
- Muya 完整单测：241 个文件、1,698 项全部通过。
- AnnotaMD desktop TypeScript 检查：通过。
- Electron production build：通过；main 默认入口 1,076,136 字节，preload 约 24 KB。
- Electron 43.1.1 production 实机：编辑器懒加载、设置页懒加载、真实长文档
  `design.md`、表格密集的 `design-2026-06-30-review.md`、输入后 Markdown 快照、批注锚点、
  默认启用的 MCP 状态、异步日志落盘、语言切换和
  侧栏新建文件、原生 watcher、长表格滚动和批注卡片高度变化均已完成冒烟。
- 同一 production 构建的最终 10 次启动基准：最初基线 p50 约 1,001 ms、p95 约 1,336 ms；
  当前 p50 约 933 ms、p95 约 966 ms，分别改善约 6.8% 和 27.7%。测试助手包含固定 500 ms
  等待，因此该数据用于同机相对比较；安装包冷/热启动仍需发布前重新测量。

### 发布前剩余工作

1. 合并到 `main` 后按发布规则运行各 package 全量测试和当前架构打包。
2. 从新生成的安装包执行冷/热启动、key-to-paint p50/p95 和真实长文档滚动验证；当前构建
   体积与微基准不能替代安装包性能结论。
3. 验证 macOS x64/arm64、Windows x64/arm64 和 Linux 产物，特别检查 Electron 43 的窗口、
   下载目录、图像色彩和原生依赖兼容性。
4. 网络盘、iCloud/其他云盘仍保留 polling 回退；跨平台安装包验收时应分别确认默认原生事件
   和强制 polling 两条路径，但计划内不再有待实现的性能代码项。
