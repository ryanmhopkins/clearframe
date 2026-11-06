import SwiftUI
import UniformTypeIdentifiers

private enum Palette {
    static let ink = Color(red: 0.13, green: 0.18, blue: 0.22)
    static let blue = Color(red: 0.24, green: 0.43, blue: 0.68)
    static let canvas = Color(red: 0.976, green: 0.969, blue: 0.953)
    static let panel = Color(red: 1.0, green: 0.997, blue: 0.99)
}

struct ContentView: View {
    @Bindable var library: PhotoLibrary
    let account: AccountSession
    let store: ProStore
    @State private var isDropTargeted = false
    @State private var showingAccount = false
    @State private var showingPro = false
    private var hasPro: Bool { account.webPro || store.hasPro }

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Rectangle().fill(Palette.ink.opacity(0.08)).frame(width: 1)
            VStack(alignment: .leading, spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        dropArea
                        if !library.items.isEmpty {
                            controls
                            photoDetails
                        }
                    }
                    .padding(32)
                    .frame(maxWidth: 900)
                    .frame(maxWidth: .infinity)
                }
                footer
            }
        }
        .background(Palette.canvas)
        .foregroundStyle(Palette.ink)
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            for provider in providers {
                _ = provider.loadObject(ofClass: URL.self) { url, _ in
                    guard let url else { return }
                    Task { @MainActor in library.add([url]) }
                }
            }
            return !providers.isEmpty
        }
        .sheet(isPresented: $showingAccount) { AccountSheet(account: account, store: store) }
        .sheet(isPresented: $showingPro) { ProSheet(account: account, store: store) }
        .onChange(of: hasPro) { _, active in
            if !active {
                library.preset = .privateDetails
                library.applyPreset()
            }
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "square.on.square.dashed")
                    .font(.system(size: 21, weight: .medium))
                    .foregroundStyle(Palette.blue)
                Text("ClearFrame").font(.system(size: 20, weight: .semibold, design: .rounded))
            }
            .padding(.top, 34)
            .padding(.horizontal, 22)

            Text("YOUR PHOTOS")
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.6)
                .foregroundStyle(.secondary)
                .padding(.top, 44)
                .padding(.bottom, 12)
                .padding(.horizontal, 22)

            ScrollView {
                VStack(spacing: 5) {
                    ForEach(library.items) { item in
                        Button { library.selectedID = item.id } label: {
                            HStack(spacing: 10) {
                                Image(systemName: item.report.format == "PNG" ? "photo" : "photo.fill")
                                    .frame(width: 19)
                                    .foregroundStyle(Palette.blue)
                                Text(item.name).lineLimit(1).truncationMode(.middle)
                                    .font(.system(size: 13))
                                Spacer(minLength: 2)
                                if item.cleaned != nil { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                                else if item.error != nil { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange) }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(library.selectedID == item.id ? Palette.blue.opacity(0.11) : .clear, in: RoundedRectangle(cornerRadius: 10))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 10)
            }

            Spacer(minLength: 10)
            VStack(alignment: .leading, spacing: 7) {
                Image(systemName: "lock.shield")
                    .font(.system(size: 18))
                    .foregroundStyle(Palette.blue)
                Text("Private by design")
                    .font(.system(size: 12, weight: .semibold))
                Text("Photos are processed on this Mac.")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Palette.blue.opacity(0.055), in: RoundedRectangle(cornerRadius: 14))
            .padding(14)
        }
        .frame(width: 230)
        .background(Palette.panel)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("A clearer way to share.")
                    .font(.system(size: 27, weight: .semibold, design: .rounded))
                Text("Remove hidden details from your photos, right here on your Mac.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button { showingAccount = true } label: {
                Label(account.signedIn ? (hasPro ? "Pro account" : "Free account") : "Sign In", systemImage: "person.crop.circle")
            }
            .buttonStyle(.bordered)
            if !hasPro {
                Button("Get Pro") { showingPro = true }
                    .buttonStyle(.bordered)
            }
            Button { library.openPhotos() } label: {
                Label("Add Photos", systemImage: "plus")
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 23)
        .background(Palette.panel.opacity(0.85))
    }

    private var dropArea: some View {
        VStack(spacing: 12) {
            Image(systemName: "square.and.arrow.down")
                .font(.system(size: 31, weight: .ultraLight))
                .foregroundStyle(Palette.blue)
                .frame(width: 66, height: 66)
                .background(Palette.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
            Text(library.items.isEmpty ? "Drop your photos here" : "Add more photos")
                .font(.system(size: 18, weight: .medium, design: .rounded))
            Text("JPEG and PNG · Up to 256 MB each")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
            if library.items.isEmpty {
                Button("Choose Photos…") { library.openPhotos() }
                    .buttonStyle(.borderedProminent)
                    .tint(Palette.blue)
                    .padding(.top, 5)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: library.items.isEmpty ? 280 : 170)
        .background(Palette.panel, in: RoundedRectangle(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .strokeBorder(Palette.blue.opacity(isDropTargeted ? 0.8 : 0.22), style: StrokeStyle(lineWidth: isDropTargeted ? 2 : 1, dash: [7, 5]))
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Cleaning preset").font(.system(size: 13, weight: .semibold))
                Text(library.preset.detail).font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer()
            Picker("Preset", selection: $library.preset) {
                ForEach(CleaningPreset.allCases) { preset in Text(preset.rawValue).tag(preset) }
            }
            .labelsHidden()
            .frame(width: 170)
            .disabled(!hasPro)
            .onChange(of: library.preset) { _, _ in library.applyPreset() }
            if !hasPro {
                Button("Unlock presets") { showingPro = true }.buttonStyle(.link)
            }
        }
        .padding(18)
        .background(Palette.panel, in: RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder
    private var photoDetails: some View {
        if let item = library.selected {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(.system(size: 17, weight: .semibold, design: .rounded))
                            .lineLimit(1).truncationMode(.middle)
                        Text("\(item.report.format) · \(ByteCountFormatter.string(fromByteCount: Int64(item.original.count), countStyle: .file)) · \(item.report.blocks.count) metadata blocks")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if item.cleaned != nil {
                        Button("Save Photo…") { library.save(item, isPro: hasPro) }.buttonStyle(.bordered)
                    }
                }
                if item.report.blocks.isEmpty {
                    Label("No removable metadata was found.", systemImage: "checkmark.seal")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .padding(.vertical, 14)
                } else {
                    ForEach(item.report.blocks) { block in
                        Toggle(isOn: Binding(
                            get: { item.selectedBlocks.contains(block.id) },
                            set: { selected in
                                if selected { item.selectedBlocks.insert(block.id) }
                                else { item.selectedBlocks.remove(block.id) }
                                item.cleaned = nil
                            }
                        )) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(block.label).font(.system(size: 13, weight: .medium))
                                    Text(block.kind == .personal ? "Personal" : block.kind == .appearance ? "Display" : "Provenance")
                                        .font(.system(size: 11)).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(ByteCountFormatter.string(fromByteCount: Int64(block.byteCount), countStyle: .file))
                                    .font(.system(size: 11)).foregroundStyle(.secondary)
                            }
                        }
                        .disabled(!block.removable)
                        if block.id != item.report.blocks.last?.id { Divider() }
                    }
                }
                if let error = item.error {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .font(.system(size: 12))
                }
                if let cleaned = item.cleaned {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Ready to share").font(.system(size: 13, weight: .semibold))
                            Text("Removed \(item.removedCount) metadata block\(item.removedCount == 1 ? "" : "s") · \(ByteCountFormatter.string(fromByteCount: Int64(item.original.count - cleaned.count), countStyle: .file)) cleared")
                                .font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding(13)
                    .background(Color.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 11))
                }
                Text("Removing EXIF also removes its orientation and embedded thumbnail. Removing color or provenance data can change appearance or invalidate credentials.")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .padding(.top, 6)
            }
            .padding(22)
            .background(Palette.panel, in: RoundedRectangle(cornerRadius: 18))
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if library.isProcessing { ProgressView(value: library.progress).frame(width: 130) }
            if let notice = library.notice {
                Text(notice).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(2)
            } else {
                Text(library.items.isEmpty ? "Your photos never leave this Mac." : "\(library.completedCount) of \(library.items.count) ready to save")
                    .font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Spacer()
            if library.completedCount > 0 {
                Button(hasPro ? "Save All…" : "Unlock Batch Save") {
                    if hasPro { library.saveAll(isPro: true) }
                    else { showingPro = true }
                }.buttonStyle(.bordered)
            }
            Button("Clean Photos") { library.cleanAll() }
                .buttonStyle(.borderedProminent)
                .tint(Palette.blue)
                .disabled(library.items.isEmpty || library.isProcessing)
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 16)
        .background(Palette.panel)
    }
}
