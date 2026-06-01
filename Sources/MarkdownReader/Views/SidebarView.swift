import SwiftUI

/// 左侧 Sidebar 目录树视图
struct SidebarView: View {
    let fileTreeViewModel: FileTreeViewModel
    let appViewModel: AppViewModel

    var body: some View {
        VStack(spacing: 0) {
            // 顶部红绿灯占位区域（与 TitleBar 对齐 50px）
            HStack {
                Color.clear
                    .frame(width: appViewModel.trafficLightWidth, height: 50)
                Spacer()
            }

            Divider()

            // 目录树列表
            if fileTreeViewModel.isLoading {
                ProgressView("加载中...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = fileTreeViewModel.errorMessage {
                ErrorView(message: error)
            } else if fileTreeViewModel.nodes.isEmpty {
                emptyDirectoryView
            } else {
                directoryTreeView
            }
        }
        .background(Color(nsColor: .underPageBackgroundColor))
    }

    // MARK: - 目录树（使用 OutlineGroup 渲染嵌套结构）

    private var directoryTreeView: some View {
        List(selection: Binding<URL?>(
            get: { fileTreeViewModel.selectedFileURL },
            set: { url in
                if let url {
                    if let node = findNode(in: fileTreeViewModel.nodes, url: url) {
                        if node.isDirectory {
                            fileTreeViewModel.toggleExpand(url)
                        } else {
                            fileTreeViewModel.selectFile(node)
                        }
                    }
                }
            }
        )) {
            OutlineGroup(
                fileTreeViewModel.nodes,
                children: \.children
            ) { node in
                FileRowView(node: node, fileTreeViewModel: fileTreeViewModel)
                    .tag(node.path)
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .focusable()
        .onMoveCommand { direction in
            switch direction {
            case .up:
                _ = fileTreeViewModel.moveSelection(direction: -1)
            case .down:
                _ = fileTreeViewModel.moveSelection(direction: 1)
            default:
                break
            }
        }
        .onKeyPress(.return) {
            if let url = fileTreeViewModel.selectedFileURL,
               let node = findNode(in: fileTreeViewModel.nodes, url: url) {
                if node.isDirectory {
                    fileTreeViewModel.toggleExpand(url)
                } else {
                    fileTreeViewModel.selectFile(node)
                }
            }
            return .handled
        }
    }

    // MARK: - 空目录提示

    private var emptyDirectoryView: some View {
        VStack(spacing: 8) {
            Image(systemName: "folder")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text("该目录下无 Markdown 文件")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - 辅助方法

    private func findNode(in nodes: [FileNode], url: URL) -> FileNode? {
        for node in nodes {
            if node.path == url { return node }
            if node.isDirectory, let children = node.children {
                if let found = findNode(in: children, url: url) {
                    return found
                }
            }
        }
        return nil
    }
}
