import SwiftUI
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
