import SwiftUI

/// Sidebar 边缘拖拽分隔线
/// 使用 NSViewRepresentable 直接处理鼠标事件，避免 SwiftUI DragGesture 在 macOS 上不可靠的问题
struct ResizeHandle: View {
    let appViewModel: AppViewModel

    var body: some View {
        // 1px 可见分隔线
        Rectangle()
            .fill(Color(nsColor: .separatorColor))
            .frame(width: 1)
            .overlay {
                // 使用 NSView 处理拖拽，覆盖 8px 热区
                ResizeHandleView(appViewModel: appViewModel)
                    .frame(width: 8)
            }
    }
}

// MARK: - NSViewRepresentable 拖拽处理

/// 使用 AppKit NSView 直接处理鼠标事件，确保拖拽可靠工作
private struct ResizeHandleView: NSViewRepresentable {
    let appViewModel: AppViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(appViewModel: appViewModel)
    }

    func makeNSView(context: Context) -> ResizeHandleNSView {
        let view = ResizeHandleNSView()
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.clear.cgColor
        view.coordinator = context.coordinator
        return view
    }

    func updateNSView(_ nsView: ResizeHandleNSView, context: Context) {
        context.coordinator.appViewModel = appViewModel
    }
}

// MARK: - Coordinator

extension ResizeHandleView {
    final class Coordinator {
        var appViewModel: AppViewModel

        init(appViewModel: AppViewModel) {
            self.appViewModel = appViewModel
        }
    }
}

// MARK: - AppKit 拖拽视图

/// 直接处理鼠标事件的 NSView
/// 通过 mouseDown/mouseDragged/mouseUp 实现可靠拖拽
private final class ResizeHandleNSView: NSView {
    weak var coordinator: ResizeHandleView.Coordinator?

    private var isDragging = false
    private var lastMouseX: CGFloat = 0

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas {
            removeTrackingArea(area)
        }
        let options: NSTrackingArea.Options = [.cursorUpdate, .activeInActiveApp, .inVisibleRect]
        let area = NSTrackingArea(rect: bounds, options: options, owner: self, userInfo: nil)
        addTrackingArea(area)
    }

    override func cursorUpdate(with event: NSEvent) {
        NSCursor.resizeLeftRight.set()
    }

    override func mouseDown(with event: NSEvent) {
        isDragging = true
        lastMouseX = event.locationInWindow.x
    }

    override func mouseDragged(with event: NSEvent) {
        guard isDragging, let coordinator else { return }

        let currentX = event.locationInWindow.x
        let deltaX = currentX - lastMouseX
        lastMouseX = currentX

        let newWidth = coordinator.appViewModel.sidebarWidth + deltaX
        let clampedWidth = max(
            AppViewModel.minSidebarWidth,
            min(AppViewModel.maxSidebarWidth, newWidth)
        )
        coordinator.appViewModel.updateSidebarWidth(clampedWidth)
    }

    override func mouseUp(with event: NSEvent) {
        guard isDragging, let coordinator else { return }
        isDragging = false
        coordinator.appViewModel.handleDragEnded()
    }
}
