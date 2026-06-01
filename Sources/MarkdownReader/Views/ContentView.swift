import SwiftUI

/// 主视图，管理自定义 HStack 两列布局
struct ContentView: View {
    @State private var appViewModel = AppViewModel()
    @State private var fileTreeViewModel = FileTreeViewModel()
    @State private var documentViewModel = DocumentViewModel()

    var body: some View {
        HStack(spacing: 0) {
            // 左侧 Sidebar（单文件模式下不显示）
            if appViewModel.isSidebarVisible && !appViewModel.isSingleFileMode {
                SidebarView(
                    fileTreeViewModel: fileTreeViewModel,
                    appViewModel: appViewModel
                )
                .frame(width: appViewModel.sidebarWidth)

                // 拖拽分隔线
                ResizeHandle(appViewModel: appViewModel)
            }

            // 右侧 Detail 区域
            DetailView(
                appViewModel: appViewModel,
                documentViewModel: documentViewModel,
                fileTreeViewModel: fileTreeViewModel
            )
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle(appViewModel.windowTitle)
        // 全屏状态监听
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEnterFullScreenNotification)) { _ in
            appViewModel.isFullScreen = true
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didExitFullScreenNotification)) { _ in
            appViewModel.isFullScreen = false
        }
        // 快捷键通知
        .onReceive(NotificationCenter.default.publisher(for: .toggleSidebar)) { _ in
            if !appViewModel.isSingleFileMode {
                appViewModel.toggleSidebar()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .switchToRendered)) { _ in
            documentViewModel.switchDisplayMode(.rendered)
        }
        .onReceive(NotificationCenter.default.publisher(for: .switchToSource)) { _ in
            documentViewModel.switchDisplayMode(.source)
        }
        // 打开目录通知
        .onReceive(NotificationCenter.default.publisher(for: .openDirectory)) { notification in
            if let url = notification.object as? URL {
                appViewModel.openDirectory(url)
            }
        }
        // 打开单文件通知
        .onReceive(NotificationCenter.default.publisher(for: .openFile)) { notification in
            if let url = notification.object as? URL {
                appViewModel.openSingleFile(url)
                Task {
                    await documentViewModel.loadFile(at: url)
                }
            }
        }
        // 目录变化时加载文件树
        .onChange(of: appViewModel.rootDirectory) { _, newDirectory in
            if let dir = newDirectory {
                documentViewModel.clearDocument()
                Task {
                    await fileTreeViewModel.loadDirectory(dir)
                }
            }
        }
        // 选中文件变化时加载文档
        .onChange(of: fileTreeViewModel.selectedFileURL) { _, newURL in
            if let url = newURL {
                Task {
                    await documentViewModel.loadFile(at: url)
                }
                updateSelectedFile(url: url)
            }
        }
    }

    private func updateSelectedFile(url: URL) {
        let node = findFileNode(in: fileTreeViewModel.nodes, url: url)
        appViewModel.selectedFile = node
    }

    private func findFileNode(in nodes: [FileNode], url: URL) -> FileNode? {
        for node in nodes {
            if node.path == url {
                return node
            }
            if node.isDirectory, let children = node.children {
                if let found = findFileNode(in: children, url: url) {
                    return found
                }
            }
        }
        return nil
    }
}
