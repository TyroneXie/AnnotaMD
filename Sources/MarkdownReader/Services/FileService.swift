import Foundation

/// 文件系统服务，负责目录扫描和文件读取
struct FileService: Sendable {

    /// 扫描指定目录，返回文件树结构
    /// - Parameter directory: 要扫描的目录 URL
    /// - Returns: 排序后的 FileNode 数组
    func scanDirectory(_ directory: URL) async throws -> [FileNode] {
        let contents = try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isDirectoryKey, .nameKey],
            options: [.skipsHiddenFiles, .skipsSubdirectoryDescendants]
        )

        var nodes: [FileNode] = []

        for url in contents {
            let resourceValues = try url.resourceValues(forKeys: [.isDirectoryKey, .nameKey])
            let isDirectory = resourceValues.isDirectory ?? false
            let name = resourceValues.name ?? url.lastPathComponent
            let isMarkdown = url.pathExtension == "md"

            if isDirectory {
                let children = try await scanDirectory(url)
                let node = FileNode(
                    name: name,
                    path: url,
                    isDirectory: true,
                    children: children
                )
                nodes.append(node)
            } else {
                let node = FileNode(
                    name: name,
                    path: url,
                    isDirectory: false,
                    isMarkdown: isMarkdown,
                    children: nil
                )
                nodes.append(node)
            }
        }

        // 排序：目录在前，文件在后；同类型按名称排序
        nodes.sort { a, b in
            if a.isDirectory != b.isDirectory {
                return a.isDirectory
            }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }

        return nodes
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

    /// 检查目录是否包含 Markdown 文件
    /// - Parameter directory: 要检查的目录
    /// - Returns: 是否包含 .md 文件
    func directoryContainsMarkdown(_ directory: URL) -> Bool {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return false
        }

        for case let url as URL in enumerator {
            if url.pathExtension == "md" {
                return true
            }
        }
        return false
    }
}
