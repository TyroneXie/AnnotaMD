import SwiftUI

// MARK: - 设置窗口主视图

/// 设置窗口，左侧 Sidebar 显示菜单（通用/外观），右侧显示对应设置内容
/// 参照 buddy-macos SettingsContent 的布局
struct SettingsView: View {
    @State private var settings = SettingsModel.shared
    @State private var selectedTab: SettingsTab = .general

    private var currentLanguage: Language {
        settings.languagePref.resolvedLanguage
    }

    var body: some View {
        HStack(spacing: 0) {
            // 左侧菜单
            settingsSidebar

            // 分隔线
            Divider()

            // 右侧内容
            settingsContent
        }
        .frame(width: 720, height: 520)
    }

    // MARK: - 左侧菜单

    private var settingsSidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 标题
            Text(L10n.tr(.settingsTabGeneral, language: currentLanguage))
                .font(.headline)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 12)

            // 菜单项
            SettingsMenuItem(
                title: L10n.tr(.settingsTabGeneral, language: currentLanguage),
                icon: "gearshape",
                isSelected: selectedTab == .general
            ) {
                selectedTab = .general
            }

            SettingsMenuItem(
                title: L10n.tr(.settingsTabAppearance, language: currentLanguage),
                icon: "paintbrush",
                isSelected: selectedTab == .appearance
            ) {
                selectedTab = .appearance
            }

            Spacer()
        }
        .frame(width: 170)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    // MARK: - 右侧内容

    @ViewBuilder
    private var settingsContent: some View {
        ScrollView {
            switch selectedTab {
            case .general:
                GeneralSettingsView(settings: settings, language: currentLanguage)
            case .appearance:
                AppearanceSettingsView(settings: settings, language: currentLanguage)
            }
        }
        .scrollContentBackground(.hidden)
    }
}

// MARK: - 菜单项视图

private struct SettingsMenuItem: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .frame(width: 18)
                Text(title)
                    .font(.system(size: 13))
            }
            .foregroundStyle(isSelected ? .primary : .secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.accentColor.opacity(0.12) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .padding(.vertical, 2)
    }
}

// MARK: - Settings Tab 枚举

private enum SettingsTab {
    case general
    case appearance
}

// MARK: - 通用设置视图

private struct GeneralSettingsView: View {
    @Bindable var settings: SettingsModel
    let language: Language

    private var detectedLanguageName: String {
        LanguageService.detectLanguage().localizedName(language)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 界面语言
            SettingsSection(
                title: L10n.tr(.settingsGeneralLanguageTitle, language: language),
                description: L10n.tr(.settingsGeneralLanguageDesc, language: language)
            ) {
                Picker("", selection: $settings.languagePref) {
                    ForEach(LanguagePref.allCases) { pref in
                        if pref == .auto {
                            Text("\(L10n.tr(.languageAuto, language: language)) (\(detectedLanguageName))")
                                .tag(pref)
                        } else {
                            Text(L10n.tr(LanguagePref.languageKey(for: pref), language: language))
                                .tag(pref)
                        }
                    }
                }
                .pickerStyle(.menu)
                .frame(width: 200, alignment: .leading)
            }

            SettingsDivider()

            // 默认显示模式
            SettingsSection(
                title: L10n.tr(.settingsGeneralDisplayMode, language: language)
            ) {
                Picker("", selection: $settings.defaultDisplayMode) {
                    Text(L10n.tr(.displayModeRendered, language: language)).tag(DisplayMode.rendered)
                    Text(L10n.tr(.displayModeSource, language: language)).tag(DisplayMode.source)
                }
                .pickerStyle(.segmented)
                .frame(width: 200)
            }

            SettingsDivider()

            // 启动行为
            SettingsSection(
                title: L10n.tr(.settingsGeneralStartupTitle, language: language)
            ) {
                Toggle(L10n.tr(.settingsGeneralReopenLastLocation, language: language), isOn: $settings.reopenLastLocation)
            }

            SettingsDivider()

            // 文件树过滤
            SettingsSection(
                title: L10n.tr(.settingsGeneralFileTreeTitle, language: language)
            ) {
                Toggle(L10n.tr(.settingsGeneralShowHiddenFiles, language: language), isOn: $settings.showHiddenFiles)
                Toggle(L10n.tr(.settingsGeneralShowNonMarkdownFiles, language: language), isOn: $settings.showNonMarkdownFiles)
            }
        }
        .padding(24)
    }
}

// MARK: - 外观设置视图

