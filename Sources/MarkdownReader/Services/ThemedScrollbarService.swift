import SwiftUI

// MARK: - 主题化滚动条修饰器

/// 为 ScrollView / List 提供主题色滚动条
/// 隐藏原生滚动指示器，使用自定义 NSView 绘制带主题色的滚动条
///
/// 安装策略：不在 .overlay()/.background() 中查找 NSScrollView（不可靠），
/// 而是在 onAppear 时从 window 的 contentView 向下搜索 NSScrollView。
/// onChange(of: themeColors) 时更新所有 overlay 的颜色。
struct ThemedScrollbarModifier: ViewModifier {
    @Environment(\.themeColors) private var themeColors

    func body(content: Content) -> some View {
        content
            .scrollIndicators(.never)
            .onAppear {
                ThemedScrollbarHelper.installAll(
                    knobColor: NSColor(themeColors.scrollbarKnob),
                    trackColor: NSColor(themeColors.scrollbarTrack)
                )
            }
            .onChange(of: themeColors) { _, newColors in
                let knob = NSColor(newColors.scrollbarKnob)
                let track = NSColor(newColors.scrollbarTrack)
                // 同时安装（处理新出现的 NSScrollView）和更新颜色
                ThemedScrollbarHelper.installAll(knobColor: knob, trackColor: track)
                ThemedScrollbarHelper.updateAllColors(knobColor: knob, trackColor: track)
            }
    }
}

// MARK: - 滚动条安装辅助

/// 在 window 的视图层级中搜索 NSScrollView 并安装/更新主题化滚动条
enum ThemedScrollbarHelper {
    /// 在当前窗口的所有未安装 overlay 的 NSScrollView 上安装主题化滚动条
    static func installAll(knobColor: NSColor, trackColor: NSColor) {
        let windows = NSApp.windows.filter { $0.isVisible }
        guard let window = NSApp.keyWindow ?? windows.first,
              let contentView = window.contentView else {
            // 窗口可能尚未创建，安排重试
            scheduleRetry(knobColor: knobColor, trackColor: trackColor)
            return
        }
        // 安装成功，重置重试计数
        retryCountStorage = 0
        var foundCount = 0
        var installedCount = 0
        countAndInstall(contentView, knobColor: knobColor, trackColor: trackColor, found: &foundCount, installed: &installedCount)
    }

    /// 延迟重试安装（窗口可能尚未创建）
    private static var retryCount: Int { retryCountStorage }
    private nonisolated(unsafe) static var retryCountStorage = 0
    private static func scheduleRetry(knobColor: NSColor, trackColor: NSColor) {
        retryCountStorage += 1
        guard retryCountStorage <= 15 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            installAll(knobColor: knobColor, trackColor: trackColor)
        }
    }

    /// 更新当前窗口所有 ThemedScrollbarOverlayView 的颜色
    static func updateAllColors(knobColor: NSColor, trackColor: NSColor) {
        guard let window = NSApp.keyWindow ?? NSApp.windows.first(where: { $0.isVisible }),
              let contentView = window.contentView else { return }
        updateColorsInViews(contentView, knobColor: knobColor, trackColor: trackColor)
    }

    /// 递归搜索 NSScrollView 并安装 overlay
    /// 跳过太小的 NSScrollView（如查找栏、弹出菜单等内部滚动视图）
    private static func countAndInstall(_ view: NSView, knobColor: NSColor, trackColor: NSColor, found: inout Int, installed: inout Int) {
        for subview in view.subviews {
            if let scrollView = subview as? NSScrollView {
                let size = scrollView.frame.size
                if size.width >= 50 && size.height >= 50 {
                    found += 1
                    let alreadyInstalled = scrollView.subviews.contains { $0 is ThemedScrollbarOverlayView }
                    if !alreadyInstalled {
                        scrollView.scrollerStyle = .overlay
                        let overlay = ThemedScrollbarOverlayView(knobColor: knobColor, trackColor: trackColor)
                        overlay.frame = scrollView.bounds
                        overlay.autoresizingMask = [.width, .height]
                        scrollView.addSubview(overlay)
                        installed += 1
                    }
                }
            }
            countAndInstall(subview, knobColor: knobColor, trackColor: trackColor, found: &found, installed: &installed)
        }
    }

    /// 递归搜索并更新所有 ThemedScrollbarOverlayView 的颜色
    private static func updateColorsInViews(_ view: NSView, knobColor: NSColor, trackColor: NSColor) {
        for subview in view.subviews {
            if let overlay = subview as? ThemedScrollbarOverlayView {
                overlay.knobColor = knobColor
                overlay.trackColor = trackColor
            }
            updateColorsInViews(subview, knobColor: knobColor, trackColor: trackColor)
        }
    }
}

