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
        HStack(spacing: 0) {
            sidebar
            Rectangle().fill(CFStyle.line).frame(width: 1)
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        intro
                        dropArea
                        if !library.items.isEmpty {
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

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 11) {
                BrandMark(size: 36)
                Text("clearframe")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .tracking(-0.6)
                Text(".").foregroundStyle(CFStyle.blue).font(.system(size: 21, weight: .bold))
                    .padding(.leading, -10)
            }
            .padding(.horizontal, 22)
            .padding(.top, 32)
            HStack(spacing: 8) {
                Circle().fill(CFStyle.blue).frame(width: 5, height: 5)
                Text("LOCAL WORKSPACE")
                    .tracking(1.7)
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundStyle(CFStyle.muted)
            }
            .padding(.horizontal, 22)
            .padding(.top, 45)
            .padding(.bottom, 14)
            ScrollView {
                VStack(spacing: 5) {
                    if library.items.isEmpty {
                        Text("Your imported photos will appear here.")
                            .font(.system(size: 12))
                            .foregroundStyle(CFStyle.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                    }
                    ForEach(library.items) { item in
                        Button { library.selectedID = item.id } label: {
                            HStack(spacing: 11) {
                                Image(systemName: "photo")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(CFStyle.blue)
                                    .frame(width: 24, height: 24)
                                    .background(CFStyle.blue.opacity(0.10), in: RoundedRectangle(cornerRadius: 6))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name).lineLimit(1).truncationMode(.middle)
                                        .font(.system(size: 12, weight: .medium))
                                    Text(item.cleaned != nil ? "Ready to save" : item.report.format)
                                        .font(.system(size: 10))
                                        .foregroundStyle(CFStyle.muted)
                                }
                                Spacer(minLength: 2)
                                if item.cleaned != nil { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                                else if item.error != nil { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange) }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(library.selectedID == item.id ? CFStyle.blue.opacity(0.13) : .clear,
                                        in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10)
                                .strokeBorder(library.selectedID == item.id ? CFStyle.blue.opacity(0.18) : .clear))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 11)
            }
            Spacer(minLength: 12)
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: "lock.shield")
                    .foregroundStyle(CFStyle.blue)
                    .font(.system(size: 17))
                Text("Private by design")
                    .font(.system(size: 12, weight: .semibold))
                Text("Your image files never leave this Mac.")
                    .font(.system(size: 11))
                    .foregroundStyle(CFStyle.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(15)
            .frame(maxWidth: .infinity, alignment: .leading)
            .darkPanel(radius: 14)
            .padding(14)
        }
        .frame(width: 236)
        .background(CFStyle.background.opacity(0.76))
    }

    private var header: some View {
        HStack(spacing: 10) {
            Text("Workspace")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(CFStyle.muted)
            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(CFStyle.muted.opacity(0.6))
            Text("Clean photos")
                .font(.system(size: 13, weight: .semibold))
            Spacer()
            Button { showingAccount = true } label: {
                Label(account.signedIn ? (hasPro ? "Pro" : "Free") : "Sign in", systemImage: "person.crop.circle")
            }
            .buttonStyle(.bordered)
            if !hasPro {
                Button("Get Pro") { showingPro = true }
                    .buttonStyle(.bordered)
            }
            Button { library.openPhotos() } label: {
                Label("Add photos", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .tint(CFStyle.blueStrong)
        }
        .controlSize(.regular)
        .padding(.horizontal, 38)
        .padding(.vertical, 18)
        .background(CFStyle.background.opacity(0.48))
        .overlay(alignment: .bottom) { Rectangle().fill(CFStyle.line).frame(height: 1) }
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle().fill(CFStyle.blue).frame(width: 5, height: 5)
                Text("A QUIETER WAY TO SHARE")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .tracking(2)
                    .foregroundStyle(CFStyle.blue)
            }
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
