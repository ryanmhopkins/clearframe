import SwiftUI

@main
struct ClearFrameApp: App {
    @State private var library = PhotoLibrary()
    @State private var account = AccountSession()
    @State private var store = ProStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if account.hasCompletedOnboarding {
                    ContentView(library: library, account: account, store: store)
                } else {
                    OnboardingView(account: account, store: store)
                }
            }
                .frame(minWidth: 840, minHeight: 620)
                .onOpenURL { url in Task { await account.handle(url) } }
                .task {
                    await account.refresh()
                    store.start()
                }
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
