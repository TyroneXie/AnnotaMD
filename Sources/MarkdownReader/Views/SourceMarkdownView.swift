import SwiftUI

/// Markdown 原文显示视图，使用等宽字体
struct SourceMarkdownView: View {
    let content: String

    var body: some View {
        ScrollView {
            Text(content)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
