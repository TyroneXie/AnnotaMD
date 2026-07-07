import SwiftUI
import MarkdownReaderKit

/// 目录树中单个文件/目录行视图
struct FileRowView: View {
    let node: FileNode
    let fileTreeViewModel: FileTreeViewModel
    let documentViewModel: DocumentViewModel
    @Environment(\.themeColors) private var themeColors

    /// 当前文件是否有未保存的修改
    private var isDirty: Bool {
        !node.isDirectory && documentViewModel.isFileDirty(at: node.path)
    }

    var body: some View {
        HStack(spacing: 6) {
            if node.isDirectory {
                Image(systemName: "folder.fill")
                    .foregroundStyle(themeColors.ink)
                    .frame(width: 16)
            } else {
                Image(systemName: iconName)
                    .foregroundStyle(node.isPreviewable ? themeColors.fgSecondary : themeColors.fgMuted)
                    .frame(width: 16)
            }

            Text(node.name)
                .foregroundStyle(node.isPreviewable || node.isDirectory ? themeColors.ink : themeColors.fgSecondary)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
                .layoutPriority(1)

            if isDirty {
                Text("*")
                    .foregroundStyle(themeColors.accent)
                    .layoutPriority(2)
            }
        }
        .padding(.vertical, 8)
        .padding(.leading, 6)
        .padding(.trailing, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var iconName: String {
        node.isMarkdown ? "doc.richtext" : "doc"
    }

}
