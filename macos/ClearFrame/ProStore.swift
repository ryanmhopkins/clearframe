import Foundation
import StoreKit

/// StoreKit 2 boundary. Configure the App Store Connect product ID before enabling purchases.
@MainActor
final class ProStore: ObservableObject {
    @Published private(set) var product: Product?
    @Published private(set) var hasPro = false

    private let productID = Bundle.main.object(forInfoDictionaryKey: "ClearFrameProProductID") as? String ?? ""

    func refresh() async throws {
        guard !productID.isEmpty else { return }
        product = try await Product.products(for: [productID]).first
        hasPro = await Transaction.currentEntitlements.contains { result in
            guard case .verified(let transaction) = result else { return false }
            return transaction.productID == productID && transaction.revocationDate == nil
        }
    }

    func purchase() async throws {
        guard let product else { return }
        let result = try await product.purchase()
        if case .success(let verification) = result, case .verified(let transaction) = verification {
            await transaction.finish()
            try await refresh()
        }
    }
}
