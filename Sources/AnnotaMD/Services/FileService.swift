import Foundation

/// 文件系统服务，负责目录扫描和文件读取
struct FileService: Sendable {

    /// 已知的 Markdown 文件扩展名。
    static let markdownExtensions: Set<String> = ["md", "markdown", "mdown", "mkd"]

    /// 需要在目录树中显示为可打开 Markdown 文件的扩展名。
    static let treeDisplayExtensions: Set<String> = markdownExtensions

    /// 判断文件扩展名是否为已知的 Markdown 类型。
    /// - Parameter url: 文件 URL
    /// - Returns: 是否为 Markdown 扩展名
    static func isKnownMarkdownExtension(_ url: URL) -> Bool {
        markdownExtensions.contains(url.pathExtension.lowercased())
    }

    /// 判断文件扩展名是否应在目录树中显示为 Markdown。
    /// - Parameter url: 文件 URL
    /// - Returns: 是否为 Markdown 扩展名
    static func isTreeDisplayExtension(_ url: URL) -> Bool {
        treeDisplayExtensions.contains(url.pathExtension.lowercased())
    }

    /// 文本嗅探读取的最大头部字节数。
    ///
    /// 只在用户实际打开非 Markdown 文件时读取，不参与目录树扫描热路径。
    private static let textProbeByteLimit = 16 * 1024

    /// 从文件头部判断是否像文本，并返回可用于完整读取的编码。
    ///
    /// 目标是提供轻量的“任意文本类文件只读查看”兜底：UTF-8/ASCII/UTF-16 文本允许打开，
    /// 包含大量控制字符或 NUL 字节的二进制文件拒绝打开。
    static func sniffTextEncoding(sample: Data) -> String.Encoding? {
        guard !sample.isEmpty else { return .utf8 }

        let bytes = [UInt8](sample)

        if bytes.starts(with: [0xEF, 0xBB, 0xBF]) {
            return .utf8
        }
        if bytes.starts(with: [0xFF, 0xFE]) {
            return .utf16
        }
        if bytes.starts(with: [0xFE, 0xFF]) {
            return .utf16
        }

        if looksLikeUTF16LittleEndian(bytes) {
            return .utf16LittleEndian
        }
        if looksLikeUTF16BigEndian(bytes) {
            return .utf16BigEndian
        }

        // 普通二进制文件通常很早出现 NUL；UTF-16 已在上面单独处理。
        if bytes.contains(0) {
            return nil
        }

        guard String(data: sample, encoding: .utf8) != nil else {
            return nil
        }

        let controlCount = bytes.filter { byte in
            switch byte {
            case 0x09, 0x0A, 0x0C, 0x0D: // tab / LF / FF / CR
                return false
            case 0x00..<0x20, 0x7F:
                return true
            default:
                return false
            }
        }.count
        return Double(controlCount) / Double(bytes.count) > 0.05 ? nil : .utf8
    }

    private static func looksLikeUTF16LittleEndian(_ bytes: [UInt8]) -> Bool {
        looksLikeUTF16(bytes, zeroIndex: 1)
    }

    private static func looksLikeUTF16BigEndian(_ bytes: [UInt8]) -> Bool {
        looksLikeUTF16(bytes, zeroIndex: 0)
    }

    private static func looksLikeUTF16(_ bytes: [UInt8], zeroIndex: Int) -> Bool {
        guard bytes.count >= 8 else { return false }

        let pairCount = min(bytes.count / 2, 64)
        guard pairCount >= 4 else { return false }

        var zeroMatches = 0
        var oppositeZeros = 0
        for pair in 0..<pairCount {
            let expectedZeroByte = bytes[pair * 2 + zeroIndex]
            let otherByte = bytes[pair * 2 + (1 - zeroIndex)]
            if expectedZeroByte == 0 { zeroMatches += 1 }
            if otherByte == 0 { oppositeZeros += 1 }
        }

        // ASCII 范围 UTF-16 文本通常每隔一个字节是 0；反向位置不应也大量为 0。
        return Double(zeroMatches) / Double(pairCount) > 0.6
            && Double(oppositeZeros) / Double(pairCount) < 0.2
    }

