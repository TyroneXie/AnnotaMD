import SwiftUI
import UniformTypeIdentifiers

/// 打开面板工具，提供统一的 NSOpenPanel 调用逻辑
/// MarkdownReaderApp（菜单 Cmd+O）和 ContentView（Sidebar 按钮）共用
enum OpenPanelHelper {

    /// 显示打开面板，用户选择后发送对应通知
    /// - Parameter language: 当前界面语言，用于面板提示文本
    @MainActor
    static func show(language: Language) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = L10n.tr(.open, language: language)
        panel.allowedContentTypes = [.folder, UTType(filenameExtension: "md")].compactMap { $0 }

        if panel.runModal() == .OK, let url = panel.url {
            var isDir: ObjCBool = false
            FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)

            if isDir.boolValue {
                NotificationCenter.default.post(name: .openDirectory, object: url)
            } else {
                NotificationCenter.default.post(name: .openFile, object: url)
            }
        }
    }
}
