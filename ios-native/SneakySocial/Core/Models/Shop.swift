import Foundation

// Mirrors the products, basket, delivery and orders modules.

struct Product: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let name: String
    var sku: String?
    var description: String?
    var pricePoints: Int
    var thumbnailURL: String?
    var stockQty: Int = 0
    var leadTimeDays: Int = 0
    var audience: String?
    var media: [ProductMedia] = []

    var inStock: Bool { stockQty > 0 }
    var thumbnail: URL? { APIClient.mediaURL(thumbnailURL) }

    /// Lead time only matters when there's none on the shelf.
    var availability: String {
        if inStock { return "\(stockQty) in stock" }
        if leadTimeDays > 0 { return "Back in about \(leadTimeDays) day\(leadTimeDays == 1 ? "" : "s")" }
        return "Out of stock"
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, sku, description, media, audience
        case pricePoints = "price_points"
        case thumbnailURL = "thumbnail_url"
        case stockQty = "stock_qty"
        case leadTimeDays = "lead_time_days"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Something"
        sku = try c.decodeIfPresent(String.self, forKey: .sku)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        pricePoints = try c.decodeIfPresent(Int.self, forKey: .pricePoints) ?? 0
        thumbnailURL = try c.decodeIfPresent(String.self, forKey: .thumbnailURL)
        stockQty = try c.decodeIfPresent(Int.self, forKey: .stockQty) ?? 0
        leadTimeDays = try c.decodeIfPresent(Int.self, forKey: .leadTimeDays) ?? 0
        audience = try c.decodeIfPresent(String.self, forKey: .audience)
        media = try c.decodeIfPresent([ProductMedia].self, forKey: .media) ?? []
    }
}

struct ProductMedia: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var mediaType: String = "image"
    var urlString: String = ""
    var sortOrder: Int = 0

    var isVideo: Bool { mediaType == "video" }
    var url: URL? { APIClient.mediaURL(urlString) }

    private enum CodingKeys: String, CodingKey {
        case id
        case mediaType = "media_type"
        case urlString = "url"
        case sortOrder = "sort_order"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        mediaType = try c.decodeIfPresent(String.self, forKey: .mediaType) ?? "image"
        urlString = try c.decodeIfPresent(String.self, forKey: .urlString) ?? ""
        sortOrder = try c.decodeIfPresent(Int.self, forKey: .sortOrder) ?? 0
    }
}

struct BasketItem: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let productID: String
    var name: String = ""
    var qty: Int = 0
    var pricePoints: Int = 0
    var lineTotal: Int = 0
    var stockQty: Int = 0
    var thumbnailURL: String?

    var thumbnail: URL? { APIClient.mediaURL(thumbnailURL) }

    private enum CodingKeys: String, CodingKey {
        case id, name, qty
        case productID = "product_id"
        case pricePoints = "price_points"
        case lineTotal = "line_total"
        case stockQty = "stock_qty"
        case thumbnailURL = "thumbnail_url"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        productID = try c.decode(String.self, forKey: .productID)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        qty = try c.decodeIfPresent(Int.self, forKey: .qty) ?? 0
        pricePoints = try c.decodeIfPresent(Int.self, forKey: .pricePoints) ?? 0
        // line_total arrives as a string from some Postgres drivers. `try?` on a
        // decodeIfPresent flattens Int?? to Int?, so these bind non-optionals —
        // a missing key simply leaves the property at its default.
        if let int = try? c.decodeIfPresent(Int.self, forKey: .lineTotal) {
            lineTotal = int
        } else if let text = try? c.decodeIfPresent(String.self, forKey: .lineTotal) {
            lineTotal = Int(text) ?? 0
        }
        stockQty = try c.decodeIfPresent(Int.self, forKey: .stockQty) ?? 0
        thumbnailURL = try c.decodeIfPresent(String.self, forKey: .thumbnailURL)
    }
}

