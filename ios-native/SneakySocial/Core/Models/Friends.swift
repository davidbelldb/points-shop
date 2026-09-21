import Foundation

/// One side of a friendship, as `GET /api/friends` returns it.
///
/// `id` is the *other* person's account id — the thing you message. The
/// friendship's own id is separate, and is what you answer or cancel with.
struct FriendEntry: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    var friendshipID: String?
    var status: String?
    var requestedBy: String?
    var requestedAt: Date?
    var username: String?
    var name: String?
    var photoURL: String?
    var role: String?

    var displayName: String {
        if let name, !name.isEmpty { return name }
        return username ?? "Someone"
    }

    var photo: URL? { APIClient.mediaURL(photoURL) }

    /// Accepted by the other person, but a grown-up still has to agree —
    /// because one of the two accounts belongs to a child.
    var waitingOnAnAdult: Bool { status == "awaiting_approval" }

    private enum CodingKeys: String, CodingKey {
        case id, username, name, role, status
        case friendshipID = "friendship_id"
        case requestedBy = "requested_by"
        case requestedAt = "requested_at"
        case photoURL = "photo_url"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        friendshipID = try c.decodeIfPresent(String.self, forKey: .friendshipID)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        requestedBy = try c.decodeIfPresent(String.self, forKey: .requestedBy)
        requestedAt = try c.decodeIfPresent(Date.self, forKey: .requestedAt)
        username = try c.decodeIfPresent(String.self, forKey: .username)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        photoURL = try c.decodeIfPresent(String.self, forKey: .photoURL)
        role = try c.decodeIfPresent(String.self, forKey: .role)
    }
}

struct FriendsResponse: Decodable, Sendable {
    var friends: [FriendEntry] = []
    var incoming: [FriendEntry] = []
    var outgoing: [FriendEntry] = []
    var suggestions: [FriendEntry] = []
}

/// A friendship waiting on an admin, for the approvals screen.
struct FriendApproval: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    var requestedAt: Date?
    var aName: String?
    var aUsername: String?
    var aAudience: String?
    var bName: String?
    var bUsername: String?
    var bAudience: String?

    var pairDescription: String {
        "\(aName ?? aUsername ?? "Someone") and \(bName ?? bUsername ?? "someone")"
    }

    private enum CodingKeys: String, CodingKey {
        case id = "friendship_id"
        case requestedAt = "requested_at"
        case aName = "a_name", aUsername = "a_username", aAudience = "a_audience"
        case bName = "b_name", bUsername = "b_username", bAudience = "b_audience"
    }
}

struct FriendApprovalsResponse: Decodable, Sendable {
    let approvals: [FriendApproval]
}
