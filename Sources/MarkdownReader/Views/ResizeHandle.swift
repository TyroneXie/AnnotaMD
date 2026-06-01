import SwiftUI

/// Sidebar 边缘拖拽分隔线
struct ResizeHandle: View {
    let appViewModel: AppViewModel

    @State private var dragOffset: CGFloat = 0

    var body: some View {
        // 1px 分隔线
        Rectangle()
            .fill(Color(nsColor: .separatorColor))
            .frame(width: 1)
            .overlay {
                // 8px 拖拽热区
                Rectangle()
                    .fill(.clear)
                    .frame(width: 8)
                    .contentShape(Rectangle())
                    .onHover { hovering in
                        if hovering {
                            NSCursor.resizeLeftRight.push()
                        } else {
                            NSCursor.pop()
                        }
                    }
                    .gesture(
                        DragGesture(minimumDistance: 1)
                            .onChanged { value in
                                let newWidth = appViewModel.sidebarWidth + value.translation.width - dragOffset
                                let clampedWidth = max(
                                    AppViewModel.minSidebarWidth,
                                    min(AppViewModel.maxSidebarWidth, newWidth)
                                )
                                appViewModel.updateSidebarWidth(clampedWidth)
                                dragOffset = value.translation.width
                            }
                            .onEnded { _ in
                                dragOffset = 0
                                appViewModel.handleDragEnded()
                            }
                    )
            }
    }
}