struct DeliveryOption: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var name: String = ""
    var points: Int = 0
    var sortOrder: Int = 0

    private enum CodingKeys: String, CodingKey {
        case id, name, points
        case sortOrder = "sort_order"
    }
}

struct Basket: Codable, Sendable, Equatable {
    var items: [BasketItem] = []
    var subtotalPoints: Int = 0
    var discountPoints: Int = 0
    var deliveryPoints: Int = 0
    var totalPoints: Int = 0
    var itemCount: Int = 0
    var notes: String?
    var delivery: DeliveryOption?

    var isEmpty: Bool { items.isEmpty }

    private enum CodingKeys: String, CodingKey {
        case items, notes, delivery
        case subtotalPoints = "subtotal_points"
        case discountPoints = "discount_points"
        case deliveryPoints = "delivery_points"
        case totalPoints = "total_points"
        case itemCount = "item_count"
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = try c.decodeIfPresent([BasketItem].self, forKey: .items) ?? []
        subtotalPoints = try c.decodeIfPresent(Int.self, forKey: .subtotalPoints) ?? 0
        discountPoints = try c.decodeIfPresent(Int.self, forKey: .discountPoints) ?? 0
        deliveryPoints = try c.decodeIfPresent(Int.self, forKey: .deliveryPoints) ?? 0
        totalPoints = try c.decodeIfPresent(Int.self, forKey: .totalPoints) ?? 0
        itemCount = try c.decodeIfPresent(Int.self, forKey: .itemCount) ?? 0
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        delivery = try? c.decodeIfPresent(DeliveryOption.self, forKey: .delivery)
    }
}

struct Order: Codable, Sendable, Identifiable {
    let id: String
    var status: String = "placed"
    var totalPoints: Int = 0
    var subtotalPoints: Int = 0
    var deliveryPoints: Int = 0
    var discountPoints: Int = 0
    var deliveryName: String?
    var notes: String?
    var createdAt: Date?
    var items: [OrderItem] = []

    private enum CodingKeys: String, CodingKey {
        case id, status, notes, items
        case totalPoints = "total_points"
        case subtotalPoints = "subtotal_points"
        case deliveryPoints = "delivery_points"
        case discountPoints = "discount_points"
        case deliveryName = "delivery_name_snapshot"
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "placed"
        totalPoints = try c.decodeIfPresent(Int.self, forKey: .totalPoints) ?? 0
        subtotalPoints = try c.decodeIfPresent(Int.self, forKey: .subtotalPoints) ?? 0
        deliveryPoints = try c.decodeIfPresent(Int.self, forKey: .deliveryPoints) ?? 0
        discountPoints = try c.decodeIfPresent(Int.self, forKey: .discountPoints) ?? 0
        deliveryName = try c.decodeIfPresent(String.self, forKey: .deliveryName)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        createdAt = try? c.decodeIfPresent(Date.self, forKey: .createdAt)
        items = try c.decodeIfPresent([OrderItem].self, forKey: .items) ?? []
    }
}

struct OrderItem: Codable, Sendable, Identifiable {
    let id: String
    var productName: String = ""
    var qty: Int = 0
    var lineTotalPoints: Int = 0

    private enum CodingKeys: String, CodingKey {
        case id, qty
        case productName = "product_name"
        case lineTotalPoints = "line_total_points"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        productName = try c.decodeIfPresent(String.self, forKey: .productName) ?? ""
        qty = try c.decodeIfPresent(Int.self, forKey: .qty) ?? 0
        lineTotalPoints = try c.decodeIfPresent(Int.self, forKey: .lineTotalPoints) ?? 0
    }
}

struct AddToBasketRequest: Encodable, Sendable {
    let productId: String
    let qty: Int
}

struct QuantityRequest: Encodable, Sendable {
    let qty: Int
}

struct DeliveryRequest: Encodable, Sendable {
    let deliveryOptionID: String?
    private enum CodingKeys: String, CodingKey { case deliveryOptionID = "delivery_option_id" }
}

struct NotesRequest: Encodable, Sendable {
    let notes: String?
}
