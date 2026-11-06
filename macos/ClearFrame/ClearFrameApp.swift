import SwiftUI

@main
struct ClearFrameApp: App {
    @State private var library = PhotoLibrary()

    var body: some Scene {
        WindowGroup {
            ContentView(library: library)
                .frame(minWidth: 840, minHeight: 620)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Add Photos…") { library.openPhotos() }
                    .keyboardShortcut("o")
            }
        }
    }
}
