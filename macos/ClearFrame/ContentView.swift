import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @Bindable var library: PhotoLibrary
    let account: AccountSession
    let store: ProStore
    @State private var isDropTargeted = false
    @State private var showingAccount = false
    @State private var showingPro = false
    private var hasPro: Bool { account.webPro || store.hasPro }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    intro
                    dropArea
                    if !library.items.isEmpty {
                        photoStrip
                        controls
                        photoDetails
                    }
                }
                .frame(maxWidth: 900)
                .padding(.horizontal, 38)
                .padding(.top, 30)
                .padding(.bottom, 32)
                .frame(maxWidth: .infinity)
            }
            footer
        }
        .background(CFStyle.backdrop)
        .foregroundStyle(CFStyle.text)
        .tint(CFStyle.blue)
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

    private var photoStrip: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Photos · \(library.items.count)")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(CFStyle.muted)
            ScrollView(.horizontal) {
                HStack(spacing: 9) {
                    ForEach(library.items) { item in
                        Button { library.selectedID = item.id } label: {
                            HStack(spacing: 9) {
                                Image(systemName: "photo")
                                    .foregroundStyle(CFStyle.blue)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name)
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                        .font(.system(size: 12, weight: .medium))
                                    Text(item.cleaned != nil ? "Ready to save" : item.report.format)
                                        .font(.system(size: 10))
                                        .foregroundStyle(CFStyle.muted)
                                }
                                if item.cleaned != nil {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                } else if item.error != nil {
                                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
                                }
                            }
                            .padding(.horizontal, 13)
                            .padding(.vertical, 10)
                            .frame(width: 205, alignment: .leading)
                            .background(library.selectedID == item.id ? CFStyle.blue.opacity(0.15) : CFStyle.surface,
                                        in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(library.selectedID == item.id ? CFStyle.blue.opacity(0.38) : CFStyle.line))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            BrandMark(size: 36)
            Text("clearframe")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .tracking(-0.6)
            Text(".")
                .foregroundStyle(CFStyle.blue)
                .font(.system(size: 21, weight: .bold))
                .padding(.leading, -10)
            Spacer()
            Button { showingAccount = true } label: {
                Label(account.signedIn ? (hasPro ? "Pro" : "Free") : "Sign in", systemImage: "person.crop.circle")
            }
            .buttonStyle(.bordered)
            if !hasPro {
                Button("Get Pro") { showingPro = true }
                    .buttonStyle(.bordered)
            }
        }
        .controlSize(.regular)
        .padding(.horizontal, 38)
        .padding(.top, 26)
        .padding(.bottom, 12)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your photos. Nothing else.")
                .font(.system(size: 31, weight: .semibold, design: .rounded))
                .tracking(-1.1)
            Text("Remove hidden details before you send, post, or save a copy.")
                .font(.system(size: 13))
                .foregroundStyle(CFStyle.muted)
        }
    }

    private var dropArea: some View {
        VStack(spacing: 16) {
            Image(systemName: "arrow.down.document")
                .font(.system(size: 25, weight: .light))
                .foregroundStyle(CFStyle.blue)
                .frame(width: 60, height: 60)
                .background(CFStyle.blue.opacity(0.13), in: RoundedRectangle(cornerRadius: 17))
                .overlay(RoundedRectangle(cornerRadius: 17).strokeBorder(CFStyle.blue.opacity(0.19)))
            VStack(spacing: 5) {
                Text(library.items.isEmpty ? "Drop your photos here" : "Add more photos")
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                Text("JPEG and PNG · Up to 256 MB each")
                    .font(.system(size: 12))
                    .foregroundStyle(CFStyle.muted)
            }
            Button("Choose photos…") { library.openPhotos() }
                .buttonStyle(.bordered)
                .controlSize(.large)
        }
        .frame(maxWidth: .infinity)
        .frame(height: library.items.isEmpty ? 276 : 210)
        .clearFrameGlass(radius: 24)
        .overlay(RoundedRectangle(cornerRadius: 24)
            .strokeBorder(CFStyle.blue.opacity(isDropTargeted ? 0.75 : 0.19),
                          style: StrokeStyle(lineWidth: isDropTargeted ? 2 : 1, dash: [7, 6])))
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Image(systemName: "slider.horizontal.3")
                .foregroundStyle(CFStyle.blue)
                .frame(width: 31, height: 31)
                .background(CFStyle.blue.opacity(0.11), in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 3) {
                Text("Cleaning preset").font(.system(size: 13, weight: .semibold))
                Text(library.preset.detail).font(.system(size: 11)).foregroundStyle(CFStyle.muted)
            }
            Spacer()
            Picker("Preset", selection: $library.preset) {
                ForEach(CleaningPreset.allCases) { preset in Text(preset.rawValue).tag(preset) }
            }
            .labelsHidden()
            .frame(width: 175)
            .disabled(!hasPro)
            .onChange(of: library.preset) { _, _ in library.applyPreset() }
            if !hasPro {
                Button("Unlock") { showingPro = true }.buttonStyle(.link)
            }
        }
        .padding(18)
        .darkPanel(radius: 17)
    }

    @ViewBuilder
    private var photoDetails: some View {
        if let item = library.selected {
            VStack(alignment: .leading, spacing: 15) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(.system(size: 16, weight: .semibold, design: .rounded))
                            .lineLimit(1).truncationMode(.middle)
                        Text("\(item.report.format) · \(ByteCountFormatter.string(fromByteCount: Int64(item.original.count), countStyle: .file)) · \(item.report.blocks.count) metadata blocks")
                            .font(.system(size: 11)).foregroundStyle(CFStyle.muted)
                    }
                    Spacer()
                    if item.cleaned != nil {
                        Button("Save photo…") { library.save(item, isPro: hasPro) }.buttonStyle(.bordered)
                    }
                }
                Rectangle().fill(CFStyle.line).frame(height: 1)
                if item.report.blocks.isEmpty {
                    Label("No removable metadata was found.", systemImage: "checkmark.seal")
                        .font(.system(size: 12)).foregroundStyle(CFStyle.muted)
                        .padding(.vertical, 12)
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
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(block.label).font(.system(size: 12, weight: .medium))
                                    Text(block.kind == .personal ? "Personal" : block.kind == .appearance ? "Display" : "Provenance")
                                        .font(.system(size: 10)).foregroundStyle(CFStyle.muted)
                                }
                                Spacer()
                                Text(ByteCountFormatter.string(fromByteCount: Int64(block.byteCount), countStyle: .file))
                                    .font(.system(size: 10, design: .monospaced)).foregroundStyle(CFStyle.muted)
                            }
                        }
                        .disabled(!block.removable)
                        if block.id != item.report.blocks.last?.id { Rectangle().fill(CFStyle.line).frame(height: 1) }
                    }
                }
                if let error = item.error {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange).font(.system(size: 12))
                }
                if let cleaned = item.cleaned {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Ready to share").font(.system(size: 12, weight: .semibold))
                            Text("Removed \(item.removedCount) block\(item.removedCount == 1 ? "" : "s") · \(ByteCountFormatter.string(fromByteCount: Int64(item.original.count - cleaned.count), countStyle: .file)) cleared")
                                .font(.system(size: 11)).foregroundStyle(CFStyle.muted)
                        }
                        Spacer()
                    }
                    .padding(12)
                    .background(Color.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 10))
                }
                Text("EXIF removal also removes orientation and embedded thumbnails. Removing display data can change appearance.")
                    .font(.system(size: 11)).foregroundStyle(CFStyle.muted)
            }
            .padding(21)
            .darkPanel(radius: 18)
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.fill").foregroundStyle(CFStyle.blue).font(.system(size: 11))
            if library.isProcessing { ProgressView(value: library.progress).frame(width: 120) }
            Text(library.notice ?? (library.items.isEmpty ? "Processed on your Mac. Always." : "\(library.completedCount) of \(library.items.count) ready to save"))
                .font(.system(size: 11))
                .foregroundStyle(CFStyle.muted)
                .lineLimit(2)
            Spacer()
            if library.completedCount > 0 {
                Button(hasPro ? "Save all…" : "Unlock batch save") {
                    if hasPro { library.saveAll(isPro: true) }
                    else { showingPro = true }
                }
                .buttonStyle(.bordered)
            }
            Button("Clean photos") { library.cleanAll() }
                .buttonStyle(.borderedProminent)
                .tint(CFStyle.blueStrong)
                .disabled(library.items.isEmpty || library.isProcessing)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 13)
        .clearFrameGlass(radius: 18)
        .padding(.horizontal, 26)
        .padding(.bottom, 18)
    }
}
