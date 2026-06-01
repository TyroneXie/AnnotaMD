import SwiftUI
import UniformTypeIdentifiers

@main
struct MarkdownReaderApp: App {

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 900, height: 600)
        .windowResizability(.contentMinSize)
        .commands {
            // 文件菜单：打开
            CommandGroup(replacing: .newItem) {
                Button("Open...") {
                    openPanel()
                }
                .keyboardShortcut("o", modifiers: .command)
            }

            // 视图菜单：Sidebar 切换
            CommandGroup(after: .toolbar) {
                Button("Toggle Sidebar") {
                    NotificationCenter.default.post(name: .toggleSidebar, object: nil)
                }
                .keyboardShortcut("\\", modifiers: .command)

                Divider()

                Button("Rendered View") {
                    NotificationCenter.default.post(name: .switchToRendered, object: nil)
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])

                Button("Source View") {
                    NotificationCenter.default.post(name: .switchToSource, object: nil)
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }
        }
    }

    /// 统一的打开面板，支持选择目录和 .md 文件
    private func openPanel() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "打开"
        panel.allowedContentTypes = [.folder, UTType(filenameExtension: "md")].compactMap { $0 }

        if panel.runModal() == .OK, let url = panel.url {
            var isDir: ObjCBool = false
            FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)

            if isDir.boolValue {
                // 目录模式
                NotificationCenter.default.post(name: .openDirectory, object: url)
            } else {
                // 单文件模式
                NotificationCenter.default.post(name: .openFile, object: url)
            }
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let toggleSidebar = Notification.Name("com.markdownreader.toggleSidebar")
    static let switchToRendered = Notification.Name("com.markdownreader.switchToRendered")
    static let switchToSource = Notification.Name("com.markdownreader.switchToSource")
    static let openDirectory = Notification.Name("com.markdownreader.openDirectory")
    static let openFile = Notification.Name("com.markdownreader.openFile")
}
