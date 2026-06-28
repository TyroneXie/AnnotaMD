import SwiftUI
import MarkdownReaderKit
import os

/// 应用委托，处理 macOS 应用生命周期事件
///
/// macOS 15+ 上 SwiftUI WindowGroup 可能在启动时先创建 untitled 默认窗口。
/// 修复策略：
/// - 显式外部打开：阻止 untitled 默认窗口，URL 直接路由到 URL 绑定/兜底窗口
/// - 直接启动 / Dock reopen：确认无显式 URL 后，主动创建 welcome/restore 窗口
/// - 热启动：外部打开走多窗口，同 URL 聚焦；内部打开替换当前 key window
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {

    private let logger = Logger(subsystem: "com.ft07.markmark", category: "AppDelegate")

    /// 冷启动时记录待处理的文件 URL
    var pendingOpenFileURL: URL?

    /// 冷启动时记录待处理的目录 URL
    var pendingOpenDirectoryURL: URL?

    /// 应用是否已经完成启动（用于区分冷启动和热启动）
    private var didFinishLaunching = false

    /// SwiftUI 启动完成后，restore/welcome 会延迟一小段时间触发。
    /// 如果 LaunchServices 的显式打开事件在这段窗口内才到达，必须仍然压过恢复会话。
    private var didRouteLaunchCompletion = false
    private var receivedExplicitOpenBeforeLaunchCompletion = false

    /// Finder Services 冷启动时，SwiftUI WindowGroup / openWindow 可能尚未就绪。
    /// 先暂存服务传入的目录，启动完成并拿到 WindowRouter 后再打开，避免服务请求卡住 Finder。
    private var pendingServiceOpenURLs: [URL] = []

    /// Services 启动时 SwiftUI 场景可能不会自动创建窗口，需要 fallback。
    private var fallbackWindows: [NSWindow] = []
    private var fallbackWindowObservers: [NSObjectProtocol] = []

    private lazy var pendingOpenStore = UserDefaultsPendingOpenStore()
    private lazy var openRequestCoordinator = OpenRequestCoordinator(
        router: AppDelegateOpenRequestRouter(appDelegate: self),
        settings: SettingsOpenRequestSettings(),
        pendingStore: pendingOpenStore
    )

    /// 应用即将完成启动
    func applicationWillFinishLaunching(_ notification: Notification) {
        logger.info("applicationWillFinishLaunching")
        NSApp.servicesProvider = self
    }

    /// 阻止 AppKit/SwiftUI 在启动时抢先创建 untitled/nil 默认窗口。
    /// 直接启动需要的 welcome/restore 窗口由 launch completion 明确创建；
    /// Finder/拖拽/打开方式等显式 URL 则只创建目标 URL 窗口。
    func applicationShouldOpenUntitledFile(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationOpenUntitledFile(_ sender: NSApplication) -> Bool {
        false
    }

    /// 禁用 AppKit/SwiftUI 的系统窗口状态恢复。MarkMark 自己通过
    /// SettingsModel.lastOpened* 控制 restore；系统级恢复会在显式 URL 启动时
    /// 抢先恢复旧窗口，造成“拖 B 还打开 A / 一堆空窗口”。
    func application(_ application: NSApplication, shouldSaveApplicationState coder: NSCoder) -> Bool {
        false
    }

    func application(_ application: NSApplication, shouldRestoreApplicationState coder: NSCoder) -> Bool {
        false
    }

    func application(_ application: NSApplication, shouldSaveSecureApplicationState coder: NSCoder) -> Bool {
        false
    }

    func application(_ application: NSApplication, shouldRestoreSecureApplicationState coder: NSCoder) -> Bool {
        false
    }

    // MARK: - 窗口辅助

    /// 激活第一个不可见的可成为 key 的窗口（SwiftUI WindowGroup 创建的）
    /// SwiftUI 有时会创建不可见窗口来处理文件打开事件，需要手动激活
    /// 使用 canBecomeKey + isSheet + isPanel 判断，避免依赖私有类名
    private func activateFirstHiddenWindow() {
        for window in NSApp.windows {
            if !window.isSheet && window.canBecomeKey && !(window is NSPanel) {
                if !window.isVisible || window.isMiniaturized {
                    logger.info("Activating hidden window: title='\(window.title)'")
                    window.deminiaturize(nil)
                    window.setIsVisible(true)
                }
                window.orderFrontRegardless()
                window.makeKeyAndOrderFront(nil)
                break
            }
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Services / Finder 场景下强制把应用切到普通前台 App，并按需拉起已有隐藏窗口。
    ///
    /// 显式 URL 启动（Finder 拖到图标 / 打开方式 / 双击文件）不能先 reveal 隐藏窗口，
    /// 否则 SwiftUI 预建的 nil/恢复窗口会先闪一下，再被真正目标窗口替换。
    private func bringApplicationToFront(revealHiddenWindow: Bool = true) {
        NSApp.setActivationPolicy(.regular)
        NSApp.unhide(nil)
        if revealHiddenWindow {
            activateFirstHiddenWindow()
        }
        if revealHiddenWindow {
            if #available(macOS 14.0, *) {
                NSRunningApplication.current.activate(options: [.activateAllWindows])
            } else {
                NSRunningApplication.current.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
            }
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    /// 检查是否有可见窗口
    private func hasVisibleWindows() -> Bool {
        hasUsableWindow()
    }

    fileprivate func hasUsableWindow() -> Bool {
        NSApp.windows.contains {
            $0.isVisible && $0.canBecomeKey && !($0 is NSPanel) && !$0.isSheet
        }
    }

    // MARK: - 文件打开回调

    /// macOS 13+ URL 版本的文件打开回调
    /// 冷启动时在 applicationDidFinishLaunching 之前调用
    /// 热启动时直接调用
    func application(_ application: NSApplication, open urls: [URL]) {
        logger.info("application(_:open:) called with \(urls.count) URLs, didFinish=\(self.didFinishLaunching)")
        guard let first = urls.first else { return }
        if !didRouteLaunchCompletion {
            receivedExplicitOpenBeforeLaunchCompletion = true
        }

        if didFinishLaunching {
            openRequestCoordinator.handleExternalOpen(
                urls: urls,
                reason: .finderOpen,
                isLaunchCompleted: true
            )
        } else {
            // 冷启动：不要写 UserDefaults pending 与 SwiftUI URL WindowGroup 竞争。
            // 先只在 AppDelegate 内存里记录显式 URL；启动完成后如果 SwiftUI
            // 已经创建了 URL 绑定窗口就聚焦它，否则再补开一次。
            rememberPendingOpenURL(first)
            logger.info("Cold start: remembered explicit URL for post-launch routing")
        }
    }

    /// Finder 右键「服务」入口：接收选中的文件或文件夹 URL，并复用现有打开逻辑。
    @objc(openInMarkMark:userData:error:)
    func openInMarkMark(
        _ pasteboard: NSPasteboard,
        userData: String?,
        error: AutoreleasingUnsafeMutablePointer<NSString?>
    ) {
        let urls = openRequestCoordinator.serviceFileURLs(from: pasteboard)
        guard !urls.isEmpty else {
            error.pointee = "No file or folder URL was provided to MarkMark."
            logger.error("Services entry invoked without file or folder URLs")
            return
        }

        logger.info("Services entry opening \(urls.count) file/folder URL(s)")
        if !didRouteLaunchCompletion {
            receivedExplicitOpenBeforeLaunchCompletion = true
        }
        pendingServiceOpenURLs = urls
        bringApplicationToFront()

        // 让 Finder 的 Services 调用尽快返回；实际打开目录等 SwiftUI openWindow 注册后异步完成。
        DispatchQueue.main.async { [weak self] in
            self?.openPendingServiceURLsWhenReady()
        }
    }

    private func openPendingServiceURLsWhenReady(attempt: Int = 0) {
        guard !pendingServiceOpenURLs.isEmpty else { return }

        bringApplicationToFront()

        if didFinishLaunching && (WindowRouter.shared.canOpenWindow || hasUsableWindow() || attempt >= 5) {
            let urls = pendingServiceOpenURLs
            pendingServiceOpenURLs.removeAll()
            clearPendingOpenURLDefaults()

            openRequestCoordinator.handleExternalOpen(
                urls: urls,
                reason: .finderService,
                isLaunchCompleted: true
            )
            scheduleActivationPulse()
            return
        }

        guard attempt < 20 else {
            // 极端兜底：如果 SwiftUI 窗口迟迟没有注册，至少把第一个目录写入 pending，
            // 下次普通启动仍可恢复，不让服务请求彻底丢失。
            if let first = pendingServiceOpenURLs.first {
                openRequestCoordinator.handleExternalOpen(
                    urls: [first],
                    reason: .finderService,
                    isLaunchCompleted: false
                )
                rememberPendingOpenURL(first)
            }
            logger.error("Timed out waiting for WindowRouter for Services open request")
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.openPendingServiceURLsWhenReady(attempt: attempt + 1)
        }
    }

    private func schedulePendingOpenWatchdog(for url: URL, attempt: Int = 0) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.resolvePendingOpenIfStillUnconsumed(url, attempt: attempt)
        }
    }

    private func resolvePendingOpenIfStillUnconsumed(_ url: URL, attempt: Int) {
        if WindowRouter.shared.hasRegisteredWindow(for: url) {
            logger.info("Pending open already has a registered window; clearing pending: \(url.path)")
            clearPendingOpenURLDefaults()
            bringApplicationToFront()
            return
        }

        guard pendingOpenURLFromDefaults() == url.markMarkCanonicalFileURL else {
            logger.info("Pending open was consumed by ContentView")
            bringApplicationToFront()
            return
        }

        guard didFinishLaunching else {
            schedulePendingOpenWatchdog(for: url, attempt: attempt + 1)
            return
        }

        // 给初始 ContentView.task 一个短窗口读取 pending；若仍残留，说明打开事件到达太晚，
        // 需要 AppDelegate 主动路由，修复 Finder「打开方式」只恢复上次目录的问题。
        guard attempt >= 8 else {
            schedulePendingOpenWatchdog(for: url, attempt: attempt + 1)
            return
        }

        logger.info("Pending open was not consumed; routing explicitly: \(url.path)")
        clearPendingOpenURLDefaults()
        openRequestCoordinator.handleExternalOpen(
            urls: [url],
            reason: .finderOpen,
            isLaunchCompleted: true
        )
        scheduleActivationPulse()
    }

    private func pendingOpenURLFromDefaults() -> URL? {
        pendingOpenStore.pendingURL
    }

    fileprivate func routeURLsToApp(
        _ urls: [URL],
        reason: String,
        preferExistingWindow: Bool = false
    ) {
        guard !urls.isEmpty else { return }

        if preferExistingWindow, hasUsableWindow() {
            bringApplicationToFront(revealHiddenWindow: true)
            logger.info("Routing \(urls.count) URL(s) through existing window notifications, reason=\(reason)")
            for url in urls {
                postExternalOpenNotification(for: url)
            }
            scheduleActivationPulse()
            return
        }

        logger.info("Routing \(urls.count) URL(s) through WindowRouter/fallback windows, reason=\(reason)")
        for url in urls {
            if !WindowRouter.shared.openWindow(for: url) {
                openFallbackWindow(for: url)
            }
        }
    }


    private func scheduleActivationPulse(revealHiddenWindow: Bool = false) {
        bringApplicationToFront(revealHiddenWindow: revealHiddenWindow)
        for delay in [0.1, 0.4, 0.9] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.bringApplicationToFront(revealHiddenWindow: revealHiddenWindow)
            }
        }
    }

    fileprivate func postOpenNotification(for url: URL) {
        var isDirectory: ObjCBool = false
        FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
        NotificationCenter.default.post(
            name: isDirectory.boolValue ? .openDirectory : .openFile,
            object: url
        )
    }

    private func postExternalOpenNotification(for url: URL) {
        var isDirectory: ObjCBool = false
        FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
        NotificationCenter.default.post(
            name: isDirectory.boolValue ? .openExternalDirectory : .openExternalFile,
            object: url
        )
    }

    private func openFallbackWindow(for url: URL) {
        let rootView = ContentView(openedURL: url, registersWindowRouter: false, showsWindowTitle: false)
            .environment(\.language, SettingsModel.shared.languagePref.resolvedLanguage)
        let hostingController = NSHostingController(rootView: rootView)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        configureFallbackWindow(window, hostingController: hostingController)
        fallbackWindows.append(window)
        observeFallbackWindowClose(window)
        window.makeKeyAndOrderFront(nil)
    }

    private func configureFallbackWindow<Content: View>(_ window: NSWindow, hostingController: NSHostingController<Content>) {
        window.contentViewController = hostingController
        window.title = ""
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 650, height: 450)
        window.center()

        // fallback 窗口不走 SwiftUI .windowStyle(.hiddenTitleBar)，这里必须主动隐藏系统红绿灯。
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true
    }

    private func observeFallbackWindowClose(_ window: NSWindow) {
        let observer = NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self, weak window] _ in
            Task { @MainActor [weak self, weak window] in
                guard let self, let window else { return }
                self.fallbackWindows.removeAll { $0 === window }
            }
        }
        fallbackWindowObservers.append(observer)
    }


    fileprivate func openFallbackWelcomeWindow() {
        let rootView = ContentView(openedURL: nil, registersWindowRouter: false, showsWindowTitle: false)
            .environment(\.language, SettingsModel.shared.languagePref.resolvedLanguage)
        let hostingController = NSHostingController(rootView: rootView)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        configureFallbackWindow(window, hostingController: hostingController)
        fallbackWindows.append(window)
        observeFallbackWindowClose(window)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    fileprivate func restoreLastLocationOrOpenWelcomeFallback() {
        if let dir = SettingsModel.shared.lastOpenedDirectory {
            routeURLsToApp([dir], reason: "restore-fallback")
        } else if let file = SettingsModel.shared.lastOpenedFile {
            routeURLsToApp([file], reason: "restore-fallback")
        } else {
            openFallbackWelcomeWindow()
        }
    }

    /// 记录冷启动显式打开请求，确保它优先于恢复上次位置。
    /// UserDefaults pending 由 OpenRequestCoordinator/PendingOpenStore 负责；这里仅保留
    /// AppDelegate 级别的启动期标记，用于 applicationDidFinishLaunching 的 restore guard。
    private func rememberPendingOpenURL(_ url: URL) {
        var isDir: ObjCBool = false
        FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)
        if isDir.boolValue {
            pendingOpenDirectoryURL = url
            pendingOpenFileURL = nil
        } else {
            pendingOpenFileURL = url
            pendingOpenDirectoryURL = nil
        }
    }


    private func rememberedLaunchOpenURL() -> URL? {
        pendingOpenFileURL ?? pendingOpenDirectoryURL
    }

    private func clearPendingOpenURLDefaults() {
        pendingOpenDirectoryURL = nil
        pendingOpenFileURL = nil
        pendingOpenStore.clear()
    }

    // MARK: - 应用生命周期

    /// 应用启动完成后，处理冷启动场景
    /// 如果有待处理文件 URL，ContentView.task 会通过 UserDefaults 读取并打开。
    /// 如果没有待处理文件且 reopenLastLocation 开启，发送 restoreLastLocation 通知。
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSWindow.allowsAutomaticWindowTabbing = false

        // 在任何 SwiftUI 视图创建前设置 appearance，避免 NSTextView textColor 被 AppKit 覆盖
        // ContentView.task 中的 applyAppearance() 仍保留作为兜底
        let appearanceMode = SettingsModel.shared.appearanceMode
        if let nsAppearance = appearanceMode.nsAppearance {
            NSApp.appearance = nsAppearance
        }

        didFinishLaunching = true
        logger.info("applicationDidFinishLaunching — pendingFile: \(self.pendingOpenFileURL != nil), pendingDir: \(self.pendingOpenDirectoryURL != nil)")

        // 延迟处理，确保 SwiftUI WindowGroup 窗口已创建，也给 LaunchServices
        // 显式 open 事件一个到达窗口，避免“拖 B 启动 App”先恢复 A 再打开 B。
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self else { return }

            // 注册窗口拖拽：绕过 SwiftUI .onDrop，直接使用 AppKit NSDraggingDestination
            self.installFileDropHandler()

            // 清理冷启动时的待处理 URL 属性
            // ContentView.task 已通过 UserDefaults 读取并处理，无需再发通知
            // 同时检查 UserDefaults 中是否还有待处理路径（application(_:open:) 可能延迟调用）
            // 如果有待处理路径，说明文件打开事件即将到来，不应发送 .restoreLastLocation
            if let rememberedURL = self.rememberedLaunchOpenURL() {
                self.pendingOpenFileURL = nil
                self.pendingOpenDirectoryURL = nil
                if WindowRouter.shared.hasRegisteredWindow(for: rememberedURL) {
                    self.logger.info("Cold start: remembered explicit open already has a registered window: \(rememberedURL.path)")
                    WindowRouter.shared.openWindow(for: rememberedURL)
                    self.scheduleActivationPulse()
                } else {
                    self.logger.info("Cold start: routing remembered explicit open once: \(rememberedURL.path)")
                    self.openRequestCoordinator.handleExternalOpen(
                        urls: [rememberedURL],
                        reason: .finderOpen,
                        isLaunchCompleted: true
                    )
                }
                self.scheduleExclusiveColdExplicitDirectoryWindowPruneIfNeeded(keeping: rememberedURL)
                self.pendingOpenStore.clear()
            } else if let pendingURL = self.pendingOpenStore.pendingURL {
                if WindowRouter.shared.hasRegisteredWindow(for: pendingURL) {
                    self.logger.info("Cold start: pending explicit open already has a registered window: \(pendingURL.path)")
                    self.pendingOpenStore.clear()
                    self.scheduleActivationPulse()
                } else {
                    self.logger.info("Cold start: routing pending explicit open once: \(pendingURL.path)")
                    self.pendingOpenStore.clear()
                    self.openRequestCoordinator.handleExternalOpen(
                        urls: [pendingURL],
                        reason: .finderOpen,
                        isLaunchCompleted: true
                    )
                }
                self.scheduleExclusiveColdExplicitDirectoryWindowPruneIfNeeded(keeping: pendingURL)
            } else if self.receivedExplicitOpenBeforeLaunchCompletion {
                self.logger.info("Cold start: explicit open handled; restore suppressed")
            } else {
                // 只有确认不是显式 URL 启动后，才允许把 SwiftUI 预建的隐藏窗口显示出来，
                // 再执行 MarkMark 自己的欢迎页/恢复上次位置逻辑。
                if !self.hasVisibleWindows() {
                    self.activateFirstHiddenWindow()
                }
                self.openRequestCoordinator.handleLaunchCompleted()
            }
            self.didRouteLaunchCompletion = true

            if !self.pendingServiceOpenURLs.isEmpty {
                self.openPendingServiceURLsWhenReady()
            }
        }
    }

    /// 冷启动显式打开目录是排他入口：拖拽目录/打开方式目录应压过默认欢迎页和系统恢复窗口。
    ///
    /// 这个强清理只限定在目录冷启动：文件冷启动需要保留 SwiftUI 的 openWindow 宿主，
    /// 否则后续热打开文件会退化成替换当前窗口，破坏多窗口语义。
    private func scheduleExclusiveColdExplicitDirectoryWindowPruneIfNeeded(keeping url: URL) {
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
              isDirectory.boolValue else { return }
        scheduleExclusiveColdExplicitWindowPrune(keeping: url)
    }

    /// SwiftUI 可能已在目标 URL 注册前先创建旧窗口，因此这里等目标窗口注册后再多次收敛。
    private func scheduleExclusiveColdExplicitWindowPrune(keeping url: URL, attempt: Int = 0) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            guard let self else { return }
            if WindowRouter.shared.hasRegisteredWindow(for: url) {
                WindowRouter.shared.closeVisibleContentWindows(except: url)
                self.bringApplicationToFront(revealHiddenWindow: false)
            }
            if attempt < 12 {
                self.scheduleExclusiveColdExplicitWindowPrune(keeping: url, attempt: attempt + 1)
            }
        }
    }

    // MARK: - Dock 点击处理

    /// 用户点击 Dock 图标时调用
    /// 当所有窗口都关闭后点击 Dock 图标，激活隐藏窗口
    /// 根据 reopenLastLocation 设置决定恢复上次位置还是显示欢迎页
    /// 返回 false 阻止 SwiftUI WindowGroup 自动创建新窗口，避免双窗口 bug
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            logger.info("applicationShouldHandleReopen — activating hidden window")
            activateFirstHiddenWindow()
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.installFileDropHandler()
                self.openRequestCoordinator.handleDockReopen()
            }
        }
        return false
    }

    // MARK: - 窗口级拖拽处理

    /// 在窗口上安装文件拖拽处理器
    /// 完全绕过 SwiftUI .onDrop，直接使用 AppKit NSDraggingDestination
    /// 将 overlay 添加到 themeFrame（contentView.superview），确保在所有子视图之上
    private func installFileDropHandler() {
        for window in NSApp.windows {
            guard window.isVisible,
                  window.canBecomeKey,
                  !(window is NSPanel),
                  let contentView = window.contentView,
                  let themeFrame = contentView.superview else { continue }

            let existing = themeFrame.subviews.first(where: { $0 is FileDropOverlayView })
            if existing != nil { continue }

            let overlay = FileDropOverlayView()
            themeFrame.addSubview(overlay)
            overlay.frame = themeFrame.bounds
            overlay.autoresizingMask = [.width, .height]
            logger.info("FileDropOverlayView installed on theme frame of window '\(window.title)'")
        }
    }
}


