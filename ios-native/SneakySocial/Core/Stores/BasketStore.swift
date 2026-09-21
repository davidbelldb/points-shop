import Foundation
import Observation

/// The basket, shared across the shop screens so the tab badge, the product
/// page and the basket itself never disagree.
@MainActor
@Observable
final class BasketStore {
    private(set) var basket = Basket()
    private(set) var deliveryOptions: [DeliveryOption] = []
    private(set) var isWorking = false
    var errorMessage: String?

    /// Set when an order goes through, so the confirmation can be shown.
    var lastOrder: Order?

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    var itemCount: Int { basket.itemCount }

    func refresh() async {
        if let loaded = try? await api.get("/basket", as: Basket.self) {
            basket = loaded
        }
        if deliveryOptions.isEmpty,
           let options = try? await api.get("/delivery-options", as: [DeliveryOption].self) {
            deliveryOptions = options
        }
    }

    func add(_ product: Product, qty: Int = 1) async {
        await mutate {
            try await self.api.post(
                "/basket/items",
                body: AddToBasketRequest(productId: product.id, qty: qty),
                as: Basket.self
            )
        }
        Haptics.success()
    }

    func setQuantity(_ qty: Int, for item: BasketItem) async {
        await mutate {
            try await self.api.patch(
                "/basket/items/\(item.productID)",
                body: QuantityRequest(qty: qty),
                as: Basket.self
            )
        }
    }

    func remove(_ item: BasketItem) async {
        await mutate {
            try await self.api.delete("/basket/items/\(item.productID)", as: Basket.self)
        }
    }

    func chooseDelivery(_ option: DeliveryOption?) async {
        await mutate {
            try await self.api.patch(
                "/basket/delivery",
                body: DeliveryRequest(deliveryOptionID: option?.id),
                as: Basket.self
            )
        }
    }

    func setNotes(_ notes: String) async {
        await mutate {
            try await self.api.patch(
                "/basket/notes",
                body: NotesRequest(notes: notes.isEmpty ? nil : notes),
                as: Basket.self
            )
        }
    }

    /// Places the order and empties the basket. Returns the order so the caller
    /// can show a confirmation.
    @discardableResult
    func placeOrder() async -> Order? {
        guard !isWorking, !basket.isEmpty else { return nil }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            let order = try await api.post("/orders", as: Order.self)
            lastOrder = order
            basket = Basket()
            Haptics.success()
            return order
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failure()
            return nil
        }
    }

    private func mutate(_ work: @escaping () async throws -> Basket) async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }

        do {
            basket = try await work()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.warning()
        }
    }
}
