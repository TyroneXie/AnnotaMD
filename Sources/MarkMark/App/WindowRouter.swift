import SwiftUI
import AppKit
import Combine

/// 多窗口路由：让非 SwiftUI 层（AppDelegate）也能请求「为某个文件/目录打开一个窗口」。
///
/// 每个 ContentView 在出现时把 SwiftUI 的 `openWindow(value:)` 注册进来。
/// `openWindow(value:)` 对值型 WindowGroup 具有去重语义：已有承载该 URL 的窗口则前置，
/// 否则新建——正好满足「双击不同文件开不同窗口、双击同一文件聚焦已有窗口」。
@MainActor
final class WindowRouter {
    static let shared = WindowRouter()
    private init() {}

    /// 由 ContentView 注册（包装 openWindow(value:)）。
    var open: ((URL) -> Void)?

    func openWindow(for url: URL) {
        open?(url)
    }

    /// 是否存在「可用窗口」：可见、能成为 key、非面板/非 sheet 的内容窗口。
    /// 用于判断打开请求该投递到当前窗口，还是需要新建窗口。
    func hasUsableWindow() -> Bool {
        NSApp.windows.contains {
            $0.isVisible && $0.canBecomeKey && !($0 is NSPanel) && !$0.isSheet
        }
    }

    /// 打开「最近文件/目录」等应用内请求。
    ///
    /// - 有可用窗口（点菜单时应用必为前台、窗口即 key）→ 发通知，由当前窗口的
    ///   `.onActiveReceive(.openFile/.openDirectory)` 在当前窗口内打开，保持原有「替换当前窗口内容」体验。
    /// - 零窗口 / 无可用窗口 → 走 `openWindow(value:)` 新建窗口承载，由 `ContentView.task`
    ///   的 `openedURL` 分支直接加载。修复「关掉所有窗口后，从顶部菜单或快捷方式打开文件
    ///   只显示首页、窗口不激活」的问题（此时 `.onActiveReceive` 没有任何窗口可接收，通知被丢弃）。
    func openRecent(_ url: URL, isDirectory: Bool) {
        if hasUsableWindow() {
            NotificationCenter.default.post(
                name: isDirectory ? .openDirectory : .openFile,
                object: url
            )
        } else {
            // openWindow(value:) 对文件/目录均适用：ContentView.task 会按 isDirectory 正确处理。
            open?(url)
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}

// MARK: - 仅在 key 窗口响应的通知

extension View {
    /// 与 `.onReceive` 相同，但只有当前窗口是 **key 窗口**（用户正聚焦的窗口）时才执行。
    /// 多窗口下，菜单命令/快捷键发出的全局通知只应作用于当前聚焦的窗口，否则会「一发全中」。
    func onActiveReceive<P: Publisher>(
        _ publisher: P,
        perform action: @escaping (P.Output) -> Void
    ) -> some View where P.Failure == Never {
        modifier(ActiveReceiveModifier(publisher: publisher, action: action))
    }
}

private struct ActiveReceiveModifier<P: Publisher>: ViewModifier where P.Failure == Never {
    @Environment(\.controlActiveState) private var activeState
    let publisher: P
    let action: (P.Output) -> Void

    func body(content: Content) -> some View {
        content.onReceive(publisher) { value in
            if activeState == .key { action(value) }
        }
    }
}
