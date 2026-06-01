import SwiftUI

/// 右侧主体区容器（圆角），包含 TitleBar 和内容区
struct DetailView: View {
    let appViewModel: AppViewModel
    let documentViewModel: DocumentViewModel
    let fileTreeViewModel: FileTreeViewModel
    let settings: SettingsModel

    var body: some View {
        VStack(spacing: 0) {
            // 自定义 TitleBar
            TitleBarView(
                appViewModel: appViewModel,
                documentViewModel: documentViewModel
            )

            Divider()

            // 内容区域
            contentArea
        }
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(
            .rect(
                topLeadingRadius: 10,
                bottomLeadingRadius: 10,
                bottomTrailingRadius: 0,
                topTrailingRadius: 0
            )
        )
    }

    // MARK: - 内容区

    @ViewBuilder
    private var contentArea: some View {
        if appViewModel.rootDirectory == nil && !appViewModel.isSingleFileMode {
            // 首次启动空状态（无目录也无单文件）
            WelcomeView(appViewModel: appViewModel)
        } else if let error = documentViewModel.fileError {
            // 错误状态
            ErrorView(
                icon: "exclamationmark.triangle",
                message: error.localizedDescription
            )
        } else if documentViewModel.isLoading {
            ProgressView("加载中...")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if documentViewModel.hasDocument {
            // 文档内容
            documentContentView
        } else if !appViewModel.isSingleFileMode && fileTreeViewModel.isEmptyDirectory {
            // 空目录状态
            ErrorView(
                icon: "folder",
                message: "该目录下无 Markdown 文件"
            )
        } else {
            // 选中目录但未选中文件
            WelcomeView(appViewModel: appViewModel)
        }
    }

    // MARK: - 文档内容视图

    @ViewBuilder
    private var documentContentView: some View {
        switch documentViewModel.displayMode {
        case .rendered:
            RenderedMarkdownView(
                content: documentViewModel.content,
                fileURL: documentViewModel.currentFileURL,
                contentPadding: settings.contentPaddingPoints
            )
        case .source:
            SourceMarkdownView(
                content: documentViewModel.content,
                fontSize: settings.sourceFontPointSize,
                contentPadding: settings.contentPaddingPoints
            )
        }
    }
}
