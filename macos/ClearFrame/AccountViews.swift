import SwiftUI

struct OnboardingView: View {
    let account: AccountSession
    let store: ProStore
    @State private var address = ""
    @State private var showingPro = false

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 34) {
                story
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                signInCard
                    .frame(width: min(410, geometry.size.width * 0.46))
                    .frame(maxHeight: .infinity)
            }
            .padding(.horizontal, 58)
            .padding(.vertical, 42)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 840, minHeight: 620)
        .background(CFStyle.backdrop)
        .foregroundStyle(CFStyle.text)
        .tint(CFStyle.blue)
        .sheet(isPresented: $showingPro) { ProSheet(account: account, store: store) }
    }

    private var story: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 11) {
                BrandMark(size: 40)
                Text("clearframe")
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                    .tracking(-0.6)
                Text(".").foregroundStyle(CFStyle.blue).font(.system(size: 21, weight: .bold))
                    .padding(.leading, -10)
            }
            Spacer(minLength: 24)
            Text("The photo stays.\nThe details go.")
                .font(.system(size: 42, weight: .semibold, design: .rounded))
                .tracking(-1.7)
                .lineSpacing(0)
                .fixedSize(horizontal: false, vertical: true)
            Text("A quieter way to share photos. Clean hidden metadata right here on your Mac.")
                .font(.system(size: 13))
                .foregroundStyle(CFStyle.muted)
                .lineSpacing(4)
                .padding(.top, 13)
                .fixedSize(horizontal: false, vertical: true)
            metadataIllustration
                .padding(.top, 34)
            Spacer(minLength: 20)
            HStack(spacing: 8) {
                Image(systemName: "lock.shield")
                    .foregroundStyle(CFStyle.blue)
                Text("Image files never leave this device")
                    .foregroundStyle(CFStyle.muted)
            }
            .font(.system(size: 11))
        }
    }

    private var metadataIllustration: some View {
        HStack(spacing: 13) {
            Image(systemName: "photo")
                .font(.system(size: 23, weight: .ultraLight))
                .foregroundStyle(CFStyle.blue)
                .frame(width: 58, height: 58)
                .background(CFStyle.blue.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
            VStack(alignment: .leading, spacing: 6) {
                Text("Your image, refined")
                    .font(.system(size: 12, weight: .semibold))
                Text("LOCATION  ·  CAMERA  ·  DATE")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .tracking(0.5)
                    .foregroundStyle(CFStyle.muted)
            }
            Spacer(minLength: 0)
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(CFStyle.blue)
                .font(.system(size: 17))
        }
        .padding(14)
        .darkPanel(radius: 17)
    }

    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Welcome to\nClearFrame.")
                .font(.system(size: 29, weight: .semibold, design: .rounded))
                .tracking(-0.8)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 29)
            Text("EMAIL ADDRESS")
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .tracking(1.5)
                .foregroundStyle(CFStyle.muted)
                .padding(.bottom, 8)
            TextField("you@example.com", text: $address)
                .textContentType(.emailAddress)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .padding(.horizontal, 14)
                .frame(height: 44)
                .background(CFStyle.background.opacity(0.75), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(CFStyle.line))
                .onSubmit { Task { await account.requestLink(email: address) } }
            Button {
                Task { await account.requestLink(email: address) }
            } label: {
                HStack {
                    Spacer()
                    Text(account.busy ? "Sending…" : "Email me a sign-in link")
                    Image(systemName: "arrow.right")
                    Spacer()
                }
                .font(.system(size: 13, weight: .semibold))
                .frame(height: 42)
            }
            .buttonStyle(.borderedProminent)
            .tint(CFStyle.blueStrong)
            .disabled(account.busy || address.isEmpty)
            .padding(.top, 13)
            if let message = account.message {
                Text(message)
                    .font(.system(size: 11))
                    .foregroundStyle(CFStyle.muted)
                    .padding(.top, 11)
            }
            HStack(spacing: 5) {
                Text("Already have Pro?")
                    .foregroundStyle(CFStyle.muted)
                Text("Use the email from your web purchase.")
                    .foregroundStyle(CFStyle.text)
            }
            .font(.system(size: 10))
            .padding(.top, 21)
            Rectangle().fill(CFStyle.line).frame(height: 1).padding(.vertical, 22)
            VStack(spacing: 10) {
                Button { account.finishOnboarding() } label: {
                    Text("Continue with no account")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                Button { showingPro = true } label: {
                    Text("Explore ClearFrame Pro")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        }
        .padding(30)
        .clearFrameGlass(radius: 25)
    }
}

struct AccountSheet: View {
    let account: AccountSession
    let store: ProStore
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var showingPro = false

