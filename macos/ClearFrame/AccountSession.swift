import CryptoKit
import Foundation
import Observation
import Security

private enum SecretStore {
    static func read(_ key: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: "app.getclearframe.mac",
                                    kSecAttrAccount as String: key,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func write(_ value: String?, key: String) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: "app.getclearframe.mac",
                                    kSecAttrAccount as String: key]
        SecItemDelete(query as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var addition = query
        addition[kSecValueData as String] = data
        SecItemAdd(addition as CFDictionary, nil)
    }
}

@Observable @MainActor
final class AccountSession {
    private let origin = URL(string: "https://getclearframe.app")!
    var email = ""
    var webPro = false
    var signedIn = false
    var busy = false
    var message: String?
    var hasCompletedOnboarding = UserDefaults.standard.bool(forKey: "completedMacOnboarding")

    func finishOnboarding() {
        hasCompletedOnboarding = true
        UserDefaults.standard.set(true, forKey: "completedMacOnboarding")
    }

    func showOnboarding() {
        hasCompletedOnboarding = false
        UserDefaults.standard.set(false, forKey: "completedMacOnboarding")
    }

    func requestLink(email address: String) async {
        busy = true
        defer { busy = false }
        var random = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, random.count, &random) == errSecSuccess else {
            message = "Could not prepare secure sign-in. Try again."
            return
        }
        let verifier = Data(random).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let digest = Data(SHA256.hash(data: Data(verifier.utf8)))
        let challenge = digest.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        do {
            let data = try await post("/api/mac/auth/request", ["email": address, "challenge": challenge])
            let response = try JSONDecoder().decode(MessageResponse.self, from: data)
            SecretStore.write(verifier, key: "pendingVerifier")
            message = response.message
        } catch { message = error.localizedDescription }
    }

    func handle(_ url: URL) async {
        guard url.scheme == "clearframe", url.host == "auth",
              let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "token" })?.value,
              let verifier = SecretStore.read("pendingVerifier") else { return }
        busy = true
        defer { busy = false }
        do {
            let data = try await post("/api/mac/auth/exchange", ["token": token, "verifier": verifier])
            let response = try JSONDecoder().decode(TokenResponse.self, from: data)
            SecretStore.write(response.session, key: "session")
            SecretStore.write(nil, key: "pendingVerifier")
            finishOnboarding()
            await refresh()
            message = signedIn ? "Signed in as \(email)." : "Sign-in could not be completed."
        } catch { message = error.localizedDescription }
    }

    func refresh() async {
        guard let token = SecretStore.read("session") else { signedIn = false; webPro = false; return }
        do {
            var request = URLRequest(url: origin.appending(path: "/api/mac/account"))
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw AccountError.network }
            if http.statusCode == 401 { signOut(); return }
            let account = try JSONDecoder().decode(AccountResponse.self, from: data)
            signedIn = account.signedIn
            email = account.email
            webPro = http.statusCode == 200 ? (account.pro ?? false) : false
            if http.statusCode != 200 { message = account.message }
        } catch {
            webPro = false
            message = "Account status is temporarily unavailable."
        }
    }

    func signOut() {
        SecretStore.write(nil, key: "session")
        signedIn = false
        webPro = false
        email = ""
        message = nil
    }

    private func post(_ path: String, _ body: [String: String]) async throws -> Data {
        var request = URLRequest(url: origin.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AccountError.network }
        guard (200..<300).contains(http.statusCode) else {
            throw AccountError.server((try? JSONDecoder().decode(MessageResponse.self, from: data).message) ?? "Sign-in could not be completed.")
        }
        return data
    }
}

private struct MessageResponse: Decodable { let message: String }
private struct TokenResponse: Decodable { let session: String }
private struct AccountResponse: Decodable { let signedIn: Bool; let email: String; let pro: Bool?; let message: String? }
private enum AccountError: LocalizedError {
    case network, server(String)
    var errorDescription: String? {
        switch self { case .network: "Could not connect to ClearFrame."; case .server(let message): message }
    }
}
