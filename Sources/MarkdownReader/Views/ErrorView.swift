import SwiftUI

/// 错误提示视图
struct ErrorView: View {
    let icon: String
    let message: String

    init(icon: String = "exclamationmark.triangle", message: String) {
        self.icon = icon
        self.message = message
    }

    var body: some View {
        VStack(spacing: 12) {
            Spacer()

            Image(systemName: icon)
                .font(.system(size: 36))
                .foregroundStyle(.secondary)

            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
