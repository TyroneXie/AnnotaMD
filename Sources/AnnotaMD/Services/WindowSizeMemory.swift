import AppKit

@MainActor
enum WindowSizeMemory {
    static func launchContentRect(settings: SettingsModel = .shared) -> NSRect {
        let size = settings.launchWindowSize
        return NSRect(x: 0, y: 0, width: size.width, height: size.height)
    }

    static func currentContentSize(for window: NSWindow) -> CGSize {
        if let contentView = window.contentView {
            let size = contentView.bounds.size
            if size.width > 1, size.height > 1 {
                return CGSize(width: size.width, height: size.height)
            }
        }

        let contentRect = window.contentRect(forFrameRect: window.frame)
        return CGSize(width: contentRect.width, height: contentRect.height)
    }

    @discardableResult
    static func applyRememberedSize(to window: NSWindow, settings: SettingsModel = .shared) -> Bool {
        guard settings.rememberWindowSize else { return false }
        return applyContentSize(settings.rememberedWindowSize, to: window)
    }

    @discardableResult
    private static func applyContentSize(_ size: CGSize, to window: NSWindow) -> Bool {
        guard size.width > 1, size.height > 1 else { return false }

        let currentFrame = window.frame
        var contentRect = window.contentRect(forFrameRect: currentFrame)
        contentRect.size = NSSize(width: size.width, height: size.height)

        var targetFrame = window.frameRect(forContentRect: contentRect)
        targetFrame.origin.x = currentFrame.origin.x
        targetFrame.origin.y = currentFrame.maxY - targetFrame.height

        if let visibleFrame = (window.screen ?? NSScreen.main)?.visibleFrame {
            targetFrame = constrained(targetFrame, to: visibleFrame)
        }

        guard abs(currentFrame.width - targetFrame.width) > 1
            || abs(currentFrame.height - targetFrame.height) > 1 else {
            return false
        }

        window.setFrame(targetFrame, display: true)
        return true
    }

    private static func constrained(_ frame: NSRect, to visibleFrame: NSRect) -> NSRect {
        var result = frame
        result.size.width = min(result.size.width, visibleFrame.width)
        result.size.height = min(result.size.height, visibleFrame.height)

        if result.maxX > visibleFrame.maxX {
            result.origin.x = visibleFrame.maxX - result.width
        }
        if result.minX < visibleFrame.minX {
            result.origin.x = visibleFrame.minX
        }
        if result.maxY > visibleFrame.maxY {
            result.origin.y = visibleFrame.maxY - result.height
        }
        if result.minY < visibleFrame.minY {
            result.origin.y = visibleFrame.minY
        }

        return result
    }
}
