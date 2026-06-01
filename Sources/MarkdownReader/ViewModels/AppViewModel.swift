import SwiftUI

/// 全局应用状态，管理窗口级别的状态
@MainActor
@Observable
final class AppViewModel {

    // MARK: - 目录状态

    /// 当前打开的根目录
    var rootDirectory: URL? {
        didSet { updateWindowTitle() }
    }

    /// 是否为单文件模式（直接打开单个文件，无目录树）
    var isSingleFileMode: Bool = false

    /// 单文件模式下打开的文件 URL
    var singleFileURL: URL?

    // MARK: - 选中状态

    /// 当前选中的文件节点
    var selectedFile: FileNode?

    // MARK: - Sidebar 状态

    /// Sidebar 是否可见
    var isSidebarVisible: Bool = true

    /// Sidebar 当前宽度
    var sidebarWidth: CGFloat = 240

    /// Sidebar 默认宽度
    static let defaultSidebarWidth: CGFloat = 240

    /// Sidebar 最小宽度
    static let minSidebarWidth: CGFloat = 150

    /// Sidebar 最大宽度
    static let maxSidebarWidth: CGFloat = 400

    /// Sidebar 自动隐藏阈值
    static let sidebarHideThreshold: CGFloat = 140

    // MARK: - 窗口标题

    /// 窗口标题
    var windowTitle: String = "Markdown Reader"

    // MARK: - 全屏状态

    /// 是否处于全屏模式
    var isFullScreen: Bool = false

    /// 红绿灯占位宽度
    var trafficLightWidth: CGFloat {
        isFullScreen ? 32 : 76
    }

    // MARK: - 方法

    /// 切换 Sidebar 显隐
    func toggleSidebar() {
        withAnimation(.spring(duration: 0.25)) {
            isSidebarVisible.toggle()
            if isSidebarVisible {
                sidebarWidth = Self.defaultSidebarWidth
            }
        }
    }

    /// 更新 Sidebar 宽度（拖拽时调用）
    func updateSidebarWidth(_ width: CGFloat) {
        sidebarWidth = width
    }

    /// 处理拖拽结束，判断是否隐藏 Sidebar
    func handleDragEnded() {
        if sidebarWidth < Self.sidebarHideThreshold {
            withAnimation(.spring(duration: 0.25)) {
                isSidebarVisible = false
                sidebarWidth = Self.defaultSidebarWidth
            }
        } else {
            // 限制宽度范围
            sidebarWidth = max(Self.minSidebarWidth, min(Self.maxSidebarWidth, sidebarWidth))
        }
    }

    /// 打开目录
    func openDirectory(_ url: URL) {
        rootDirectory = url
        isSingleFileMode = false
        singleFileURL = nil
        selectedFile = nil
        // 目录模式恢复 Sidebar
        if !isSidebarVisible {
            withAnimation(.spring(duration: 0.25)) {
                isSidebarVisible = true
                sidebarWidth = Self.defaultSidebarWidth
            }
        }
    }

    /// 打开单个文件（单文件模式，无 Sidebar）
    func openSingleFile(_ url: URL) {
        rootDirectory = nil
        isSingleFileMode = true
        singleFileURL = url
        selectedFile = nil
        // 单文件模式隐藏 Sidebar
        if isSidebarVisible {
            withAnimation(.spring(duration: 0.25)) {
                isSidebarVisible = false
            }
        }
    }

    // MARK: - 私有方法

    private func updateWindowTitle() {
        if isSingleFileMode, let url = singleFileURL {
            windowTitle = "Markdown Reader — \(url.lastPathComponent)"
        } else if let dir = rootDirectory {
            windowTitle = "Markdown Reader — \(dir.lastPathComponent)"
        } else {
            windowTitle = "Markdown Reader"
        }
    }
}
