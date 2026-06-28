import SwiftUI
import AppKit
import Combine

/// 多窗口路由：让非 SwiftUI 层（AppDelegate）也能请求「为某个文件/目录打开一个窗口」。
///
/// 每个 ContentView 在出现时把 SwiftUI 的 `openWindow(value:)` 注册进来。
/// `openWindow(value:)` 仍用于创建 URL 绑定窗口；同 URL 聚焦由本路由维护的
/// URL → NSWindow 弱映射显式完成，避免 LaunchServices/SwiftUI 时序下重复开窗。
@MainActor
final class WindowRouter {
    static let shared = WindowRouter()
    private init() {}

    private final class WeakWindow {
        weak var window: NSWindow?

        init(_ window: NSWindow?) {
            self.window = window
        }
    }

    /// 由 ContentView 注册（包装 openWindow(value:)）。
    var open: ((URL) -> Void)?

    private var openedWindows: [URL: WeakWindow] = [:]
    private var pendingFocusURLs: Set<URL> = []

    var canOpenWindow: Bool {
        open != nil
    }

    func registerOpenedURL(_ url: URL, window: NSWindow? = nil) {
        let canonicalURL = url.markMarkCanonicalFileURL
        if let window {
            openedWindows[canonicalURL] = WeakWindow(window)
        } else if openedWindows[canonicalURL] == nil {
            openedWindows[canonicalURL] = WeakWindow(nil)
        }
    }

    func unregisterOpenedURL(_ url: URL) {
        openedWindows.removeValue(forKey: url.markMarkCanonicalFileURL)
    }

    func attachWindow(_ window: NSWindow, to url: URL) {
        let canonicalURL = url.markMarkCanonicalFileURL
        openedWindows[canonicalURL] = WeakWindow(window)
        if pendingFocusURLs.contains(canonicalURL) {
            pendingFocusURLs.remove(canonicalURL)
            focus(window)
            scheduleFocusPulse(for: canonicalURL)
        }
    }

    func isRegisteredContentWindow(_ window: NSWindow) -> Bool {
        pruneClosedWindows()
        return openedWindows.values.contains { $0.window === window }
    }

    func hasRegisteredWindow(for url: URL) -> Bool {
        pruneClosedWindows()
        return openedWindows[url.markMarkCanonicalFileURL]?.window != nil
    }

    /// 冷启动显式 URL 打开时使用：目标 URL 应该排他获胜，不能同时展示
    /// SwiftUI 在启动恢复阶段预先创建的 nil/旧 URL 内容窗口。
    ///
    /// 注意：这只用于 cold explicit open 的启动收敛；普通热启动 external open
    /// 仍然保留多窗口语义，不会调用这里。
    func closeVisibleContentWindows(except keptURL: URL) {
        pruneClosedWindows()
        let canonicalKeptURL = keptURL.markMarkCanonicalFileURL
        let keptWindow = openedWindows[canonicalKeptURL]?.window

        for window in NSApp.windows {
            guard window.isVisible,
                  window.canBecomeKey,
                  !(window is NSPanel),
                  !window.isSheet else { continue }
            if let keptWindow, window === keptWindow { continue }
            window.close()
        }

        openedWindows = openedWindows.filter { url, weakWindow in
            url == canonicalKeptURL && weakWindow.window != nil
        }
        pendingFocusURLs = pendingFocusURLs.filter { $0 == canonicalKeptURL }
    }

    @discardableResult
    func openWindow(for url: URL) -> Bool {
        let canonicalURL = url.markMarkCanonicalFileURL
        if focusRegisteredWindow(for: canonicalURL) {
            return true
        }

        guard let open else { return false }
        // Pre-register before asking SwiftUI to create the value window. This
        // closes the timing gap where repeated LaunchServices open events can
        // arrive before the new ContentView has run its task and attached its
        // NSWindow. Actual same-URL focus is handled above once a window exists.
        registerOpenedURL(canonicalURL)
        pendingFocusURLs.insert(canonicalURL)
        open(canonicalURL)
        // Do not activate the app before SwiftUI has attached the target URL
        // window. Activating here can reveal SwiftUI's transient/default host
        // window first, causing the visible flash when dragging B onto the app
        // while A is already open. The target window is focused in attachWindow.
        scheduleFocusPulse(for: canonicalURL)
        return true
    }

    private func focusRegisteredWindow(for canonicalURL: URL) -> Bool {
        guard let window = openedWindows[canonicalURL]?.window else {
            return false
        }

        focus(window)
        return true
    }

    private func pruneClosedWindows() {
        openedWindows = openedWindows.filter { $0.value.window != nil }
    }

    private func focus(_ window: NSWindow) {
        if window.isMiniaturized {
            window.deminiaturize(nil)
        }
        if !window.isVisible {
            window.setIsVisible(true)
        }
        window.orderFrontRegardless()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func scheduleFocusPulse(for canonicalURL: URL) {
        for delay in [0.05, 0.15, 0.35, 0.75] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self,
                      let window = self.openedWindows[canonicalURL]?.window else { return }
                self.focus(window)
            }
        }
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
    /// App 内打开统一走 OpenRequestCoordinator 的 internal-open 语义：
    /// - 有可用窗口 → 替换当前 key window 内容；
    /// - 无可用窗口 → 退化为 external window path，新建/聚焦 URL 绑定窗口。
    func openRecent(_ url: URL, isDirectory: Bool) {
        let coordinator = OpenRequestCoordinator(
            router: NotificationOpenRequestRouter(),
            settings: SettingsOpenRequestSettings(),
            pendingStore: UserDefaultsPendingOpenStore()
        )
        coordinator.handleInternalOpen(url: url)
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