    var body: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack {
                BrandMark(size: 34)
                Text("Your account").font(.system(size: 22, weight: .semibold, design: .rounded))
                Spacer()
                Button("Done") { dismiss() }.buttonStyle(.bordered)
            }
            Rectangle().fill(CFStyle.line).frame(height: 1)
            if account.signedIn {
                Label(account.email, systemImage: "person.crop.circle")
                    .font(.system(size: 13))
                Label(account.webPro || store.hasPro ? "ClearFrame Pro active" : "Free account", systemImage: "checkmark.seal")
                    .foregroundStyle(CFStyle.blue)
                    .font(.system(size: 12))
                Button("Sign out") { account.signOut() }.buttonStyle(.link)
            } else {
                Text("Sign in with your free or Pro account.")
                    .font(.system(size: 12)).foregroundStyle(CFStyle.muted)
                TextField("Email address", text: $address)
                    .textContentType(.emailAddress)
                    .textFieldStyle(.roundedBorder)
                Button(account.busy ? "Sending…" : "Email me a sign-in link") {
                    Task { await account.requestLink(email: address) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(account.busy || address.isEmpty)
            }
            if let message = account.message { Text(message).font(.caption).foregroundStyle(CFStyle.muted) }
            Spacer()
            Button("View welcome screen") {
                dismiss()
                account.showOnboarding()
            }
            .buttonStyle(.link)
            Button("View Pro plans and purchases") { showingPro = true }.buttonStyle(.link)
        }
        .padding(27)
        .frame(width: 450, height: 330)
        .background(CFStyle.backdrop)
        .foregroundStyle(CFStyle.text)
        .tint(CFStyle.blue)
        .sheet(isPresented: $showingPro) { ProSheet(account: account, store: store) }
    }
}

struct ProSheet: View {
    let account: AccountSession
    let store: ProStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack {
                BrandMark(size: 38)
                VStack(alignment: .leading, spacing: 3) {
                    Text("ClearFrame Pro").font(.system(size: 23, weight: .semibold, design: .rounded))
                    Text("More freedom. Same on-device privacy.")
                        .font(.system(size: 12)).foregroundStyle(CFStyle.muted)
                }
                Spacer()
                Button("Done") { dismiss() }.buttonStyle(.bordered)
            }
            VStack(alignment: .leading, spacing: 10) {
                Label("Unlimited photo exports", systemImage: "checkmark.circle.fill")
                Label("Save a cleaned batch at once", systemImage: "checkmark.circle.fill")
                Label("Advanced cleaning presets", systemImage: "checkmark.circle.fill")
            }
            .font(.system(size: 12))
            .foregroundStyle(CFStyle.blue)
            .padding(17)
            .frame(maxWidth: .infinity, alignment: .leading)
            .darkPanel(radius: 15)
            if account.webPro || store.hasPro {
                Label(account.webPro ? "Pro is active through your ClearFrame account." : "Pro is active through the App Store.", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            } else if store.products.isEmpty {
                Text("PLANNED US PRICING")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .tracking(1.5)
                    .foregroundStyle(CFStyle.muted)
                previewPlan("Monthly", price: "$3", period: "month")
                Text("Purchases become available after these plans are configured in App Store Connect. Final prices are shown by Apple.")
                    .font(.system(size: 11)).foregroundStyle(CFStyle.muted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                ForEach(store.products, id: \.id) { product in
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Monthly Pro")
                                .font(.system(size: 14, weight: .semibold))
                            Text(product.description).font(.system(size: 11)).foregroundStyle(CFStyle.muted)
                        }
                        Spacer()
                        Button("\(product.displayPrice) / month") {
                            Task { await store.purchase(product) }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(CFStyle.blueStrong)
                        .disabled(store.busy)
                    }
                    .padding(13)
                    .darkPanel(radius: 13)
                }
            }
            Button("Restore purchases") { Task { await store.restore() } }
                .buttonStyle(.bordered)
                .disabled(store.busy)
            if let message = store.message { Text(message).font(.caption).foregroundStyle(CFStyle.muted) }
            Spacer(minLength: 3)
            Text("Subscriptions renew automatically. Manage or cancel in your Apple Account settings. Web subscriptions are managed on the ClearFrame website.")
                .font(.system(size: 10)).foregroundStyle(CFStyle.muted)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 18) {
                Link("Terms", destination: URL(string: "https://getclearframe.app/terms")!)
                Link("Privacy", destination: URL(string: "https://getclearframe.app/privacy")!)
            }
            .font(.system(size: 11))
        }
        .padding(27)
        .frame(width: 520, height: 560)
        .background(CFStyle.backdrop)
        .foregroundStyle(CFStyle.text)
        .tint(CFStyle.blue)
    }

    private func previewPlan(_ name: String, price: String, period: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(name.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .tracking(1.2)
                .foregroundStyle(CFStyle.muted)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(price).font(.system(size: 25, weight: .semibold, design: .rounded))
                Text("/ \(period)").font(.system(size: 11)).foregroundStyle(CFStyle.muted)
            }
            Text("Available at launch")
                .font(.system(size: 10)).foregroundStyle(CFStyle.blue)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(17)
        .darkPanel(radius: 14)
    }
}
