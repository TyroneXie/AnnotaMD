import Foundation
import Testing
@testable import AnnotaMD

@MainActor
@Suite("Text fallback preview")
struct TextFallbackTests {

    @Test("non-Markdown UTF-8 text opens as read-only plain text")
    func utf8TextOpensAsPlainText() async throws {
        let root = try makeTextFallbackTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }

        let url = root.appendingPathComponent("data.json")
        try #"{"ok":true}"#.write(to: url, atomically: true, encoding: .utf8)

        let viewModel = DocumentViewModel(settings: SettingsModel())
        await viewModel.loadFile(at: url)

        #expect(viewModel.hasDocument)
        #expect(viewModel.isPlainTextDocument)
        #expect(!viewModel.isMarkdownDocument)
        #expect(viewModel.displayMode == .raw)
        #expect(viewModel.content == #"{"ok":true}"#)
        #expect(viewModel.outlineItems.isEmpty)
        #expect(!viewModel.isDirty)
    }

    @Test("Markdown extension still opens as Markdown document")
    func markdownOpensAsMarkdown() async throws {
        let root = try makeTextFallbackTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }

        let url = root.appendingPathComponent("note.md")
        try "# Heading\n\nBody".write(to: url, atomically: true, encoding: .utf8)

        let viewModel = DocumentViewModel(settings: SettingsModel())
        await viewModel.loadFile(at: url)

        #expect(viewModel.hasDocument)
        #expect(viewModel.isMarkdownDocument)
        #expect(!viewModel.isPlainTextDocument)
        #expect(viewModel.outlineItems.map(\.title) == ["Heading"])
    }

    @Test("binary files remain unsupported")
    func binaryFileIsUnsupported() async throws {
        let root = try makeTextFallbackTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }

        let url = root.appendingPathComponent("image.png")
        try Data([0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x0D]).write(to: url)

        let viewModel = DocumentViewModel(settings: SettingsModel())
        await viewModel.loadFile(at: url)

        #expect(!viewModel.hasDocument)
        #expect(!viewModel.isMarkdownDocument)
        #expect(!viewModel.isPlainTextDocument)
        #expect(viewModel.fileError != nil)
    }

    @Test("text sniffing accepts UTF-16 and rejects NUL-heavy binary")
    func textSniffingClassifiesEncodings() async throws {
        let root = try makeTextFallbackTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }

        let utf16URL = root.appendingPathComponent("utf16.log")
        var utf16 = Data([0xFF, 0xFE])
        utf16.append("hello utf16".data(using: .utf16LittleEndian)!)
        try utf16.write(to: utf16URL)

        let binaryURL = root.appendingPathComponent("blob.dat")
        try Data([0, 1, 2, 3, 0, 4, 5, 6]).write(to: binaryURL)

        let service = FileService()
        let utf16Text = try await service.readTextFileIfLikelyText(at: utf16URL)
        let binaryText = try await service.readTextFileIfLikelyText(at: binaryURL)

        #expect(utf16Text == "hello utf16")
        #expect(binaryText == nil)
    }
}

private func makeTextFallbackTemporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("AnnotaMDTextFallbackTests")
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}