// MARK: - Open request router adapter

@MainActor
private final class AppDelegateOpenRequestRouter: OpenRequestRouting {
    private weak var appDelegate: AppDelegate?

    init(appDelegate: AppDelegate) {
        self.appDelegate = appDelegate
    }

    var hasUsableWindow: Bool {
        appDelegate?.hasUsableWindow() ?? false
    }

    func openExternalURL(_ url: URL) {
        appDelegate?.routeURLsToApp([url], reason: "open-request-coordinator")
    }

    func replaceActiveWindow(with url: URL) {
        appDelegate?.postOpenNotification(for: url)
    }

    func restoreLastLocation() {
        if appDelegate?.hasUsableWindow() == true {
            NotificationCenter.default.post(name: .restoreLastLocation, object: nil)
        } else {
            appDelegate?.restoreLastLocationOrOpenWelcomeFallback()
        }
    }

    func resetToWelcome() {
        if appDelegate?.hasUsableWindow() == true {
            NotificationCenter.default.post(name: .resetToWelcome, object: nil)
        } else {
            appDelegate?.openFallbackWelcomeWindow()
        }
    }
}

// MARK: - 文件拖拽覆盖视图

/// 透明 NSView 覆盖层，直接实现 NSDraggingDestination 处理文件拖拽
///
/// 完全绕过 SwiftUI 的 .onDrop 机制。
/// 安装在窗口 themeFrame 上，位于所有子视图之上。
/// hitTest 始终返回 nil — macOS 拖拽系统通过 registerForDraggedTypes + 视图 frame
/// 独立路由拖拽事件，不依赖 hitTest；返回 nil 确保所有鼠标事件（点击、滚动等）
/// 透传到下层 SwiftUI 视图。
final class FileDropOverlayView: NSView {

