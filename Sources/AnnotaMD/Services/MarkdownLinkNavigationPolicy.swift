import Foundation
import MarkdownReaderKit

/// Product policy for local Markdown link navigation.
///
/// `WebViewMarkdownView` only reports local `mr:///...` clicks. This policy
/// decides whether that local target can become an in-window AnnotaMD
/// navigation, and which directory tree root should be shown.
enum MarkdownLinkNavigationPolicy {
    enum TargetKind: Equatable {
        case markdownFile
        case directory
        case unsupportedFile
        case missing
    }

    struct Decision: Equatable {
        let targetURL: URL
        let targetKind: TargetKind
        let rootURL: URL?
        let requiresConfirmation: Bool

        var canNavigate: Bool {
            targetKind == .markdownFile || targetKind == .directory
        }
    }

    /// Only AnnotaMD's internal `mr:///absolute/path` URLs are eligible for
    /// in-window navigation. `file:///...`, absolute Markdown hrefs, and web
    /// URLs deliberately return nil so they do not silently change workspace.
    static func internalTargetURL(from url: URL) -> URL? {
        guard url.scheme?.lowercased() == "mr",
              url.host?.isEmpty != false,
              !url.path.isEmpty else {
            return nil
        }
        return URL(fileURLWithPath: url.path).markMarkCanonicalFileURL
    }

    static func decide(
        sourceFileURL: URL?,
        currentRootURL: URL?,
        targetURL: URL,
        fileManager: FileManager = .default
    ) -> Decision {
        let canonicalTarget = targetURL.markMarkCanonicalFileURL
        var isDirectory: ObjCBool = false

        guard fileManager.fileExists(atPath: canonicalTarget.path, isDirectory: &isDirectory) else {
            return Decision(
                targetURL: canonicalTarget,
                targetKind: .missing,
                rootURL: nil,
                requiresConfirmation: false
            )
        }

        let targetKind: TargetKind = {
            if isDirectory.boolValue {
                return .directory
            }
            return FileService.isKnownMarkdownExtension(canonicalTarget) ? .markdownFile : .unsupportedFile
        }()

        guard targetKind == .markdownFile || targetKind == .directory else {
            return Decision(
                targetURL: canonicalTarget,
                targetKind: targetKind,
                rootURL: nil,
                requiresConfirmation: false
            )
        }

        let targetDirectory = isDirectory.boolValue
            ? canonicalTarget
            : canonicalTarget.deletingLastPathComponent()

        if let currentRootURL {
            let root = currentRootURL.markMarkCanonicalFileURL
            if contains(canonicalTarget, inOrEqualTo: root) {
                return Decision(
                    targetURL: canonicalTarget,
                    targetKind: targetKind,
                    rootURL: root,
                    requiresConfirmation: false
                )
            }

            let sourceDirectory = sourceFileURL?.markMarkCanonicalFileURL.deletingLastPathComponent() ?? root
            let common = nearestCommonDirectory(sourceDirectory, targetDirectory)
            return Decision(
                targetURL: canonicalTarget,
                targetKind: targetKind,
                rootURL: cappedRoot(common, fallback: targetDirectory),
                requiresConfirmation: true
            )
        }

        let sourceDirectory = sourceFileURL?.markMarkCanonicalFileURL.deletingLastPathComponent() ?? targetDirectory
        let common = nearestCommonDirectory(sourceDirectory, targetDirectory)
        // 单文件模式（无 currentRoot）下默认静默打开目录树；但若公共祖先塌到文件系统根，
        // 退回目标所在目录并要求确认，避免把整盘当 workspace 加载。
        let collapsedToFilesystemRoot = isFilesystemRoot(common)
        return Decision(
            targetURL: canonicalTarget,
            targetKind: targetKind,
            rootURL: cappedRoot(common, fallback: targetDirectory),
            requiresConfirmation: collapsedToFilesystemRoot
        )
    }

    /// 文件系统根 `/` 永远不应成为侧边栏 root（会触发全盘加载）。
    static func isFilesystemRoot(_ url: URL) -> Bool {
        url.markMarkCanonicalFileURL.pathComponents == ["/"]
    }

    /// 把候选 root 封顶：塌到 `/` 时退回到目标所在目录这一有界范围。
    static func cappedRoot(_ candidate: URL, fallback: URL) -> URL {
        isFilesystemRoot(candidate) ? fallback : candidate
    }

    static func contains(_ child: URL, inOrEqualTo root: URL) -> Bool {
        let childComponents = child.markMarkCanonicalFileURL.pathComponents
        let rootComponents = root.markMarkCanonicalFileURL.pathComponents
        guard rootComponents.count <= childComponents.count else { return false }
        return zip(rootComponents, childComponents).allSatisfy { $0 == $1 }
    }

    static func nearestCommonDirectory(_ lhs: URL, _ rhs: URL) -> URL {
        let lhsComponents = lhs.markMarkCanonicalFileURL.pathComponents
        let rhsComponents = rhs.markMarkCanonicalFileURL.pathComponents
        let commonComponents = zip(lhsComponents, rhsComponents)
            .prefix { $0 == $1 }
            .map(\.0)

        guard !commonComponents.isEmpty else {
            return URL(fileURLWithPath: "/", isDirectory: true)
        }

        let path: String
        if commonComponents == ["/"] {
            path = "/"
        } else if commonComponents.first == "/" {
            path = "/" + commonComponents.dropFirst().joined(separator: "/")
        } else {
            path = commonComponents.joined(separator: "/")
        }

        return URL(fileURLWithPath: path, isDirectory: true).markMarkCanonicalFileURL
    }
}
