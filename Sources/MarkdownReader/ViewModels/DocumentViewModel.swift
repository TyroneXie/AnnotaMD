import SwiftUI

/// 文档视图模型，管理当前文档状态和文件读取
@MainActor
@Observable
final class DocumentViewModel {

    // MARK: - 状态

    /// 当前文档内容
    var content: String = ""

    /// 当前文件 URL
    var currentFileURL: URL?

    /// 当前文件名
    var fileName: String = ""

    /// 显示模式
    var displayMode: DisplayMode = .rendered

    /// 是否正在加载
    var isLoading: Bool = false

    /// 错误信息
    var fileError: FileError?

    /// 是否有文档打开
    var hasDocument: Bool {
        currentFileURL != nil && fileError == nil
    }

    // MARK: - 依赖

    private let fileService: FileService

    // MARK: - 初始化

    init(fileService: FileService = FileService()) {
        self.fileService = fileService
    }

    // MARK: - 方法

    /// 加载文件内容
    /// - Parameter url: 文件 URL
    func loadFile(at url: URL) async {
        // 检查是否为 Markdown 文件
        guard url.pathExtension == "md" else {
            fileError = .unsupportedFileType(url.pathExtension)
            content = ""
            currentFileURL = url
            fileName = url.lastPathComponent
            return
        }

        isLoading = true
        fileError = nil

        do {
            content = try await fileService.readFile(at: url)
            currentFileURL = url
            fileName = url.lastPathComponent
        } catch let fileError as FileError {
            self.fileError = fileError
            content = ""
            currentFileURL = url
            fileName = url.lastPathComponent
        } catch {
            self.fileError = .unknown(error)
            content = ""
            currentFileURL = url
            fileName = url.lastPathComponent
        }

        isLoading = false
    }

    /// 加载选中的文件节点
    /// - Parameter node: 文件节点
    func loadFileNode(_ node: FileNode) async {
        if !node.isMarkdown {
            fileError = .unsupportedFileType(node.path.pathExtension)
            currentFileURL = node.path
            fileName = node.name
            content = ""
            return
        }
        await loadFile(at: node.path)
    }

    /// 切换显示模式
    func switchDisplayMode(_ mode: DisplayMode) {
        displayMode = mode
    }

    /// 清除当前文档
    func clearDocument() {
        content = ""
        currentFileURL = nil
        fileName = ""
        fileError = nil
        isLoading = false
    }
}
