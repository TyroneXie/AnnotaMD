import SwiftUI

/// Markdown 原文显示视图，使用等宽字体
struct SourceMarkdownView: View {
    let content: String
    var fontSize: CGFloat = 13
    var contentPadding: CGFloat = 20

    var body: some View {
        ScrollView {
            Text(content)
                .font(.system(size: fontSize, design: .monospaced))
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
                .padding(contentPadding)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
