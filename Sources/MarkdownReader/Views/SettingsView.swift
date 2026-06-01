import SwiftUI

/// 设置窗口主视图，包含「通用」和「外观」两个标签页
/// 参照 buddy-macos SettingsContent 的 Tab 式布局
struct SettingsView: View {
    @State private var settings = SettingsModel()
    @State private var selectedTab: SettingsTab = .general

    var body: some View {
        TabView(selection: $selectedTab) {
            GeneralSettingsView(settings: settings)
                .tabItem {
                    Label("通用", systemImage: "gearshape")
                }
                .tag(SettingsTab.general)

            AppearanceSettingsView(settings: settings)
                .tabItem {
                    Label("外观", systemImage: "paintbrush")
                }
                .tag(SettingsTab.appearance)
        }
        .frame(width: 450)
        .fixedSize(horizontal: false, vertical: true)
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

    var body: some View {
        Form {
            // 默认显示模式
            Section {
                Picker("默认显示模式", selection: $settings.defaultDisplayMode) {
                    ForEach(DisplayMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            } header: {
                Text("显示")
            }

            Divider()

            // 启动行为
            Section {
                Toggle("启动时重新打开上次位置", isOn: $settings.reopenLastLocation)
            } header: {
                Text("启动")
            }

            Divider()

            // 文件树过滤
            Section {
                Toggle("显示隐藏文件", isOn: $settings.showHiddenFiles)
                Toggle("显示非 Markdown 文件", isOn: $settings.showNonMarkdownFiles)
            } header: {
                Text("文件树")
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

// MARK: - 外观设置视图

private struct AppearanceSettingsView: View {
    @Bindable var settings: SettingsModel

    var body: some View {
        Form {
            // 外观模式
            Section {
                Picker("外观模式", selection: $settings.appearanceMode) {
                    ForEach(AppearanceMode.allCases) { mode in
                        Text(mode.displayName).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: settings.appearanceMode) { _, newValue in
                    applyAppearance(newValue)
                }
            } header: {
                Text("主题")
            }

            Divider()

            // 字体与排版
            Section {
                HStack {
                    Text("源码字号")
                    Spacer()
                    Stepper(
                        "\(settings.sourceFontSize) pt",
                        value: $settings.sourceFontSize,
                        in: 10...24
                    )
                }

                HStack {
                    Text("内容边距")
                    Spacer()
                    Stepper(
                        "\(settings.contentPadding) pt",
                        value: $settings.contentPadding,
                        in: 8...40
                    )
                }
            } header: {
                Text("字体与排版")
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    /// 应用外观模式到窗口
    private func applyAppearance(_ mode: AppearanceMode) {
        NSApp.appearance = mode.nsAppearance
        NSApp.windows.forEach { window in
            window.invalidateShadow()
        }
    }
}