// MARK: - 主题化滚动条覆盖层

/// 绘制在 NSScrollView 上的自定义滚动条
/// - 自动隐藏：滚动后 1.5 秒淡出；鼠标悬停时显示
/// - 初始显示：安装后短暂显示再淡出，模拟原生行为
/// - 交互：支持拖拽滑块、点击轨道跳转
/// - 颜色：使用主题令牌 scrollbarKnob / scrollbarTrack
final class ThemedScrollbarOverlayView: NSView {
    var knobColor: NSColor {
        didSet { needsDisplay = true }
    }

    var trackColor: NSColor {
        didSet { needsDisplay = true }
    }

    private weak var scrollView: NSScrollView?
    private var observation: NSKeyValueObservation?
    private var hideTimer: Timer?
    private var isDragging = false
    private var dragStartY: CGFloat = 0
    private var dragStartOffset: CGFloat = 0
    private var isHovering = false

    private let scrollbarWidth: CGFloat = 6
    private let scrollbarMargin: CGFloat = 3
    private let minKnobHeight: CGFloat = 30
    private let hideDelay: TimeInterval = 1.5

    init(knobColor: NSColor, trackColor: NSColor) {
        self.knobColor = knobColor
        self.trackColor = trackColor
        super.init(frame: .zero)
        wantsLayer = true
        alphaValue = 0
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        if let scrollView = superview as? NSScrollView {
            self.scrollView = scrollView
            setupObservation()

            // 初始显示：模拟原生 overlay 滚动条行为
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                guard let self, self.scrollView != nil else { return }
                if self.needsScrollbar {
                    self.show()
                    self.needsDisplay = true
                    self.scheduleHide()
                }
            }
        }
    }

    private func setupObservation() {
        guard let scrollView else { return }
        observation = scrollView.contentView.observe(\.bounds, options: .new) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.handleScroll()
            }
        }
    }

    // MARK: - 显示/隐藏

    private func handleScroll() {
        show()
        needsDisplay = true
        scheduleHide()
    }

    private func show() {
        layer?.removeAllAnimations()
        alphaValue = 1
    }

    private func hide() {
        guard !isDragging, !isHovering else { return }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.3
            self.animator().alphaValue = 0
        }
    }

    private func scheduleHide() {
        hideTimer?.invalidate()
        hideTimer = Timer.scheduledTimer(withTimeInterval: hideDelay, repeats: false) { [weak self] _ in
            self?.hide()
        }
    }

    // MARK: - 绘制

    override func draw(_ dirtyRect: NSRect) {
        guard let scrollView, let documentView = scrollView.documentView else { return }

        let contentHeight = documentView.frame.height
        let visibleHeight = scrollView.visibleRect.height

        guard contentHeight > visibleHeight else { return }

        let bounds = self.bounds
        let trackRect = NSRect(
            x: bounds.width - scrollbarWidth - scrollbarMargin,
            y: 0,
            width: scrollbarWidth,
            height: bounds.height
        )

        // 绘制轨道
        trackColor.setFill()
        NSBezierPath(roundedRect: trackRect, xRadius: scrollbarWidth / 2, yRadius: scrollbarWidth / 2).fill()

        // 计算滑块位置
        let contentOffset = scrollView.contentView.bounds.origin.y
        let maxOffset = contentHeight - visibleHeight
        let scrollFraction = maxOffset > 0 ? contentOffset / maxOffset : 0
        let knobHeight = max(minKnobHeight, bounds.height * (visibleHeight / contentHeight))
        let knobTravel = bounds.height - knobHeight
        let knobMinY = bounds.height - knobHeight - scrollFraction * knobTravel

        let knobRect = NSRect(
            x: bounds.width - scrollbarWidth - scrollbarMargin,
            y: knobMinY,
            width: scrollbarWidth,
            height: knobHeight
        )

        // 绘制滑块
        knobColor.setFill()
        NSBezierPath(roundedRect: knobRect, xRadius: scrollbarWidth / 2, yRadius: scrollbarWidth / 2).fill()
    }

    // MARK: - 滑块位置计算

    private var currentKnobRect: NSRect? {
        guard let scrollView, let documentView = scrollView.documentView else { return nil }
        let contentHeight = documentView.frame.height
        let visibleHeight = scrollView.visibleRect.height
        guard contentHeight > visibleHeight else { return nil }

        let bounds = self.bounds
        let contentOffset = scrollView.contentView.bounds.origin.y
        let maxOffset = contentHeight - visibleHeight
        let scrollFraction = maxOffset > 0 ? contentOffset / maxOffset : 0
        let knobHeight = max(minKnobHeight, bounds.height * (visibleHeight / contentHeight))
        let knobTravel = bounds.height - knobHeight
        let knobMinY = bounds.height - knobHeight - scrollFraction * knobTravel

        return NSRect(
            x: bounds.width - scrollbarWidth - scrollbarMargin,
            y: knobMinY,
            width: scrollbarWidth,
            height: knobHeight
        )
    }

    // MARK: - 鼠标交互

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard needsScrollbar else { return nil }
        let bounds = self.bounds
        let hitArea = NSRect(
            x: bounds.width - scrollbarWidth - scrollbarMargin - 4,
            y: 0,
            width: scrollbarWidth + scrollbarMargin + 8,
            height: bounds.height
        )
        return hitArea.contains(point) ? self : nil
    }

    private var needsScrollbar: Bool {
        guard let scrollView, let documentView = scrollView.documentView else { return false }
        return documentView.frame.height > scrollView.visibleRect.height
    }

    override func mouseDown(with event: NSEvent) {
        let location = convert(event.locationInWindow, from: nil)

        if let knobRect = currentKnobRect, knobRect.insetBy(dx: -4, dy: 0).contains(location) {
            isDragging = true
            dragStartY = location.y
            dragStartOffset = scrollView?.contentView.bounds.origin.y ?? 0
            show()
        } else {
            guard let scrollView, let documentView = scrollView.documentView else { return }
            let contentHeight = documentView.frame.height
            let visibleHeight = scrollView.visibleRect.height
            let clickFraction = 1.0 - (location.y / bounds.height)
            let targetOffset = clickFraction * (contentHeight - visibleHeight)
            scrollView.contentView.setBoundsOrigin(NSPoint(x: 0, y: max(0, targetOffset)))
        }
    }

    override func mouseDragged(with event: NSEvent) {
        guard isDragging, let scrollView, let documentView = scrollView.documentView else { return }
        let location = convert(event.locationInWindow, from: nil)
        let deltaY = dragStartY - location.y
        let contentHeight = documentView.frame.height
        let visibleHeight = scrollView.visibleRect.height
        let maxOffset = contentHeight - visibleHeight

        let knobHeight = max(minKnobHeight, bounds.height * (visibleHeight / contentHeight))
        let knobTravel = bounds.height - knobHeight
        let offsetPerPoint = maxOffset / max(1, knobTravel)

        let newOffset = dragStartOffset + deltaY * offsetPerPoint
        let clampedOffset = max(0, min(newOffset, maxOffset))
        scrollView.contentView.setBoundsOrigin(
            NSPoint(x: scrollView.contentView.bounds.origin.x, y: clampedOffset)
        )
    }

    override func mouseUp(with event: NSEvent) {
        isDragging = false
        scheduleHide()
    }

    // MARK: - 悬停检测

    override func mouseEntered(with event: NSEvent) {
        isHovering = true
        show()
    }

    override func mouseExited(with event: NSEvent) {
        isHovering = false
        if !isDragging {
            scheduleHide()
        }
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }

        guard needsScrollbar else { return }

        let bounds = self.bounds
        let hoverArea = NSRect(
            x: bounds.width - scrollbarWidth - scrollbarMargin - 6,
            y: 0,
            width: scrollbarWidth + scrollbarMargin + 10,
            height: bounds.height
        )

        let trackingArea = NSTrackingArea(
            rect: hoverArea,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
    }
}
