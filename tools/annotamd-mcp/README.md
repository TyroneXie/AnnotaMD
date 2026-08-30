# AnnotaMD MCP Server

AnnotaMD 运行时会在本机启动仅监听 `127.0.0.1` 的鉴权桥接服务。普通外部 MCP 进程只访问 AnnotaMD 私有评论；由 AnnotaMD 内部 Agent 会话启动、并持有一次性 scope token 的 MCP 进程还会获得当前 Muya 文档的受控读取和修改工具。

文档工具不会在普通 MCP 配置中出现。内部 Agent 的修改必须携带 Muya `revision` 和 `contentHash`，正文会立即在编辑器 Buffer 中更新，并由 AnnotaMD 生成整轮 Diff 和回退记录；Agent 不应再使用 shell 或通用文件工具改写当前 Markdown。

构建：

```bash
npm --prefix tools/annotamd-mcp run build
```

安装 AnnotaMD 后，可在“设置 → Agent”中为 Codex 或 Claude Code 一键配置 MCP 与全局评论 Skill；其他支持本地 STDIO MCP 的 Agent 可复制界面生成的配置。配置会指向当前应用内置的 MCP 服务，无需单独安装 Node.js 包。

仓库内开发时可直接运行构建产物：

```json
{
  "mcpServers": {
    "annotamd": {
      "command": "node",
      "args": ["/absolute/path/to/AnnotaMD/tools/annotamd-mcp/dist/index.js"]
    }
  }
}
```

服务仅暴露三个工具：

- `annotamd_list_comments(filePath)`：返回指定 Markdown 文件的全部轻量评论索引，包括锚点、最后作者、消息数和短预览。
- `annotamd_get_comment(commentId | commentIds)`：读取一条或分批读取多条完整评论线程及全部历史回复。
- `annotamd_reply_comment(commentId, body, expectedRevision)`：以 Agent 身份回复原线程，不修改正文，也不改变解决状态。

“最新评论”在全局 Skill 中定义为所有最后一条消息来自 Local 的线程，不是单独一条最新记录。Agent 先读取索引，再按任务选择完整线程，并自行决定是否需要读取完整正文。Agent 不拥有“已解决”或删除权限；局部修改被批注文字会保留评论，整段选区被完全替换或删除时评论随锚点自动消失。
