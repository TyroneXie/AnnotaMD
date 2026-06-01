import Foundation

// MARK: - 主题定义

/// 主题定义，参照 buddy-macos 的 BuddyTheme 接口
/// 5 个基础色 + 对比度，通过 deriveTokens() 生成完整配色方案
struct ThemeDefinition: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let name: String
    let type: ThemeType
    let surface: String   // 背景色
    let ink: String       // 文字色
    let accent: String    // 强调色
    let success: String   // 成功色
    let danger: String    // 危险色
    let contrast: Int     // 对比度 0-100
}

/// 主题类型
enum ThemeType: String, Codable, Sendable, CaseIterable {
    case light
    case dark
}

// MARK: - 预设主题

/// 所有预设主题，逐字对照 buddy-macos docs/theme-scheme.md 第五节
enum PresetThemes {

    // MARK: - 深色主题（15 个）
    // 来源: buddy-macos docs/theme-scheme.md 5.1 节

    static let darkThemes: [ThemeDefinition] = [
        ThemeDefinition(id: "buddy-dark", name: "Buddy Dark", type: .dark,
                        surface: "#18181a", ink: "#e8e8e3", accent: "#339cff",
                        success: "#40c977", danger: "#fa423e", contrast: 60),
        ThemeDefinition(id: "codex-dark", name: "Codex Dark", type: .dark,
                        surface: "#111111", ink: "#ffffff", accent: "#0169cc",
                        success: "#40c977", danger: "#fa423e", contrast: 60),
        ThemeDefinition(id: "dracula", name: "Dracula", type: .dark,
                        surface: "#282a36", ink: "#f8f8f2", accent: "#ff79c6",
                        success: "#50fa7b", danger: "#ff5555", contrast: 60),
        ThemeDefinition(id: "catppuccin-mocha", name: "Catppuccin Mocha", type: .dark,
                        surface: "#1e1e2e", ink: "#cdd6f4", accent: "#cba6f7",
                        success: "#a6e3a1", danger: "#f38ba8", contrast: 58),
        ThemeDefinition(id: "catppuccin-macchiato", name: "Catppuccin Macchiato", type: .dark,
                        surface: "#181825", ink: "#cad3f8", accent: "#c7a4f5",
                        success: "#a6da95", danger: "#ed8796", contrast: 58),
        ThemeDefinition(id: "nord", name: "Nord", type: .dark,
                        surface: "#2e3440", ink: "#d8dee9", accent: "#88c0d0",
                        success: "#a3be8c", danger: "#bf616a", contrast: 55),
        ThemeDefinition(id: "one-dark-pro", name: "One Dark Pro", type: .dark,
                        surface: "#282c34", ink: "#abb2bf", accent: "#4d78cc",
                        success: "#98c379", danger: "#e06c75", contrast: 60),
        ThemeDefinition(id: "tokyo-night", name: "Tokyo Night", type: .dark,
                        surface: "#1a1b26", ink: "#a9b1d6", accent: "#7aa2f7",
                        success: "#9ece6a", danger: "#f7768e", contrast: 58),
        ThemeDefinition(id: "gruvbox-dark", name: "Gruvbox Dark", type: .dark,
                        surface: "#282828", ink: "#ebdbb2", accent: "#fe8019",
                        success: "#b8bb26", danger: "#fb4934", contrast: 55),
        ThemeDefinition(id: "kanagawa", name: "Kanagawa Wave", type: .dark,
                        surface: "#1f1f28", ink: "#dcd7ba", accent: "#658594",
                        success: "#76956a", danger: "#c34043", contrast: 55),
        ThemeDefinition(id: "rose-pine", name: "Rose Pine", type: .dark,
                        surface: "#191724", ink: "#e0def4", accent: "#ebbcba",
                        success: "#31748f", danger: "#eb6f92", contrast: 58),
        ThemeDefinition(id: "github-dark", name: "GitHub Dark", type: .dark,
                        surface: "#0d1117", ink: "#e6edf3", accent: "#1f6feb",
                        success: "#3fb950", danger: "#f85149", contrast: 50),
        ThemeDefinition(id: "material-palenight", name: "Material Palenight", type: .dark,
                        surface: "#292d3e", ink: "#eeffff", accent: "#80cbc4",
                        success: "#c3e88d", danger: "#ff5370", contrast: 58),
        ThemeDefinition(id: "ayu-dark", name: "Ayu Dark", type: .dark,
                        surface: "#0b0e14", ink: "#bfbdb6", accent: "#e6b450",
                        success: "#c2d94c", danger: "#f07178", contrast: 55),
        ThemeDefinition(id: "vitesse-dark", name: "Vitesse Dark", type: .dark,
                        surface: "#121212", ink: "#dbd7ca", accent: "#4d9375",
                        success: "#80a665", danger: "#cb7676", contrast: 55),
    ]

