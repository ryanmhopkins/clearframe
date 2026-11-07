import Foundation
import Observation
import StoreKit

@Observable @MainActor
final class ProStore {
    private let monthlyID = Bundle.main.object(forInfoDictionaryKey: "ClearFrameMonthlyProductID") as? String ?? ""
    private let annualID = Bundle.main.object(forInfoDictionaryKey: "ClearFrameAnnualProductID") as? String ?? ""
    var products: [Product] = []
    var hasPro = false
    var busy = false
    var message: String?
    @ObservationIgnored private var updateTask: Task<Void, Never>?

    var configured: Bool { !monthlyID.isEmpty && !annualID.isEmpty }
    func isMonthly(_ product: Product) -> Bool { product.id == monthlyID }

    func start() {
        updateTask?.cancel()
        updateTask = Task {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result { await transaction.finish() }
                await refreshEntitlements()
            }
        }
        Task { await load() }
    }

    func load() async {
        guard configured else { return }
        busy = true
        defer { busy = false }
        do {
            products = try await Product.products(for: [monthlyID, annualID]).sorted {
                $0.id == monthlyID && $1.id != monthlyID
            }
            await refreshEntitlements()
        } catch { message = "App Store products are temporarily unavailable." }
    }

    func refreshEntitlements() async {
        var active = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            if [monthlyID, annualID].contains(transaction.productID) && transaction.revocationDate == nil {
                active = true
            }
        }
        hasPro = active
    }

    func purchase(_ product: Product) async {
        busy = true
        defer { busy = false }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    message = "The App Store could not verify this purchase."
                    return
                }
                await transaction.finish()
                await refreshEntitlements()
                message = hasPro ? "ClearFrame Pro is active on this Mac." : "Purchase is being processed."
            case .pending: message = "Purchase is pending approval."
            case .userCancelled: break
            @unknown default: break
            }
        } catch { message = error.localizedDescription }
    }

    func restore() async {
        busy = true
        defer { busy = false }
        do {
            try await AppStore.sync()
            await refreshEntitlements()
            message = hasPro ? "ClearFrame Pro was restored." : "No active Pro purchase was found for this Apple Account."
        } catch { message = error.localizedDescription }
    }
}
