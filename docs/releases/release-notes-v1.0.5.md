# Markdown Reader v1.0.5

修复自动更新安装和滚动定位的可靠性问题，优化应用启动与 Dock 点击行为。

## 🔧 变更

### 🔄 自动更新安装可靠性
- 先关闭更新弹窗再执行安装，避免 SwiftUI sheet 干扰进程退出
- 使用 `exit(0)` 替代 `NSApplication.terminate()`，防止 `windowShouldClose` 拦截导致应用无法退出
- 守夜人脚本输出重定向到日志文件，避免父进程退出时子进程收到 SIGPIPE 信号

### 📜 滚动定位可靠性
- 新增 NSScrollView 捕获的多重时机保障（`viewDidMoveToSuperview` + 延迟重试）
- 两层重试机制：NSScrollView 未捕获或文档布局未完成时自动重试（最多 20 次）
- 渲染模式滚动请求超时从 0.5 秒延长至 2.5 秒

### 🏠 启动与 Dock 行为
- Dock 点击重新激活时重置为欢迎页，不再恢复旧窗口文档内容
- 点击应用图标启动时始终显示欢迎页，不再自动恢复上次位置
- 移除 `.handlesExternalEvents(matching:)` 避免冷启动双窗口

### 📦 其他
- README 中 DMG 安装包大小描述更新为「不到 10MB」

## 🖥️ 系统要求

- macOS 15.0 (Sequoia) 或更高版本
- Apple Silicon / Intel 均支持

---

感谢使用 Markdown Reader！如有问题或建议，欢迎在 GitHub Issues 反馈。