    // MARK: - 浅色主题（8 个）
    // 来源: buddy-macos docs/theme-scheme.md 5.2 节

    static let lightThemes: [ThemeDefinition] = [
        ThemeDefinition(id: "buddy-light", name: "Buddy Light", type: .light,
                        surface: "#f3f3f1", ink: "#1c1c1a", accent: "#339cff",
                        success: "#00a240", danger: "#ba2623", contrast: 45),
        ThemeDefinition(id: "codex-light", name: "Codex Light", type: .light,
                        surface: "#ffffff", ink: "#1a1c1f", accent: "#0169cc",
                        success: "#00a240", danger: "#ba2623", contrast: 45),
        ThemeDefinition(id: "catppuccin-latte", name: "Catppuccin Latte", type: .light,
                        surface: "#eff1f5", ink: "#4c4f69", accent: "#8839ef",
                        success: "#40a02b", danger: "#d20f39", contrast: 45),
        ThemeDefinition(id: "github-light", name: "GitHub Light", type: .light,
                        surface: "#ffffff", ink: "#1f2328", accent: "#0969da",
                        success: "#1a7f37", danger: "#cf222e", contrast: 42),
        ThemeDefinition(id: "gruvbox-light", name: "Gruvbox Light", type: .light,
                        surface: "#fbf1c7", ink: "#3c3836", accent: "#af3a03",
                        success: "#79740e", danger: "#9d0006", contrast: 45),
        ThemeDefinition(id: "kanagawa-lotus", name: "Kanagawa Lotus", type: .light,
                        surface: "#f2ecbc", ink: "#5c5144", accent: "#c47247",
                        success: "#6f894e", danger: "#c34043", contrast: 45),
        ThemeDefinition(id: "one-light", name: "One Light", type: .light,
                        surface: "#fafafa", ink: "#383a42", accent: "#526fff",
                        success: "#50a14f", danger: "#e45649", contrast: 45),
        ThemeDefinition(id: "rose-pine-dawn", name: "Rose Pine Dawn", type: .light,
                        surface: "#faf4ed", ink: "#575279", accent: "#d7827e",
                        success: "#286983", danger: "#b4637a", contrast: 42),
    ]

    // MARK: - 所有主题

    static let allThemes: [ThemeDefinition] = darkThemes + lightThemes

    // MARK: - 查找

    static func themeById(_ id: String) -> ThemeDefinition? {
        allThemes.first { $0.id == id }
    }

    static func themesByType(_ type: ThemeType) -> [ThemeDefinition] {
        switch type {
        case .dark: darkThemes
        case .light: lightThemes
        }
    }

    static func defaultTheme(for type: ThemeType) -> ThemeDefinition {
        switch type {
        case .dark: darkThemes[0]   // buddy-dark
        case .light: lightThemes[0] // buddy-light
        }
    }
}

// MARK: - 自定义颜色覆盖

/// 主题自定义颜色覆盖，参照 buddy-macos 的 custom 字段
/// 只覆盖用户手动修改的颜色，未覆盖的从基础主题继承
struct ThemeCustomOverrides: Codable, Equatable, Sendable {
    var surface: String?
    var ink: String?
    var accent: String?
    var success: String?
    var danger: String?
    var contrast: Int?

    var isCustomized: Bool {
        surface != nil || ink != nil || accent != nil || success != nil || danger != nil || contrast != nil
    }

    static let empty = ThemeCustomOverrides()
}

// MARK: - 解析后的主题

/// 将基础主题与自定义覆盖合并后的完整主题
func resolveTheme(base: ThemeDefinition, custom: ThemeCustomOverrides) -> ThemeDefinition {
    ThemeDefinition(
        id: base.id,
        name: base.name,
        type: base.type,
        surface: custom.surface ?? base.surface,
        ink: custom.ink ?? base.ink,
        accent: custom.accent ?? base.accent,
        success: custom.success ?? base.success,
        danger: custom.danger ?? base.danger,
        contrast: custom.contrast ?? base.contrast
    )
}