    /// 扫描指定目录的一层内容，返回文件树节点。
    ///
    /// 这是侧边栏目录树的热路径：只读目录项和扩展名，不递归、不读取文件内容。
    /// - Parameters:
    ///   - directory: 要扫描的目录 URL
    ///   - showHiddenFiles: 是否显示隐藏文件
    ///   - showNonMarkdownFiles: 是否显示非 Markdown 文件
    /// - Returns: 排序后的 FileNode 数组
    func scanDirectoryLevel(
        _ directory: URL,
        showHiddenFiles: Bool = false,
        showNonMarkdownFiles: Bool = true
    ) async throws -> [FileNode] {
        var options: FileManager.DirectoryEnumerationOptions = []
        if !showHiddenFiles {
            options.insert(.skipsHiddenFiles)
        }

        let contents = try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isDirectoryKey, .nameKey],
            options: options
        )

        var nodes: [FileNode] = []

        for url in contents {
            let resourceValues = try url.resourceValues(forKeys: [.isDirectoryKey, .nameKey])
            let isDirectory = resourceValues.isDirectory ?? false
            let name = resourceValues.name ?? url.lastPathComponent

            if isDirectory {
                nodes.append(FileNode(
                    name: name,
                    path: url,
                    isDirectory: true,
                    childrenState: .notLoaded
                ))
            } else {
                let isTreeMarkdown = Self.isTreeDisplayExtension(url)
                if !showNonMarkdownFiles && !isTreeMarkdown { continue }
                nodes.append(FileNode(
                    name: name,
                    path: url,
                    isDirectory: false,
                    isMarkdown: isTreeMarkdown
                ))
            }
        }

        return sortNodes(nodes)
    }

    /// 扫描指定目录，返回完整递归文件树结构。
    ///
    /// 兼容旧调用方；侧边栏首屏和展开不应走这个方法。
    /// - Parameters:
    ///   - directory: 要扫描的目录 URL
    ///   - showHiddenFiles: 是否显示隐藏文件
    ///   - showNonMarkdownFiles: 是否显示非 Markdown 文件
    /// - Returns: 排序后的 FileNode 数组
    func scanDirectory(
        _ directory: URL,
        showHiddenFiles: Bool = false,
        showNonMarkdownFiles: Bool = true
    ) async throws -> [FileNode] {
        var nodes = try await scanDirectoryLevel(
            directory,
            showHiddenFiles: showHiddenFiles,
            showNonMarkdownFiles: showNonMarkdownFiles
        )

        for index in nodes.indices where nodes[index].isDirectory {
            do {
                let children = try await scanDirectory(
                    nodes[index].path,
                    showHiddenFiles: showHiddenFiles,
                    showNonMarkdownFiles: showNonMarkdownFiles
                )
                nodes[index].childrenState = .loaded(children)
            } catch {
                nodes[index].childrenState = .failed(error.localizedDescription)
            }
        }

        return nodes
    }

    private func sortNodes(_ nodes: [FileNode]) -> [FileNode] {
        var sorted = nodes
        sorted.sort { a, b in
            if a.isDirectory != b.isDirectory {
                return a.isDirectory
            }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
        return sorted
    }

    /// 读取文件内容
    /// - Parameter url: 文件 URL
    /// - Returns: 文件内容字符串
    func readFile(at url: URL) async throws -> String {
        do {
            // 检查文件是否可读
            if FileManager.default.isReadableFile(atPath: url.path) == false {
                throw FileError.permissionDenied(url)
            }
            let content = try String(contentsOf: url, encoding: .utf8)
            return content
        } catch let error as FileError {
            throw error
        } catch {
            // 尝试用其他编码读取
            if let content = try? String(contentsOf: url, encoding: .ascii) {
                return content
            }
            throw FileError.encodingError(url)
        }
    }

    /// 如果文件头部像文本，则读取完整文本；如果像二进制，返回 nil。
    ///
    /// 该方法用于非 Markdown 文件的只读文本兜底打开。目录树扫描不调用它，避免展开目录时读文件内容。
    /// - Parameter url: 文件 URL
    /// - Returns: 文本内容；非文本文件返回 nil
    func readTextFileIfLikelyText(at url: URL) async throws -> String? {
        if FileManager.default.isReadableFile(atPath: url.path) == false {
            throw FileError.permissionDenied(url)
        }

        let handle: FileHandle
        do {
            handle = try FileHandle(forReadingFrom: url)
        } catch {
            throw FileError.permissionDenied(url)
        }
        defer {
            try? handle.close()
        }

        let sample = try handle.read(upToCount: Self.textProbeByteLimit) ?? Data()
        guard let encoding = Self.sniffTextEncoding(sample: sample) else {
            return nil
        }

        let data = try Data(contentsOf: url)
        if let text = String(data: data, encoding: encoding) {
            return text
        }
        if encoding != .utf8, let text = String(data: data, encoding: .utf8) {
            return text
        }
        throw FileError.encodingError(url)
    }

    /// 写入文件内容
    /// - Parameters:
    ///   - url: 文件 URL
    ///   - content: 要写入的内容
    func writeFile(at url: URL, content: String) async throws {
        do {
            try content.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            throw FileError.permissionDenied(url)
        }
    }

    /// 检查目录是否包含 Markdown 文件
    /// - Parameters:
    ///   - directory: 要检查的目录
    ///   - showHiddenFiles: 是否检查隐藏文件
    /// - Returns: 是否包含 .md 文件
    func directoryContainsMarkdown(_ directory: URL, showHiddenFiles: Bool = false) -> Bool {
        var options: FileManager.DirectoryEnumerationOptions = []
        if !showHiddenFiles {
            options.insert(.skipsHiddenFiles)
        }

        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: options
        ) else {
            return false
        }

        for case let url as URL in enumerator {
            if Self.isKnownMarkdownExtension(url) {
                return true
            }
        }
        return false
    }

    /// 检查目录是否包含 AnnotaMD 主窗口可打开的 Markdown 文件。
    /// 保留旧方法名以兼容调用方；非 Markdown 预览已撤销。
    func directoryContainsPreviewableFile(_ directory: URL, showHiddenFiles: Bool = false) -> Bool {
        directoryContainsMarkdown(directory, showHiddenFiles: showHiddenFiles)
    }

    /// 重命名文件或目录
    /// - Parameters:
    ///   - url: 原始 URL
    ///   - newName: 新名称（仅文件名，不含路径）
    /// - Returns: 重命名后的新 URL
    func renameItem(at url: URL, to newName: String) throws -> URL {
        let newURL = url.deletingLastPathComponent().appendingPathComponent(newName)
        try FileManager.default.moveItem(at: url, to: newURL)
        return newURL
    }

    /// 将文件或目录移到废纸篓
    /// - Parameter url: 要删除的文件/目录 URL
    func trashItem(at url: URL) throws {
        try FileManager.default.trashItem(at: url, resultingItemURL: nil)
    }

    /// 创建子目录
    /// - Parameters:
    ///   - parentDirectory: 父目录 URL
    ///   - name: 子目录名称
    /// - Returns: 新建目录的 URL
    @discardableResult
    func createDirectory(in parentDirectory: URL, name: String) throws -> URL {
        let newURL = parentDirectory.appendingPathComponent(name)
        try FileManager.default.createDirectory(at: newURL, withIntermediateDirectories: false)
        return newURL
    }

    /// 移动文件或目录到目标目录
    /// - Parameters:
    ///   - source: 源 URL
    ///   - destination: 目标目录 URL
    /// - Returns: 移动后的新 URL
    func moveItem(at source: URL, to destination: URL) throws -> URL {
        let newURL = destination.appendingPathComponent(source.lastPathComponent)
        try FileManager.default.moveItem(at: source, to: newURL)
        return newURL
    }
}
