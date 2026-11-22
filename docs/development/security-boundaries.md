# 桌面端 IPC 与本地文件边界

编辑和设置窗口使用 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 和 `webSecurity: true`。普通本地相对路径图片继续通过现有 file URL 加载，无需关闭同源保护或增加自定义协议。

## Renderer 到主进程

- `main/security/ipc.ts` 在注册处理器的模块之前加载，统一检查 invoke、send 和同步消息的来源。
- 只接受属于应用 BrowserWindow 的主 frame；开发版匹配配置的 renderer origin 和入口路径，生产版匹配构建后的 `renderer/index.html`。
- 子 frame、外部页面、已销毁的窗口均不得调用主进程处理器。进程内部事件仍按原方式派发。
- preload 在运行时验证通道名，不能仅依赖 TypeScript。`shared/ipcChannels.ts` 从 `shared/types/ipc.ts` 生成；新增通道后运行 `node scripts/generateIpcChannels.mjs`，验证脚本检查生成物是否过期。
- 向页面回调时不暴露原始 Electron event 或其 sender 对象。

## 文件访问

通用文件 API 按窗口检查授权路径：用户数据目录、主进程打开的文档或工作区目录、用户在原生对话框选择的目录，以及应用自身只读资源。窗口关闭时清理该窗口的授权。

路径必须为绝对路径。校验先解析已存在的祖先与符号链接，再核对目录边界；包含新文件名的目标也要经过校验，不能用 `..`、前缀相似目录或悬空符号链接逃逸。

- 原生打开、另存为和移动对话框确认后，由主进程授权相应目标。页面上报“已打开文件”或修改配置路径时不能自行扩大授权。
- 拖入文件通过 Electron 原生 File handle 授权；私有授权通道不暴露给通用 IPC 包装器。
- 文档引用外部图片时先检查扩展名和文件头，仅授权该图片的只读访问，不扩大到相邻文件。
- 修改图片目录时，未授权的输入路径需要通过原生目录选择框确认。
- `openExternal` 仅允许 http、https、mailto；直接打开本地文件经过路径授权。

这些检查是 renderer 的纵深防御，不是操作系统沙箱，也不限制用户授权的 Agent 工具进程。文件头检查用于判断图片类型，不替代正文 HTML 的净化。路径校验不承诺防御拥有本机写权限的其他进程在校验后并发替换文件系统对象。

## 验证

单测：`ipc-security.spec.ts`、`file-access-policy.spec.ts`；Electron：`security-boundaries.spec.ts`。图片、粘贴、保存和评论继续使用各自的实际交互回归。

`npm run verify:feature` 同时运行安全回归、生成物一致性检查、生产源码与测试类型检查。修改安全配置后必须构建新的 main/preload 再运行 Electron 回归。
