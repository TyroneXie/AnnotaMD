import Foundation
import Testing
@testable import AnnotaMD

@Suite("HTML export")
struct HTMLExportTests {

    private func build(_ content: String, baseURL: URL? = nil) -> String {
        HTMLExportService.buildSelfContainedHTML(
            content: content,
            title: "Sample",
            themeCSS: ":root { --accent: #f00; }",
            contentPadding: 24,
            maxContentWidthFollowsWindow: false,
            baseURL: baseURL,
            isDark: false
        )
    }

    @Test("produces a complete, titled HTML document with the rendered body")
    func producesCompleteDocument() {
        let html = build("# Hello\n\nWorld **bold**.")
        #expect(html.hasPrefix("<!DOCTYPE html>"))
        #expect(html.contains("<title>Sample</title>"))
        #expect(html.contains("id=\"mr-content\""))
        #expect(html.contains("class=\"markdown-preview\""))
        // 正文已渲染
        #expect(html.contains(">Hello</h1>"))
        #expect(html.contains("<strong>bold</strong>"))
        // 主题 CSS 被内联
        #expect(html.contains("--accent: #f00;"))
        // 内容变量
        #expect(html.contains("--content-padding: 24px"))
    }

    @Test("export is self-contained: no mr:// scheme references remain")
    func selfContainedNoSchemeRefs() {
        let html = build("# Title\n\n```swift\nlet x = 1\n```\n")
        #expect(!html.contains("mr://"))
    }

    @Test("local images are inlined as base64 data URLs")
    func inlinesLocalImages() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("mm-html-export-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        // 最小合法 1x1 PNG
        let pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        let pngData = Data(base64Encoded: pngBase64)!
        try pngData.write(to: dir.appendingPathComponent("pic.png"))

        let html = build("![alt](pic.png)\n", baseURL: dir)
        #expect(html.contains("data:image/png;base64,"))
        #expect(!html.contains("src=\"pic.png\""))
    }

    // MARK: - Prism 语言组件排序（离线内联，无 autoloader）

    @Test("php is excluded (needs un-bundled markup-templating plugin)")
    func prismExcludesPHP() {
        let langs = HTMLExportService.orderedPrismLanguages(available: ["php", "swift", "python"])
        #expect(!langs.contains("php"))
        #expect(langs.contains("swift"))
    }

    @Test("dependency providers precede the components that extend them")
    func prismDependencyOrder() {
        let langs = HTMLExportService.orderedPrismLanguages(
            available: ["cpp", "c", "tsx", "jsx", "typescript", "shell-session", "bash", "swift"]
        )
        func idx(_ l: String) -> Int { langs.firstIndex(of: l)! }
        #expect(idx("c") < idx("cpp"))
        #expect(idx("bash") < idx("shell-session"))
        #expect(idx("jsx") < idx("tsx"))
        #expect(idx("typescript") < idx("tsx"))
    }

    @Test("missing dependency providers don't crash ordering")
    func prismNoProvidersIsFine() {
        let langs = HTMLExportService.orderedPrismLanguages(available: ["swift", "python", "yaml"])
        #expect(Set(langs) == ["swift", "python", "yaml"])
        #expect(HTMLExportService.orderedPrismLanguages(available: []).isEmpty)
    }
}
