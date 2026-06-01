import SwiftUI
import Textual

/// Markdown 渲染显示视图，使用 Textual 的 StructuredText
struct RenderedMarkdownView: View {
    let content: String
    let fileURL: URL?
    var contentPadding: CGFloat = 20

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                StructuredText(markdown: content)
                    .textual.structuredTextStyle(.gitHub)
                    .textual.textSelection(.enabled)
                    .padding(contentPadding)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .id(fileURL)
        .environment(\.openURL, OpenURLAction { url in
            NSWorkspace.shared.open(url)
            return .handled
        })
    }
}
