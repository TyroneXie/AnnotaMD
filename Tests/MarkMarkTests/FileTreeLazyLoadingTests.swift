import Foundation
import Testing
@testable import MarkMark

@MainActor
@Suite("File tree lazy loading")
struct FileTreeLazyLoadingTests {

    @Test("scanDirectoryLevel is shallow and only marks Markdown as previewable")
    func scanDirectoryLevelIsShallowAndMarkdownOnly() async throws {
        let root = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }

        let childDir = root.appendingPathComponent("child", isDirectory: true)
        try FileManager.default.createDirectory(at: childDir, withIntermediateDirectories: false)
        try "# Root".write(to: root.appendingPathComponent("root.md"), atomically: true, encoding: .utf8)
        try "# Nested".write(to: childDir.appendingPathComponent("nested.md"), atomically: true, encoding: .utf8)
        try "{\"ok\":true}".write(to: root.appendingPathComponent("data.json"), atomically: true, encoding: .utf8)
        try "plain text".write(to: root.appendingPathComponent("unknown.foo"), atomically: true, encoding: .utf8)

        let fileService = FileService()
        let filteredNodes = try await fileService.scanDirectoryLevel(
            root,
            showHiddenFiles: false,
            showNonMarkdownFiles: false
        )

        #expect(filteredNodes.map(\.name) == ["child", "root.md"])
        let filteredChild = try #require(filteredNodes.first)
        #expect(filteredChild.isDirectory)
        #expect(!filteredChild.isChildrenLoaded)

        let allNodes = try await fileService.scanDirectoryLevel(
            root,
            showHiddenFiles: false,
            showNonMarkdownFiles: true
        )
        let markdownNode = try #require(allNodes.first { $0.name == "root.md" })
        #expect(markdownNode.isPreviewable)

        let jsonNode = try #require(allNodes.first { $0.name == "data.json" })
        #expect(!jsonNode.isPreviewable)

        let unknownNode = try #require(allNodes.first { $0.name == "unknown.foo" })
        #expect(!unknownNode.isPreviewable)
    }

    @Test("FileTreeViewModel loads root immediately and expands children on demand")
    func fileTreeViewModelLoadsChildrenOnDemand() async throws {
        let root = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }

        let childDir = root.appendingPathComponent("child", isDirectory: true)
        try FileManager.default.createDirectory(at: childDir, withIntermediateDirectories: false)
        try "# Root".write(to: root.appendingPathComponent("root.md"), atomically: true, encoding: .utf8)
        try "# Nested".write(to: childDir.appendingPathComponent("nested.md"), atomically: true, encoding: .utf8)

        let settings = SettingsModel()
        settings.showHiddenFiles = false
        settings.showNonMarkdownFiles = true
        let viewModel = FileTreeViewModel(settings: settings)

        await viewModel.loadDirectory(root)

        let rootNode = try #require(viewModel.nodes.first)
        #expect(rootNode.path == root)
        #expect(rootNode.isChildrenLoaded)
        #expect(viewModel.isExpanded(root))

        let childNode = try #require(rootNode.children?.first { $0.name == "child" })
        #expect(childNode.isDirectory)
        #expect(!childNode.isChildrenLoaded)
        #expect(childNode.children == nil)

        let loadedChildURL = childNode.path
        viewModel.expandDirectory(loadedChildURL)
        try await waitUntilLoaded(in: viewModel, url: loadedChildURL)

        let loadedChild = try #require(findNode(in: viewModel.nodes, url: loadedChildURL))
        #expect(loadedChild.isChildrenLoaded)
        #expect(loadedChild.children?.map(\.name) == ["nested.md"])
    }
}

private func makeTemporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("MarkMarkLazyTreeTests")
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

@MainActor
private func waitUntilLoaded(in viewModel: FileTreeViewModel, url: URL) async throws {
    for _ in 0..<50 {
        if findNode(in: viewModel.nodes, url: url)?.isChildrenLoaded == true {
            return
        }
        try await Task.sleep(nanoseconds: 20_000_000)
    }
    Issue.record("Timed out waiting for directory to load: \(url.path)")
}

private func findNode(in nodes: [FileNode], url: URL) -> FileNode? {
    for node in nodes {
        if node.path == url { return node }
        if let children = node.children,
           let found = findNode(in: children, url: url) {
            return found
        }
    }
    return nil
}
