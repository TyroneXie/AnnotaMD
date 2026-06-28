import Foundation
import CoreGraphics
import MarkdownReaderKit
import os.log

/// 导出为「自包含单文件 HTML」。
///
/// 与 PDF 导出不同，导出的 HTML 需要能脱离 app 在任意浏览器离线打开，因此把阅读视图
/// 依赖的全部资源内联进同一个 .html 文件：
/// - 正文图片 → base64 data URL（复用 `MarkdownHTMLService.renderWithInlineImages`）
/// - markdown.css / scroll.css / 主题 CSS → 内联 `<style>`
/// - KaTeX：`katex.min.css`（字体 `url(fonts/*.woff2)` 改写为 base64）+ `katex.min.js`
/// - Mermaid：`mermaid.min.js`
/// - 代码高亮：`prism-core` + 全部 `prism-<lang>` 语言组件（取代联网的 autoloader）
/// - `markdown-reader.js` 负责在浏览器里复用 app 同一套 prism/katex/mermaid 初始化逻辑
///
/// mermaid.min.js / katex 体积较大，仅在文档实际用到时才内联，避免普通文档导出动辄数 MB。
enum HTMLExportService {

    private static let logger = Logger(subsystem: "com.ft07.markmark", category: "HTMLExportService")

    /// 构建自包含 HTML 字符串。
    static func buildSelfContainedHTML(
        content: String,
        title: String,
        themeCSS: String,
        contentPadding: CGFloat,
        maxContentWidthFollowsWindow: Bool,
        baseURL: URL?,
        isDark: Bool
    ) -> String {
        // 1. 正文：图片以 base64 内联，使导出文件不依赖原始图片路径
        let bodyHTML = MarkdownHTMLService.renderWithInlineImages(content, baseURL: baseURL).html

        // 2. 特性探测：按需内联体积较大的库
        let hasMermaid = detectMermaid(content)
        let hasMath = detectMath(content)

        // 3. 样式（顺序与阅读视图一致：基础样式 → KaTeX → 主题 → 内容变量）
        var styleBlock = ""
        styleBlock += wrapStyle(inlineResourceText("css/markdown.css"))
        styleBlock += wrapStyle(inlineResourceText("css/scroll.css"))
        if hasMath {
            styleBlock += wrapStyle(katexCSSWithInlinedFonts())
        }
        styleBlock += "<style id=\"mr-theme-style\">\(themeCSS)</style>\n"
        let maxWidth = maxContentWidthFollowsWindow ? "none" : "980px"
        styleBlock += "<style>:root { --content-padding: \(Int(contentPadding))px; --content-max-width: \(maxWidth); }</style>\n"

        // 4. 脚本（库需在 markdown-reader.js 之前）
        var scriptBlock = ""
        if hasMermaid {
            scriptBlock += wrapScript(inlineResourceText("js/mermaid.min.js"))
        }
        if hasMath {
            scriptBlock += wrapScript(inlineResourceText("js/katex.min.js"))
        }
        // Prism：内联 core + 全部语言组件，取代需要联网的 autoloader，保证离线高亮
        scriptBlock += wrapScript(inlineResourceText("js/prism-core.min.js"))
        for langPath in prismLanguageResourcePaths() {
            scriptBlock += wrapScript(inlineResourceText(langPath))
        }
        // markdown-reader.js：复用 app 的 prism/katex/mermaid 初始化（webkit 桥接均有守卫，浏览器安全）
        scriptBlock += "<script data-is-dark=\"\(isDark)\">\n\(inlineResourceText("js/markdown-reader.js"))\n</script>\n"

        let safeTitle = title.isEmpty ? "MarkMark" : escapeHTML(title)

        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>\(safeTitle)</title>
            <meta name="generator" content="MarkMark">
        \(styleBlock)</head>
        <body>
            <div class="markdown-preview">
                <div id="mr-content">
        \(bodyHTML)
                </div>
            </div>
        \(scriptBlock)</body>
        </html>
        """
    }

    private static func escapeHTML(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    // MARK: - 资源内联

    /// 读取 bundle 文本资源；缺失时记录并返回空串（导出降级而非崩溃）。
    private static func inlineResourceText(_ path: String) -> String {
        guard let text = MarkdownURLSchemeHandler.bundleResourceString(forPath: path) else {
            logger.warning("HTMLExport: missing bundle resource \(path, privacy: .public)")
            return ""
        }
        return text
    }

    private static func wrapStyle(_ css: String) -> String {
        css.isEmpty ? "" : "<style>\n\(css)\n</style>\n"
    }

    private static func wrapScript(_ js: String) -> String {
        js.isEmpty ? "" : "<script>\n\(js)\n</script>\n"
    }

    /// 读取 katex.min.css，并把其中 `url(fonts/NAME.woff2)` 改写为 base64 data URL，
    /// 使数学字体随文件一起离线渲染。woff/ttf 回退项保持原样（现代浏览器优先选用 woff2）。
    private static func katexCSSWithInlinedFonts() -> String {
        let css = inlineResourceText("css/katex.min.css")
        guard !css.isEmpty else { return css }

        let pattern = #"url\(fonts/([A-Za-z0-9_\-]+\.woff2)\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return css }

        var result = css
        let matches = regex.matches(in: css, range: NSRange(css.startIndex..., in: css))
        for match in matches.reversed() {
            guard let fullRange = Range(match.range, in: result),
                  let nameRange = Range(match.range(at: 1), in: result) else { continue }
            let fileName = String(result[nameRange])
            guard let data = MarkdownURLSchemeHandler.bundleResourceData(forPath: "css/fonts/\(fileName)") else { continue }
            let base64 = data.base64EncodedString()
            result.replaceSubrange(fullRange, with: "url(data:font/woff2;base64,\(base64))")
        }
        return result
    }

    /// 全部 prism-<lang> 语言组件资源路径（不含 core 与 autoloader）。
    private static func prismLanguageResourcePaths() -> [String] {
        guard let jsDir = MarkdownURLSchemeHandler.bundleResourceURL(forPath: "js") else { return [] }
        let files = (try? FileManager.default.contentsOfDirectory(atPath: jsDir.path)) ?? []
        return files
            .filter { $0.hasPrefix("prism-") && $0.hasSuffix(".min.js") }
            .filter { $0 != "prism-core.min.js" && $0 != "prism-autoloader.min.js" }
            .sorted()
            .map { "js/\($0)" }
    }

    // MARK: - 特性探测

    private static func detectMermaid(_ content: String) -> Bool {
        content.contains("```mermaid") || content.contains("~~~mermaid")
    }

    /// 探测文档是否含 KaTeX 数学：块级 ```math / 围栏，或行内/块级 `$...$` `$$...$$`。
    private static func detectMath(_ content: String) -> Bool {
        if content.contains("```math") || content.contains("```latex") || content.contains("```katex") {
            return true
        }
        if content.contains("$$") { return true }
        // 行内 $...$（要求成对、内部非空白），与渲染管线的判定保持一致
        if let regex = try? NSRegularExpression(pattern: #"(?<!\$)\$(?!\s)(.+?)(?<!\s)\$(?!\$)"#, options: [.dotMatchesLineSeparators]) {
            let range = NSRange(content.startIndex..., in: content)
            if regex.firstMatch(in: content, range: range) != nil { return true }
        }
        return false
    }
}
