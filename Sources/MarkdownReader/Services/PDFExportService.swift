import WebKit
import MarkdownReaderKit

enum PDFExportService {

    /// 使用 WKWebView 渲染 HTML 并导出为 PDF
    /// - Parameters:
    ///   - html: 完整 HTML 内容
    ///   - baseURL: 基础 URL（用于 mr:// scheme）
    ///   - contentWidth: 内容宽度（points），用于设置 PDF 页面宽度
    ///   - contentPadding: 内容内边距（points）
    /// - Returns: PDF 数据
    @MainActor
    static func export(html: String, baseURL: URL?, contentWidth: CGFloat, contentPadding: CGFloat) async throws -> Data {
        let handler = MRURLSchemeHandler(baseURL: baseURL)
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(handler, forURLScheme: "mr")

        let totalWidth = contentWidth + 2 * contentPadding
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: totalWidth, height: 10000), configuration: configuration)

        let effectiveBaseURL = baseURL ?? URL(string: "about:blank")!
        webView.loadHTMLString(html, baseURL: effectiveBaseURL)

        while webView.isLoading {
            try await Task.sleep(for: .milliseconds(100))
        }
        try await Task.sleep(for: .milliseconds(500))

        let scrollHeight = try await webView.evaluateJavaScript("document.documentElement.scrollHeight") as? Double ?? 10000
        webView.frame.size.height = CGFloat(scrollHeight)
        try? await Task.sleep(for: .milliseconds(100))

        let pdfConfig = WKPDFConfiguration()
        pdfConfig.rect = CGRect(x: 0, y: 0, width: totalWidth, height: 1414)

        return try await webView.pdf(configuration: pdfConfig)
    }
}

/// WKURLSchemeHandler 兼容的 mr:// scheme handler
/// 复用 MarkdownURLSchemeHandler 的资源解析逻辑
private final class MRURLSchemeHandler: NSObject, WKURLSchemeHandler {
    let baseURL: URL?
    let resourceSearchPaths: [URL]?

    init(baseURL: URL?, resourceSearchPaths: [URL]? = nil) {
        self.baseURL = baseURL
        self.resourceSearchPaths = resourceSearchPaths
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              url.scheme == "mr" else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        var path = url.path
        if path.hasPrefix("/") {
            path = String(path.dropFirst())
        }

        let resourceURL = resolveResourceURL(path: path)

        guard let resourceURL, FileManager.default.fileExists(atPath: resourceURL.path) else {
            let response = HTTPURLResponse(
                url: url,
                statusCode: 404,
                httpVersion: "HTTP/1.1",
                headerFields: nil
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
            return
        }

        do {
            let data = try Data(contentsOf: resourceURL)
            let mimeType = Self.mimeType(for: resourceURL.pathExtension)
            let response = HTTPURLResponse(
                url: url,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": mimeType]
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func resolveResourceURL(path: String) -> URL? {
        let absoluteURL = URL(fileURLWithPath: "/" + path)
        if FileManager.default.fileExists(atPath: absoluteURL.path) {
            return absoluteURL
        }

        if let baseURL, FileManager.default.fileExists(atPath: baseURL.appendingPathComponent(path).path) {
            return baseURL.appendingPathComponent(path)
        }

        var searchPaths: [URL] = []

        if let customPaths = resourceSearchPaths {
            searchPaths = customPaths.map { $0.appendingPathComponent(path) }
        } else {
            searchPaths = [
                Bundle.main.resourceURL?.appendingPathComponent("MarkdownReader_MarkdownReader.bundle").appendingPathComponent("Resources").appendingPathComponent(path),
                Bundle.main.resourceURL?.appendingPathComponent("Resources").appendingPathComponent(path),
                Bundle.main.resourceURL?.appendingPathComponent(path),
            ].compactMap { $0 }
        }

        for url in searchPaths {
            if FileManager.default.fileExists(atPath: url.path) {
                return url
            }
        }

        return nil
    }

    private static func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "css": return "text/css"
        case "js": return "application/javascript"
        case "html", "htm": return "text/html"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        case "json": return "application/json"
        default: return "application/octet-stream"
        }
    }
}
