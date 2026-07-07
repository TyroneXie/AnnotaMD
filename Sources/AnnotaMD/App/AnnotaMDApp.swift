import SwiftUI
import MarkdownReaderKit

@main
struct AnnotaMDApp: App {

    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    /// 自动更新 ViewModel
    @State private var updateViewModel = UpdateViewModel()

    init() {
        DispatchQueue.main.async {
            NSApp.setActivationPolicy(.regular)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    /// 当前界面语言（从共享 SettingsModel 读取，用于菜单等非视图场景）
    private var language: Language {
        SettingsModel.shared.languagePref.resolvedLanguage
    }

    /// 最近打开记录（从 SettingsModel 读取，用于菜单动态生成）
    private var recentItems: [RecentItem] {
        SettingsModel.shared.recentItems
    }

    private var launchWindowSize: CGSize {
        SettingsModel.shared.launchWindowSize
    }

    /// 打开最近的子菜单（文件在上、目录在下，不显示分区标题）
    @ViewBuilder
    private var openRecentMenu: some View {
        if recentItems.isEmpty {
            Text(L10n.tr(.openRecentEmpty, language: language))
                .disabled(true)
        } else {
            Menu(L10n.tr(.openRecent, language: language)) {
                let files = recentItems.filter { !$0.isDirectory }
                let folders = recentItems.filter { $0.isDirectory }

                // 文件列表
                ForEach(files) { item in
                    Button {
                        WindowRouter.shared.openRecent(item.url, isDirectory: false)
                    } label: {
                        HStack {
                            Image(systemName: "doc.text")
                            Text(item.displayName)
                        }
                    }
                }

                // 分隔线（文件和目录都有时显示）
                if !files.isEmpty && !folders.isEmpty {
                    Divider()
                }

                // 目录列表
                ForEach(folders) { item in
                    Button {
                        WindowRouter.shared.openRecent(item.url, isDirectory: true)
                    } label: {
                        HStack {
                            Image(systemName: "folder")
                            Text(item.displayName)
                        }
                    }
                }

                Divider()

                Button(L10n.tr(.clearRecentItems, language: language)) {
                    SettingsModel.shared.clearRecentItems()
                }
            }
        }
    }

    var body: some Scene {
        // 值型 WindowGroup：每个窗口绑定一个 URL（文件/目录），nil 即欢迎页/冷启动窗口。
        // 双击不同文件 → AppDelegate 通过 WindowRouter 调 openWindow(value:) 开独立窗口；
        // 双击同一文件 → 聚焦已有窗口（值型窗口去重）。
        WindowGroup(for: URL.self) { $openedURL in
            ContentView(openedURL: openedURL)
                // 自动更新弹窗
                .sheet(isPresented: $updateViewModel.isShowingUpdateSheet) {
                    UpdateView(viewModel: updateViewModel)
                        .environment(\.language, language)
                }
                // 启动时自动检查更新（延迟 2 秒，避免影响启动速度）
                .task {
                    WebViewWarmer.warmUp()
                    try? await Task.sleep(for: .seconds(2))
                    updateViewModel.checkForUpdatesAutomatically()
                }
                // 监听手动检查更新通知
                .onReceive(NotificationCenter.default.publisher(for: .checkForUpdates)) { _ in
                    updateViewModel.checkForUpdatesManually()
                }
        }
        // .handlesExternalEvents(matching:) scene modifier 已移除
        // 冷启动时 ContentView.task 通过 UserDefaults 读取 AppDelegate 写入的文件路径，
        // 无需 SwiftUI 为外部事件创建额外窗口，避免出现双窗口问题
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: launchWindowSize.width, height: launchWindowSize.height)
        .windowResizability(.automatic)
        .commands {
            // 编辑菜单：自定义撤销/重做，直接作用于当前文件的 per-file UndoManager（issue #8）。
            // 渲染模式下第一响应者是只读 WKWebView，不处理 `undo:`，默认菜单项会失效并发出系统提示音；
            // 这里改为发通知给当前活跃窗口的 DocumentViewModel 主动执行撤销/重做。
            CommandGroup(replacing: .undoRedo) {
                Button(L10n.tr(.editUndo, language: language)) {
                    NotificationCenter.default.post(name: .performUndo, object: nil)
                }
                .keyboardShortcut("z", modifiers: .command)

                Button(L10n.tr(.editRedo, language: language)) {
                    NotificationCenter.default.post(name: .performRedo, object: nil)
                }
                .keyboardShortcut("z", modifiers: [.command, .shift])
            }

            // 设置菜单：Cmd+, → 切换窗口内设置状态
            CommandGroup(replacing: .appSettings) {
                Button(L10n.tr(.settingsMenuLabel, language: language)) {
                    NotificationCenter.default.post(name: .toggleSettings, object: nil)
                }
                .keyboardShortcut(",", modifiers: .command)

                // 检查更新
                Button(L10n.tr(.checkForUpdates, language: language)) {
                    NotificationCenter.default.post(name: .checkForUpdates, object: nil)
                }
            }

            // 文件菜单：从剪贴板新建标注 + 打开 + 保存 + 打开最近
            CommandGroup(replacing: .newItem) {
                Button(L10n.tr(.newFromClipboard, language: language)) {
                    NotificationCenter.default.post(name: .newFromClipboard, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)

                Button(L10n.tr(.open, language: language) + "...") {
                    OpenPanelHelper.show(language: language)
                }
                .keyboardShortcut("o", modifiers: .command)

                Button(L10n.tr(.titleBarSave, language: language)) {
                    NotificationCenter.default.post(name: .saveFile, object: nil)
                }
                .keyboardShortcut("s", modifiers: .command)

                Button(L10n.tr(.exportPDF, language: language)) {
                    NotificationCenter.default.post(name: .exportPDF, object: nil)
                }
                .keyboardShortcut("e", modifiers: [.command, .option])

                Button(L10n.tr(.exportHTML, language: language)) {
                    NotificationCenter.default.post(name: .exportHTML, object: nil)
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])

                Divider()

                // CriticMarkup：复制带标注文档给 AI
                Button(L10n.tr(.copyForAIMenu, language: language)) {
                    NotificationCenter.default.post(name: .copyForAI, object: nil)
                }
                .keyboardShortcut("c", modifiers: [.command, .shift])

                // CriticMarkup：应用 / 放弃所有标注
                Button(L10n.tr(.applyAnnotationsMenu, language: language)) {
                    NotificationCenter.default.post(name: .applyAllAnnotations, object: nil)
                }
                Button(L10n.tr(.discardAnnotationsMenu, language: language)) {
                    NotificationCenter.default.post(name: .discardAllAnnotations, object: nil)
                }

                // 打开最近子菜单
                openRecentMenu
            }

            // 视图菜单：Sidebar 切换
            CommandGroup(after: .toolbar) {
                Button(L10n.tr(.navigationBack, language: language)) {
                    NotificationCenter.default.post(name: .navigateBack, object: nil)
                }
                .keyboardShortcut("[", modifiers: .command)

                Button(L10n.tr(.navigationForward, language: language)) {
                    NotificationCenter.default.post(name: .navigateForward, object: nil)
                }
                .keyboardShortcut("]", modifiers: .command)

                Divider()

                Button(L10n.tr(.titleBarToggleSidebar, language: language)) {
                    NotificationCenter.default.post(name: .toggleSidebar, object: nil)
                }
                .keyboardShortcut("\\", modifiers: .command)

                Button(L10n.tr(.toggleDisplayModeMenu, language: language)) {
                    NotificationCenter.default.post(name: .toggleDisplayMode, object: nil)
                }
                .keyboardShortcut(.return, modifiers: .command)
            }

            // Markdown 格式
            CommandMenu(L10n.tr(.formatMenu, language: language)) {
                Button(L10n.tr(.formatBold, language: language)) {
                    NotificationCenter.default.post(name: .formatBold, object: nil)
                }
                .keyboardShortcut("b", modifiers: .command)

                Button(L10n.tr(.formatItalic, language: language)) {
                    NotificationCenter.default.post(name: .formatItalic, object: nil)
                }
                .keyboardShortcut("i", modifiers: .command)

                Button(L10n.tr(.formatUnderline, language: language)) {
                    NotificationCenter.default.post(name: .formatUnderline, object: nil)
                }
                .keyboardShortcut("u", modifiers: .command)

                Button(L10n.tr(.formatInlineCode, language: language)) {
                    NotificationCenter.default.post(name: .formatInlineCode, object: nil)
                }
                .keyboardShortcut("k", modifiers: [.command, .shift])
            }

            // 查找菜单
            CommandMenu(L10n.tr(.findBarFind, language: language)) {
                Button(L10n.tr(.findBarFind, language: language) + "\u{2026}") {
                    NotificationCenter.default.post(name: .findInDocument, object: nil)
                }
                .keyboardShortcut("f", modifiers: .command)

                Button(L10n.tr(.findBarFindNext, language: language)) {
                    NotificationCenter.default.post(name: .findNext, object: nil)
                }
                .keyboardShortcut("g", modifiers: .command)

                Button(L10n.tr(.findBarFindPrevious, language: language)) {
                    NotificationCenter.default.post(name: .findPrevious, object: nil)
                }
                .keyboardShortcut("g", modifiers: [.command, .shift])

                Button(L10n.tr(.findBarFindAndReplace, language: language) + "\u{2026}") {
                    NotificationCenter.default.post(name: .findAndReplace, object: nil)
                }
                .keyboardShortcut("f", modifiers: [.command, .option])
            }
        }
    }
}


// MARK: - Notification Names

extension Notification.Name {
    static let toggleSidebar = Notification.Name("com.xielintao.annotamd.toggleSidebar")
    static let switchToRendered = Notification.Name("com.xielintao.annotamd.switchToRendered")
    static let switchToRaw = Notification.Name("com.xielintao.annotamd.switchToRaw")
    static let toggleDisplayMode = Notification.Name("com.xielintao.annotamd.toggleDisplayMode")
    static let formatBold = Notification.Name("com.xielintao.annotamd.formatBold")
    static let formatItalic = Notification.Name("com.xielintao.annotamd.formatItalic")
    static let formatUnderline = Notification.Name("com.xielintao.annotamd.formatUnderline")
    static let formatInlineCode = Notification.Name("com.xielintao.annotamd.formatInlineCode")
    static let openDirectory = Notification.Name("com.xielintao.annotamd.openDirectory")
    static let openFile = Notification.Name("com.xielintao.annotamd.openFile")
    static let openExternalDirectory = Notification.Name("com.xielintao.annotamd.openExternalDirectory")
    static let openExternalFile = Notification.Name("com.xielintao.annotamd.openExternalFile")
    static let toggleSettings = Notification.Name("com.xielintao.annotamd.toggleSettings")
    static let newFromClipboard = Notification.Name("com.xielintao.annotamd.newFromClipboard")
    static let saveFile = Notification.Name("com.xielintao.annotamd.saveFile")
    static let saveAsFile = Notification.Name("com.xielintao.annotamd.saveAsFile")
    static let reloadFile = Notification.Name("com.xielintao.annotamd.reloadFile")
    static let clearRecentItems = Notification.Name("com.xielintao.annotamd.clearRecentItems")
    static let restoreLastLocation = Notification.Name("com.xielintao.annotamd.restoreLastLocation")
    static let resetToWelcome = Notification.Name("com.xielintao.annotamd.resetToWelcome")
    static let checkForUpdates = Notification.Name("com.xielintao.annotamd.checkForUpdates")
    static let findInDocument = Notification.Name("com.xielintao.annotamd.findInDocument")
    static let findNext = Notification.Name("com.xielintao.annotamd.findNext")
    static let findPrevious = Notification.Name("com.xielintao.annotamd.findPrevious")
    static let findAndReplace = Notification.Name("com.xielintao.annotamd.findAndReplace")
    static let exportPDF = Notification.Name("com.xielintao.annotamd.exportPDF")
    static let exportHTML = Notification.Name("com.xielintao.annotamd.exportHTML")
    static let copyForAI = Notification.Name("com.xielintao.annotamd.copyForAI")
    static let applyAllAnnotations = Notification.Name("com.xielintao.annotamd.applyAllAnnotations")
    static let discardAllAnnotations = Notification.Name("com.xielintao.annotamd.discardAllAnnotations")
    static let performUndo = Notification.Name("com.xielintao.annotamd.performUndo")
    static let performRedo = Notification.Name("com.xielintao.annotamd.performRedo")
    static let navigateBack = Notification.Name("com.xielintao.annotamd.navigateBack")
    static let navigateForward = Notification.Name("com.xielintao.annotamd.navigateForward")
    static let dragHoverChanged = Notification.Name("com.xielintao.annotamd.dragHoverChanged")
    static let unsupportedFileTypeDropped = Notification.Name("com.xielintao.annotamd.unsupportedFileTypeDropped")
    static let contentWindowReadyForLaunchRouting = Notification.Name("com.xielintao.annotamd.contentWindowReadyForLaunchRouting")
}