/// 参照 buddy-macos AppearanceSettings，包含主题模式、配色方案、自定义颜色、对比度
private struct AppearanceSettingsView: View {
    @Bindable var settings: SettingsModel
    let language: Language

    /// 当前可用配色方案列表（根据解析后的主题类型动态变化）
    private var availableSchemes: [ThemeDefinition] {
        PresetThemes.themesByType(settings.resolvedThemeType)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 主题模式
            themeModeSection

            SettingsDivider()

            // 配色方案
            colorSchemeSection

            SettingsDivider()

            // 自定义颜色
            customColorsSection

            SettingsDivider()

            // 对比度
            contrastSection

            SettingsDivider()

            // 字体排版
            typographySection
        }
        .padding(24)
    }

    // MARK: - 主题模式

    private var themeModeSection: some View {
        SettingsSection(
            title: L10n.tr(.settingsAppearanceThemeTitle, language: language),
            description: L10n.tr(.settingsAppearanceThemeDesc, language: language)
        ) {
            HStack(spacing: 12) {
                ThemeModeCard(
                    mode: .light,
                    icon: "sun.max",
                    title: L10n.tr(.settingsAppearanceModeLight, language: language),
                    description: L10n.tr(.settingsAppearanceModeLightDesc, language: language),
                    isSelected: settings.appearanceMode == .light,
                    language: language
                ) { settings.appearanceMode = .light }

                ThemeModeCard(
                    mode: .dark,
                    icon: "moon",
                    title: L10n.tr(.settingsAppearanceModeDark, language: language),
                    description: L10n.tr(.settingsAppearanceModeDarkDesc, language: language),
                    isSelected: settings.appearanceMode == .dark,
                    language: language
                ) { settings.appearanceMode = .dark }

                ThemeModeCard(
                    mode: .system,
                    icon: "desktopcomputer",
                    title: L10n.tr(.settingsAppearanceModeSystem, language: language),
                    description: L10n.tr(.settingsAppearanceModeSystemDesc, language: language),
                    isSelected: settings.appearanceMode == .system,
                    language: language
                ) { settings.appearanceMode = .system }
            }
        }
        .onChange(of: settings.appearanceMode) { _, newValue in
            applyAppearance(newValue)
        }
    }

    // MARK: - 配色方案

    private var colorSchemeSection: some View {
        SettingsSection(
            title: L10n.tr(.settingsAppearanceSchemeTitle, language: language),
            description: L10n.tr(.settingsAppearanceSchemeDesc, language: language)
        ) {
            LazyVGrid(columns: [
                GridItem(.adaptive(minimum: 70, maximum: 90), spacing: 8)
            ], spacing: 8) {
                ForEach(availableSchemes) { theme in
                    ColorSchemeCard(
                        theme: theme,
                        isSelected: settings.currentBaseTheme.id == theme.id,
                        language: language
                    ) {
                        selectScheme(theme)
                    }
                }
            }
        }
    }

    // MARK: - 自定义颜色

    private var customColorsSection: some View {
        SettingsSection(
            title: L10n.tr(.settingsAppearanceCustomTitle, language: language),
            description: L10n.tr(.settingsAppearanceCustomDesc, language: language)
        ) {
            VStack(spacing: 8) {
                ColorBarRow(
                    label: L10n.tr(.settingsAppearanceCustomSurface, language: language),
                    hexValue: settings.resolvedTheme.surface,
                    isCustom: settings.themeCustomOverrides.surface != nil,
                    onColorChange: { hex in settings.themeCustomOverrides.surface = hex },
                    onReset: { settings.themeCustomOverrides.surface = nil }
                )
                ColorBarRow(
                    label: L10n.tr(.settingsAppearanceCustomInk, language: language),
                    hexValue: settings.resolvedTheme.ink,
                    isCustom: settings.themeCustomOverrides.ink != nil,
                    onColorChange: { hex in settings.themeCustomOverrides.ink = hex },
                    onReset: { settings.themeCustomOverrides.ink = nil }
                )
                ColorBarRow(
                    label: L10n.tr(.settingsAppearanceCustomAccent, language: language),
                    hexValue: settings.resolvedTheme.accent,
                    isCustom: settings.themeCustomOverrides.accent != nil,
                    onColorChange: { hex in settings.themeCustomOverrides.accent = hex },
                    onReset: { settings.themeCustomOverrides.accent = nil }
                )
                ColorBarRow(
                    label: L10n.tr(.settingsAppearanceCustomSuccess, language: language),
                    hexValue: settings.resolvedTheme.success,
                    isCustom: settings.themeCustomOverrides.success != nil,
                    onColorChange: { hex in settings.themeCustomOverrides.success = hex },
                    onReset: { settings.themeCustomOverrides.success = nil }
                )
                ColorBarRow(
                    label: L10n.tr(.settingsAppearanceCustomDanger, language: language),
                    hexValue: settings.resolvedTheme.danger,
                    isCustom: settings.themeCustomOverrides.danger != nil,
                    onColorChange: { hex in settings.themeCustomOverrides.danger = hex },
                    onReset: { settings.themeCustomOverrides.danger = nil }
                )
            }
        }
    }

    // MARK: - 对比度

    private var contrastSection: some View {
        let currentContrast = settings.resolvedTheme.contrast
        return SettingsSection(
            title: L10n.tr(.settingsAppearanceContrastTitle, language: language),
            description: L10n.tr(.settingsAppearanceContrastDesc, language: language)
        ) {
            VStack(spacing: 6) {
                Slider(
                    value: Binding(
                        get: { Double(currentContrast) },
                        set: { settings.themeCustomOverrides.contrast = Int($0) }
                    ),
                    in: 0...100
                )
                HStack {
                    Text(L10n.tr(.settingsAppearanceContrastLow, language: language))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                    Spacer()
                    Text("\(currentContrast)")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(L10n.tr(.settingsAppearanceContrastHigh, language: language))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    // MARK: - 字体排版

    private var typographySection: some View {
        SettingsSection(
            title: L10n.tr(.settingsAppearanceTypographyTitle, language: language)
        ) {
            HStack {
                Text(L10n.tr(.settingsAppearanceSourceFontSize, language: language))
                Spacer()
                Stepper(
                    "\(settings.sourceFontSize) pt",
                    value: $settings.sourceFontSize,
                    in: 10...24
                )
            }

            HStack {
                Text(L10n.tr(.settingsAppearanceContentPadding, language: language))
                Spacer()
                Stepper(
                    "\(settings.contentPadding) pt",
                    value: $settings.contentPadding,
                    in: 8...40
                )
            }
        }
    }

    // MARK: - 方法

    private func selectScheme(_ theme: ThemeDefinition) {
        settings.themeId = theme.id
        // 切换配色方案时清除自定义覆盖，参照 buddy-macos 行为
        settings.themeCustomOverrides = .empty
    }

    private func applyAppearance(_ mode: AppearanceMode) {
        NSApp.appearance = mode.nsAppearance
        NSApp.windows.forEach { window in
            window.invalidateShadow()
        }
    }
}

// MARK: - 主题模式卡片

private struct ThemeModeCard: View {
    let mode: AppearanceMode
    let icon: String
    let title: String
    let description: String
    let isSelected: Bool
    let language: Language
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack(alignment: .topTrailing) {
                    // 图标区域
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(nsColor: .controlBackgroundColor))
                        .frame(height: 50)
                        .overlay {
                            Image(systemName: icon)
                                .font(.system(size: 20))
                                .foregroundStyle(.secondary)
                        }

                    // 选中指示器
                    Circle()
                        .fill(isSelected ? Color.accentColor : Color.clear)
                        .frame(width: 10, height: 10)
                        .overlay {
                            Circle()
                                .strokeBorder(isSelected ? Color.clear : Color(nsColor: .separatorColor), lineWidth: 1.5)
                                .frame(width: 10, height: 10)
                        }
                        .padding(6)
                }

                VStack(spacing: 2) {
                    Text(title)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.primary)
                    Text(description)
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(isSelected ? Color.accentColor : Color(nsColor: .separatorColor), lineWidth: isSelected ? 2 : 1)
            )
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(Color.accentColor.opacity(0.3), lineWidth: 3)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 配色方案卡片

private struct ColorSchemeCard: View {
    let theme: ThemeDefinition
    let isSelected: Bool
    let language: Language
    let action: () -> Void

    /// 安全解析 hex 颜色
    private var surfaceColor: Color {
        Color(hex: theme.surface) ?? Color(nsColor: .controlBackgroundColor)
    }
    private var accentColor: Color {
        Color(hex: theme.accent) ?? .accentColor
    }
    private var inkColor: Color {
        Color(hex: theme.ink) ?? .primary
    }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack(alignment: .topTrailing) {
                    // 迷你预览：主题 surface 背景 + accent 圆点 + ink 线条
                    RoundedRectangle(cornerRadius: 4)
                        .fill(surfaceColor)
                        .frame(height: 36)
                        .overlay {
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(accentColor)
                                    .frame(width: 8, height: 8)
                                RoundedRectangle(cornerRadius: 1)
                                    .fill(inkColor.opacity(0.5))
                                    .frame(width: 24, height: 3)
                            }
                        }

                    // 选中指示器
                    Circle()
                        .fill(isSelected ? Color.accentColor : Color.clear)
                        .frame(width: 8, height: 8)
                        .overlay {
                            Circle()
                                .strokeBorder(isSelected ? Color.clear : Color.primary.opacity(0.2), lineWidth: 1)
                                .frame(width: 8, height: 8)
                        }
                        .padding(4)
                }

                Text(theme.name)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(isSelected ? Color.accentColor : Color(nsColor: .separatorColor), lineWidth: isSelected ? 1.5 : 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 颜色条

private struct ColorBarRow: View {
    let label: String
    let hexValue: String
    let isCustom: Bool
    let onColorChange: (String) -> Void
    let onReset: () -> Void

    @State private var showColorPicker = false
    @State private var isEditingHex = false
    @State private var editHexText = ""

    var body: some View {
        HStack(spacing: 10) {
            // 颜色色块按钮
            Button {
                showColorPicker = true
            } label: {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(hex: hexValue) ?? .gray)
                    .frame(width: 24, height: 24)
                    .overlay {
                        RoundedRectangle(cornerRadius: 4)
                            .strokeBorder(Color.primary.opacity(0.15), lineWidth: 0.5)
                    }
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showColorPicker) {
                ColorPickerPopover(
                    hexValue: hexValue,
                    onChange: { newHex in
                        onColorChange(newHex)
                        showColorPicker = false
                    }
                )
            }

            // 标签
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(.primary)

            Spacer()

            // Hex 值（可点击编辑）
            if isEditingHex {
                TextField("#", text: $editHexText)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 11, design: .monospaced))
                    .frame(width: 72)
                    .onSubmit {
                        let cleaned = editHexText.hasPrefix("#") ? String(editHexText.dropFirst()) : editHexText
                        if cleaned.count == 6 && cleaned.allSatisfy({ $0.isHexDigit }) {
                            onColorChange("#" + cleaned.uppercased())
                        }
                        isEditingHex = false
                    }
            } else {
                Button {
                    editHexText = hexValue
                    isEditingHex = true
                } label: {
                    Text(hexValue)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            // 重置按钮（仅自定义时显示）
            if isCustom {
                Button {
                    onReset()
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help(L10n.tr(.reset, language: .en))
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - 颜色选择器弹窗

private struct ColorPickerPopover: View {
    let hexValue: String
    let onChange: (String) -> Void

    @State private var selectedColor: Color = .gray

    var body: some View {
        VStack(spacing: 12) {
            ColorPicker("", selection: $selectedColor, supportsOpacity: false)
                .labelsHidden()

            HStack {
                Button("Cancel") { onChange(hexValue) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                Spacer()
                Button("OK") {
                    onChange(selectedColor.toHexString())
                }
                .buttonStyle(.borderedProminent)
                    .controlSize(.small)
            }
        }
        .padding(16)
        .frame(width: 220)
        .onAppear {
            selectedColor = Color(hex: hexValue) ?? .gray
        }
    }
}

// MARK: - 设置区段辅助视图

private struct SettingsSection<Content: View>: View {
    let title: String
    var description: String? = nil
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.primary)

            if let desc = description {
                Text(desc)
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
            }

            content
        }
    }
}

private struct SettingsDivider: View {
    var body: some View {
        Divider()
            .padding(.vertical, 12)
    }
}

// MARK: - LanguagePref 辅助扩展

extension LanguagePref {
    static func languageKey(for pref: LanguagePref) -> L10n.Key {
        switch pref {
        case .auto: .languageAuto
        case .zhCN: .languageZhCN
        case .zhTW: .languageZhTW
        case .en: .languageEn
        }
    }
}

// MARK: - Color hex 扩展

extension Color {
    init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        guard hexSanitized.count == 6,
              let rgb = UInt64(hexSanitized, radix: 16) else {
            return nil
        }

        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255.0,
            green: Double((rgb >> 8) & 0xFF) / 255.0,
            blue: Double(rgb & 0xFF) / 255.0
        )
    }

    func toHexString() -> String {
        let nsColor = NSColor(self)
        guard let rgbColor = nsColor.usingColorSpace(.sRGB) else { return "#000000" }
        let r = Int(round(rgbColor.redComponent * 0xFF))
        let g = Int(round(rgbColor.greenComponent * 0xFF))
        let b = Int(round(rgbColor.blueComponent * 0xFF))
        return String(format: "#%02X%02X%02X", r, g, b)
    }
}
