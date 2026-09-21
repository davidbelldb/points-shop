import Foundation
import Observation

/// Wording the server owns, so the same screen can say "safe pocket" for David
/// and "basket" for George. Every lookup has a sensible fallback, so a missing
/// key never renders as an empty label.
@MainActor
@Observable
final class AppCopy {
    private(set) var values: [String: String] = [:]

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func load() async {
        if let settings = try? await api.get("/settings", as: [String: String?].self) {
            values = settings.compactMapValues { $0 }
        }
    }

    private func string(_ key: String, _ fallback: String) -> String {
        let value = values[key]?.trimmingCharacters(in: .whitespaces)
        return (value?.isEmpty == false) ? value! : fallback
    }

    var shopName: String { string("shop_name", "Sneaky Points") }
    var heroTitle: String { string("hero_title", "Welcome") }
    var heroSubtitle: String { string("hero_subtitle", "") }
    var productsTitle: String { string("products_title", "Latest products") }
    var basketLabel: String { string("basket_label", "basket") }
    var basketAddLabel: String { string("basket_add_label", "Add to basket") }
    var basketEmptyText: String { string("basket_empty_text", "Nothing in here yet.") }
    var checkoutLabel: String { string("checkout_label", "Place order") }
    var orderDoneText: String { string("order_done_text", "Order placed.") }

    /// "Katie's basket" — the label is lower-case in settings so it can be
    /// possessive like this, and capitalised where it stands alone.
    func basketTitle(for name: String?) -> String {
        guard let name, !name.isEmpty else { return basketLabel.capitalisedFirst }
        return "\(name)'s \(basketLabel)"
    }
}

extension String {
    var capitalisedFirst: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}
