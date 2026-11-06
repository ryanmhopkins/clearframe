import AppKit
import Foundation
import Observation
import UniformTypeIdentifiers

enum CleaningPreset: String, CaseIterable, Identifiable {
    case privateDetails = "Private details"
    case privateAndDisplay = "Private + display"
    case everything = "Everything removable"

    var id: String { rawValue }
    var detail: String {
        switch self {
        case .privateDetails: "Personal metadata only. Keep color and provenance."
        case .privateAndDisplay: "Also remove color and display metadata."
        case .everything: "Also remove provenance information."
        }
    }
    func includes(_ block: MetadataBlock) -> Bool {
        guard block.removable else { return false }
        switch self {
        case .privateDetails: return block.kind == .personal
        case .privateAndDisplay: return block.kind != .provenance
        case .everything: return true
        }
    }
}

@Observable
final class PhotoItem: Identifiable {
    let id = UUID()
    let name: String
    let original: Data
    let report: ScanReport
    var selectedBlocks: Set<Int>
    var cleaned: Data?
    var error: String?

    init(name: String, data: Data, report: ScanReport, preset: CleaningPreset) {
        self.name = name
        self.original = data
        self.report = report
        self.selectedBlocks = Set(report.blocks.filter(preset.includes).map(\.id))
    }

    var outputName: String {
        let url = URL(fileURLWithPath: name)
        return url.deletingPathExtension().lastPathComponent + "-clearframe." + url.pathExtension
    }
    var removedCount: Int { report.blocks.filter { selectedBlocks.contains($0.id) }.count }
}

@Observable
final class PhotoLibrary {
    var items: [PhotoItem] = []
    var selectedID: UUID?
    var preset: CleaningPreset = .privateDetails
    var isProcessing = false
    var progress = 0.0
    var notice: String?

    var selected: PhotoItem? { items.first { $0.id == selectedID } }
    var completedCount: Int { items.filter { $0.cleaned != nil }.count }

    func openPhotos() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.jpeg, .png]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        guard panel.runModal() == .OK else { return }
        add(panel.urls)
    }

    func add(_ urls: [URL]) {
        var failures: [String] = []
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url, options: .mappedIfSafe)
                let report = try MetadataEngine.scan(data)
                let item = PhotoItem(name: url.lastPathComponent, data: data, report: report, preset: preset)
                items.append(item)
                selectedID = selectedID ?? item.id
            } catch { failures.append("\(url.lastPathComponent): \(error.localizedDescription)") }
        }
        notice = failures.isEmpty ? nil : failures.joined(separator: "\n")
    }

    func applyPreset() {
        for item in items {
            item.selectedBlocks = Set(item.report.blocks.filter(preset.includes).map(\.id))
            item.cleaned = nil
            item.error = nil
        }
    }

    func cleanAll() {
        guard !items.isEmpty, !isProcessing else { return }
        isProcessing = true
        progress = 0
        Task { @MainActor in
            for (index, item) in items.enumerated() {
                let original = item.original
                let selected = item.selectedBlocks
                do {
                    item.cleaned = try await Task.detached(priority: .userInitiated) {
                        try MetadataEngine.clean(original, removing: selected)
                    }.value
                    item.error = nil
                } catch {
                    item.cleaned = nil
                    item.error = error.localizedDescription
                }
                progress = Double(index + 1) / Double(items.count)
            }
            isProcessing = false
            if items.contains(where: { $0.error != nil }) { notice = "Some photos could not be cleaned. Select a photo for details." }
        }
    }

    func save(_ item: PhotoItem) {
        guard let data = item.cleaned else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = item.outputName
        panel.allowedContentTypes = item.report.format == "PNG" ? [.png] : [.jpeg]
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do { try data.write(to: url, options: .atomic); notice = "Saved \(url.lastPathComponent)" }
        catch { notice = error.localizedDescription }
    }

    func saveAll() {
        let ready = items.filter { $0.cleaned != nil }
        guard !ready.isEmpty else { return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.prompt = "Save Cleaned Photos"
        guard panel.runModal() == .OK, let folder = panel.url else { return }
        let scoped = folder.startAccessingSecurityScopedResource()
        defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
        var used: Set<String> = []
        do {
            for item in ready {
                var name = item.outputName
                var number = 2
                while used.contains(name) || FileManager.default.fileExists(atPath: folder.appendingPathComponent(name).path) {
                    let base = URL(fileURLWithPath: item.outputName).deletingPathExtension().lastPathComponent
                    let ext = URL(fileURLWithPath: item.outputName).pathExtension
                    name = "\(base)-\(number).\(ext)"
                    number += 1
                }
                used.insert(name)
                try item.cleaned!.write(to: folder.appendingPathComponent(name), options: .atomic)
            }
            notice = "Saved \(ready.count) cleaned photo\(ready.count == 1 ? "" : "s")."
        } catch { notice = error.localizedDescription }
    }
}
