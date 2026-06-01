import SwiftUI
import UniformTypeIdentifiers

/// 空状态占位视图，提示用户打开目录或文件
struct WelcomeView: View {
    let appViewModel: AppViewModel

    var body: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "folder")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("Open a folder to get started")
                .font(.title2)
                .foregroundStyle(.primary)

            Text("Press Cmd+O or click Open in toolbar")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button("Open") {
                openPanel()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding(.top, 8)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// 打开面板，支持选择目录和 .md 文件
    private func openPanel() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "打开"
        panel.allowedContentTypes = [.folder, UTType(filenameExtension: "md")].compactMap { $0 }

        if panel.runModal() == .OK, let url = panel.url {
            var isDir: ObjCBool = false
            FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir)

            if isDir.boolValue {
                appViewModel.openDirectory(url)
            } else {
                appViewModel.openSingleFile(url)
                NotificationCenter.default.post(name: .openFile, object: url)
            }
        }
    }
}
