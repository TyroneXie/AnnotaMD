import SwiftUI

/// 目录树中单个文件/目录行视图
struct FileRowView: View {
    let node: FileNode
    let fileTreeViewModel: FileTreeViewModel

    var body: some View {
        if node.isDirectory {
            directoryRow
        } else {
            fileRow
        }
    }

    // MARK: - 目录行（OutlineGroup 自动处理展开/折叠）

    private var directoryRow: some View {
        HStack(spacing: 6) {
            Image(systemName: "folder.fill")
                .foregroundStyle(.secondary)
                .frame(width: 16)

            Text(node.name)
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer()
        }
    }

    // MARK: - 文件行

    private var fileRow: some View {
        HStack(spacing: 6) {
            Image(systemName: node.isMarkdown ? "doc.text" : "doc")
                .foregroundStyle(node.isMarkdown ? .secondary : .tertiary)
                .frame(width: 16)

            Text(node.name)
                .foregroundStyle(node.isMarkdown ? .primary : .secondary)
                .lineLimit(1)

            Spacer()
        }
    }
}
