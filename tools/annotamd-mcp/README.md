# AnnotaMD MCP Server

AnnotaMD 运行时会在本机启动仅监听 `127.0.0.1` 的鉴权桥接服务。MCP 进程通过该桥接读取
SQLite 评论、回复评论，并让已打开文档的 Muya 编辑事务按评论锚点精确修改正文。

构建：

```bash
npm --prefix tools/annotamd-mcp run build
```

安装 AnnotaMD 后，在“偏好设置 → Agent”中可一键接入 ChatGPT 和 Claude Code；其他支持本地
STDIO MCP 的 Agent 可直接复制界面生成的配置。配置会指向当前 AnnotaMD 应用内置的 MCP 服务，
无需单独安装 Node.js 包。

仅在仓库内开发 MCP 服务时，可直接运行构建产物：

```json
{
  "mcpServers": {
    "annotamd": {
      "command": "node",
      "args": ["/absolute/path/to/AnnotaMD/tools/annotamd-mcp/dist/index.js"],
      "env": {
        "ANNOTAMD_BRIDGE_FILE": "/absolute/path/to/agent-bridge.json"
      }
    }
  }
}
```

Markdown 正文不会写入评论元数据，复制或发送文件仍是干净正文。