    private let logger = Logger(subsystem: "com.ft07.markmark", category: "FileDropOverlay")

    override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        registerForDraggedTypes([.fileURL, NSPasteboard.PasteboardType("NSFilenamesPboardType")])
        logger.info("viewDidMoveToSuperview — superview: \(self.superview != nil ? "yes" : "no"), frame: \(NSStringFromRect(self.frame))")
    }

    override func draw(_ dirtyRect: NSRect) {
    }

    // MARK: - hitTest 策略

    override func hitTest(_ point: NSPoint) -> NSView? {
        // 始终返回 nil：透传所有鼠标事件（点击、滚动）
        // macOS 拖拽系统通过 registerForDraggedTypes + 视图 frame 独立路由拖拽事件
        return nil
    }

    // MARK: - NSDraggingDestination

    override func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
        let canAccept = canAcceptDrag(sender)
        logger.info("draggingEntered — canAccept: \(canAccept)")
        guard canAccept else { return [] }
        NotificationCenter.default.post(name: .dragHoverChanged, object: true)
        return .copy
    }

    override func draggingUpdated(_ sender: any NSDraggingInfo) -> NSDragOperation {
        .copy
    }

    override func draggingExited(_ sender: (any NSDraggingInfo)?) {
        logger.info("draggingExited")
        NotificationCenter.default.post(name: .dragHoverChanged, object: false)
    }

    override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
        logger.info("performDragOperation")
        NotificationCenter.default.post(name: .dragHoverChanged, object: false)

        let pasteboard = sender.draggingPasteboard

        let urls: [URL]
        if let fileURLs = pasteboard.readObjects(forClasses: [NSURL.self],
                                                   options: [.urlReadingFileURLsOnly: true]) as? [URL],
           !fileURLs.isEmpty {
            urls = fileURLs
        } else if let paths = pasteboard.propertyList(forType: NSPasteboard.PasteboardType("NSFilenamesPboardType")) as? [String],
                  !paths.isEmpty {
            urls = paths.map { URL(fileURLWithPath: $0) }
        } else {
            return false
        }

        guard let url = urls.first else { return false }

        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else { return false }

        Task { @MainActor in
            for url in urls {
                WindowRouter.shared.openWindow(for: url.markMarkCanonicalFileURL)
            }
        }
        return true
    }

    override func prepareForDragOperation(_ sender: any NSDraggingInfo) -> Bool {
        true
    }

    // MARK: - 辅助

    private func canAcceptDrag(_ sender: any NSDraggingInfo) -> Bool {
        let pasteboard = sender.draggingPasteboard
        if pasteboard.canReadObject(forClasses: [NSURL.self],
                                     options: [.urlReadingFileURLsOnly: true]) {
            return true
        }
        if pasteboard.types?.contains(NSPasteboard.PasteboardType("NSFilenamesPboardType")) == true {
            return true
        }
        return false
    }
}
