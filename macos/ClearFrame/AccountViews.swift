import SwiftUI

struct OnboardingView: View {
    let account: AccountSession
    let store: ProStore
    @State private var address = ""
    @State private var showingPro = false

    var body: some View {
        VStack(spacing: 22) {
            Image(systemName: "square.on.square.dashed")
                .font(.system(size: 42, weight: .light))
                .foregroundStyle(.blue)
                .frame(width: 86, height: 86)
                .background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 24))
            VStack(spacing: 8) {
                Text("Welcome to ClearFrame")
                    .font(.system(size: 31, weight: .semibold, design: .rounded))
                Text("Clean your photos. Keep them private.")
                    .font(.system(size: 16))
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 11) {
                Text("Sign in with your ClearFrame account")
                    .font(.system(size: 14, weight: .semibold))
                Text("Free and Pro accounts use the same email link. Existing web Pro members are recognized automatically.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                TextField("Email address", text: $address)
                    .textContentType(.emailAddress)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { Task { await account.requestLink(email: address) } }
                Button(account.busy ? "Sending…" : "Email me a sign-in link") {
                    Task { await account.requestLink(email: address) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(account.busy || address.isEmpty)
                if let message = account.message {
                    Text(message).font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
            .padding(22)
            .frame(width: 420)
            .background(.white.opacity(0.8), in: RoundedRectangle(cornerRadius: 18))
            HStack(spacing: 18) {
                Button("Continue free without signing in") { account.finishOnboarding() }
                    .buttonStyle(.link)
                Button("See ClearFrame Pro") { showingPro = true }
                    .buttonStyle(.link)
            }
            Text("Photos stay on this Mac. Signing in only checks your account status.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
        }
        .frame(minWidth: 840, minHeight: 620)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.976, green: 0.969, blue: 0.953))
        .sheet(isPresented: $showingPro) { ProSheet(account: account, store: store) }
    }
}

struct AccountSheet: View {
    let account: AccountSession
    let store: ProStore
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var showingPro = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Your account").font(.system(size: 23, weight: .semibold, design: .rounded))
                Spacer()
                Button("Done") { dismiss() }
            }
            if account.signedIn {
                Label(account.email, systemImage: "person.crop.circle")
                Text(account.webPro || store.hasPro ? "ClearFrame Pro is active" : "Free account")
                    .foregroundStyle(.secondary)
                Button("Sign Out") { account.signOut() }
            } else {
                Text("Sign in to your free or Pro account with an email link.")
                    .foregroundStyle(.secondary)
                TextField("Email address", text: $address).textFieldStyle(.roundedBorder)
                Button(account.busy ? "Sending…" : "Email me a sign-in link") {
                    Task { await account.requestLink(email: address) }
                }
                .disabled(account.busy || address.isEmpty)
            }
            if let message = account.message { Text(message).font(.caption).foregroundStyle(.secondary) }
            Divider()
            Button("View Pro plans and purchases") { showingPro = true }
            Spacer()
        }
        .padding(25)
        .frame(width: 440, height: 310)
        .sheet(isPresented: $showingPro) { ProSheet(account: account, store: store) }
    }
}

struct ProSheet: View {
    let account: AccountSession
    let store: ProStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ClearFrame Pro").font(.system(size: 25, weight: .semibold, design: .rounded))
                    Text("More room to clean, with the same on-device privacy.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }
            }
            VStack(alignment: .leading, spacing: 8) {
                Label("Unlimited photo exports", systemImage: "checkmark.circle.fill")
                Label("Save a cleaned batch at once", systemImage: "checkmark.circle.fill")
                Label("Advanced cleaning presets", systemImage: "checkmark.circle.fill")
            }
            .font(.system(size: 13))
            .foregroundStyle(.blue)
            .padding(.vertical, 8)
            if account.webPro || store.hasPro {
                Label(account.webPro ? "Pro is active through your ClearFrame account." : "Pro is active through the App Store.", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            } else if store.products.isEmpty {
                Text("In-app purchases will appear when the monthly and annual plans are configured in App Store Connect.")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
            } else {
                ForEach(store.products, id: \.id) { product in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(store.isMonthly(product) ? "Monthly Pro" : "Annual Pro")
                                .font(.system(size: 14, weight: .semibold))
                            Text(product.description).font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("\(product.displayPrice) / \(store.isMonthly(product) ? "month" : "year")") {
                            Task { await store.purchase(product) }
                        }
                            .buttonStyle(.borderedProminent)
                            .disabled(store.busy)
                    }
                    .padding(12)
                    .background(.blue.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
                }
            }
            Button("Restore Purchases") { Task { await store.restore() } }
                .disabled(store.busy)
            if let message = store.message { Text(message).font(.caption).foregroundStyle(.secondary) }
            Spacer()
            Text("Subscriptions renew automatically. Manage or cancel in your Apple Account settings. Web subscriptions are managed on the ClearFrame website.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
            HStack(spacing: 16) {
                Link("Terms", destination: URL(string: "https://getclearframe.app/terms")!)
                Link("Privacy", destination: URL(string: "https://getclearframe.app/privacy")!)
            }
            .font(.system(size: 11))
        }
        .padding(26)
        .frame(width: 510, height: 440)
    }
}
