import Foundation

/// Mirrors `publicUser()` in backend/src/modules/auth/auth.routes.js.
struct Account: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let username: String
    var role: String = "user"
    var name: String?
    var email: String?
    var photoURL: String?
    var pointsBalance: Int = 0
    var actualID: String?
    var actualUsername: String?
    var actualRole: String?
    var impersonating: Bool = false

    var isAdmin: Bool { (actualRole ?? role) == "admin" }
    var displayName: String {
        if let name, !name.isEmpty { return name }
        return username
    }
    var photo: URL? { APIClient.mediaURL(photoURL) }

    private enum CodingKeys: String, CodingKey {
        case id, username, role, name, email
        case photoURL = "photo_url"
        case pointsBalance = "points_balance"
        case actualID = "actual_id"
        case actualUsername = "actual_username"
        case actualRole = "actual_role"
        case impersonating
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decode(String.self, forKey: .username)
        role = try c.decodeIfPresent(String.self, forKey: .role) ?? "user"
        name = try c.decodeIfPresent(String.self, forKey: .name)
        email = try c.decodeIfPresent(String.self, forKey: .email)
        photoURL = try c.decodeIfPresent(String.self, forKey: .photoURL)
        pointsBalance = try c.decodeIfPresent(Int.self, forKey: .pointsBalance) ?? 0
        actualID = try c.decodeIfPresent(String.self, forKey: .actualID)
        actualUsername = try c.decodeIfPresent(String.self, forKey: .actualUsername)
        actualRole = try c.decodeIfPresent(String.self, forKey: .actualRole)
        impersonating = try c.decodeIfPresent(Bool.self, forKey: .impersonating) ?? false
    }
}

struct LoginRequest: Encodable, Sendable {
    let username: String
    let password: String
}
