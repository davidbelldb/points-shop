import Foundation

// MARK: - Partners

/// Someone you can talk to, as `GET /api/messages/partners` returns them.
struct ChatPartner: Codable, Sendable, Identifiable, Equatable, Hashable {
    let id: String
    var username: String?
    var name: String?
    var photoURL: String?
    var role: String?
    var unread: Int = 0
    var lastBody: String?
    var lastAt: Date?
    var lastSenderID: String?

    var displayName: String {
        if let name, !name.isEmpty { return name }
        return username ?? "Someone"
    }

    var photo: URL? { APIClient.mediaURL(photoURL) }

    /// The conversation-list preview, with the wordless bodies spelled out.
    var preview: String? {
        guard let lastBody, !lastBody.isEmpty else { return nil }
        if let system = SystemMessage(body: lastBody) { return system.line }
        if lastBody.hasPrefix(ChatMessage.secretPrefix) { return "A secret" }
        if lastBody.hasPrefix(ChatMessage.pollPrefix) { return "A poll" }
        return lastBody
    }

    private enum CodingKeys: String, CodingKey {
        case id, username, name, role, unread
        case photoURL = "photo_url"
        case lastBody = "last_body"
        case lastAt = "last_at"
        case lastSenderID = "last_sender_id"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decodeIfPresent(String.self, forKey: .username)
        name = try c.decodeIfPresent(String.self, forKey: .name)
        role = try c.decodeIfPresent(String.self, forKey: .role)
        unread = try c.decodeIfPresent(Int.self, forKey: .unread) ?? 0
        photoURL = try c.decodeIfPresent(String.self, forKey: .photoURL)
        lastBody = try c.decodeIfPresent(String.self, forKey: .lastBody)
        lastAt = try c.decodeIfPresent(Date.self, forKey: .lastAt)
        lastSenderID = try c.decodeIfPresent(String.self, forKey: .lastSenderID)
    }
}

struct PartnersResponse: Decodable, Sendable {
    let partners: [ChatPartner]
}

// MARK: - Chat

/// One row of `chat_messages`. Only the fields the native thread draws are
/// decoded — the payload carries a good deal more (story replies, slider
/// responses) that the web app renders and this doesn't, yet.
struct ChatMessage: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let senderID: String
    let recipientID: String
    let body: String
    var createdAt: Date
    var readAt: Date?
    var editedAt: Date?
    var reaction: String?
    var sparkled: Bool = false
    var secretRevealedAt: Date?
    var senderName: String?
    var replyToBody: String?
    var replyToSenderName: String?

    static let secretPrefix = "__secret__:"
    static let pollPrefix = "__poll__:"

    private enum CodingKeys: String, CodingKey {
        case id, body, reaction, sparkled
        case senderID = "sender_id"
        case recipientID = "recipient_id"
        case createdAt = "created_at"
        case readAt = "read_at"
        case editedAt = "edited_at"
        case secretRevealedAt = "secret_revealed_at"
        case senderName = "sender_name"
        case replyToBody = "reply_to_body"
        case replyToSenderName = "reply_to_sender_name"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        senderID = try c.decode(String.self, forKey: .senderID)
        recipientID = try c.decode(String.self, forKey: .recipientID)
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt) ?? .now
        readAt = try c.decodeIfPresent(Date.self, forKey: .readAt)
        editedAt = try c.decodeIfPresent(Date.self, forKey: .editedAt)
        reaction = try c.decodeIfPresent(String.self, forKey: .reaction)
        sparkled = try c.decodeIfPresent(Bool.self, forKey: .sparkled) ?? false
        secretRevealedAt = try c.decodeIfPresent(Date.self, forKey: .secretRevealedAt)
        senderName = try c.decodeIfPresent(String.self, forKey: .senderName)
        replyToBody = try c.decodeIfPresent(String.self, forKey: .replyToBody)
        replyToSenderName = try c.decodeIfPresent(String.self, forKey: .replyToSenderName)
    }

    /// What this message actually is. The backend keeps every kind in one TEXT
    /// column behind a prefix, so the shape is worked out here rather than by a
    /// type column that doesn't exist.
    var kind: Kind {
        if let system = SystemMessage(body: body) { return .system(system) }
        if body.hasPrefix(Self.secretPrefix) {
            return .secret(String(body.dropFirst(Self.secretPrefix.count)),
                           revealed: secretRevealedAt != nil)
        }
        if body.hasPrefix(Self.pollPrefix),
           let poll = Poll(json: String(body.dropFirst(Self.pollPrefix.count))) {
            return .poll(poll)
        }
        return .text(body)
    }

    enum Kind: Sendable {
        case text(String)
        case secret(String, revealed: Bool)
        case poll(Poll)
        case system(SystemMessage)
    }

    struct Poll: Sendable, Equatable {
        var question: String
        var options: [String]

        init?(json: String) {
            guard let data = json.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let question = object["question"] as? String
            else { return nil }
            self.question = question
            self.options = (object["options"] as? [String]) ?? []
        }
    }
}

/// The wordless ones: a nudge, or something thrown at the other person's screen.
enum SystemMessage: String, Sendable, CaseIterable {
    case nudge = "__nudge__"
    case twirl = "__rain_twirl__"
    case popcorn = "__rain_popcorn__"
    case duck = "__rain_duck__"

    init?(body: String) {
        self.init(rawValue: body.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    var line: String {
        switch self {
        case .nudge: "a nudge"
        case .twirl: "a shower of sparkles"
        case .popcorn: "a shower of popcorn"
        case .duck: "a shower of ducks"
        }
    }

    var symbol: String {
        switch self {
        case .nudge: "hand.tap.fill"
        case .twirl: "sparkles"
        case .popcorn: "popcorn.fill"
        case .duck: "bird.fill"
        }
    }
}

struct ChatThreadResponse: Decodable, Sendable {
    let other: ChatPartner?
    let messages: [ChatMessage]
}

struct SendMessageRequest: Encodable, Sendable {
    let body: String
    let recipient_id: String?
}

// MARK: - Scrolls

/// A crow-borne scroll, from `GET /api/scrolls/thread`. `body` is withheld by
/// the server until the crow lands, so an in-flight bubble genuinely has
/// nothing to give away early.
struct ScrollMessage: Codable, Sendable, Identifiable, Equatable {
    let id: String
    let senderID: String
    let recipientID: String
    var body: String?
    var originLabel: String?
    var destLabel: String?
    var sentAt: Date
    var deliverAt: Date
    var flightSeconds: Int = 0
    var delivered: Bool = false
    var readAt: Date?
    var senderName: String?

    /// Landed as far as the server knows. The bubble watches the clock as well,
    /// so it doesn't sit there waiting for the next poll.
    var hasArrived: Bool { delivered || deliverAt <= .now }

    /// When the crow left. `flight_seconds` is the authority; `sent_at` is the
    /// in-world stamp and can differ.
    var departedAt: Date { deliverAt.addingTimeInterval(-Double(flightSeconds)) }

    private enum CodingKeys: String, CodingKey {
        case id, body, delivered
        case senderID = "sender_id"
        case recipientID = "recipient_id"
        case originLabel = "origin_label"
        case destLabel = "dest_label"
        case sentAt = "sent_at"
        case deliverAt = "deliver_at"
        case flightSeconds = "flight_seconds"
        case readAt = "read_at"
        case senderName = "sender_name"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        senderID = try c.decode(String.self, forKey: .senderID)
        recipientID = try c.decode(String.self, forKey: .recipientID)
        body = try c.decodeIfPresent(String.self, forKey: .body)
        originLabel = try c.decodeIfPresent(String.self, forKey: .originLabel)
        destLabel = try c.decodeIfPresent(String.self, forKey: .destLabel)
        sentAt = try c.decodeIfPresent(Date.self, forKey: .sentAt) ?? .now
        deliverAt = try c.decodeIfPresent(Date.self, forKey: .deliverAt) ?? .now
        flightSeconds = try c.decodeIfPresent(Int.self, forKey: .flightSeconds) ?? 0
        delivered = try c.decodeIfPresent(Bool.self, forKey: .delivered) ?? false
        readAt = try c.decodeIfPresent(Date.self, forKey: .readAt)
        senderName = try c.decodeIfPresent(String.self, forKey: .senderName)
    }
}

struct ScrollThreadResponse: Decodable, Sendable {
    let other: ChatPartner?
    let scrolls: [ScrollMessage]
}

// MARK: - The flight behind a crow

/// One crow's journey, as `GET /api/scrolls/:id/flight` describes it — the same
/// object the web crow tracker and the Live Activity are built from. Progress is
/// purely time-based: the crow flies a straight line, as the crow flies.
struct CrowFlight: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    var originLabel: String?
    var destLabel: String?
    var arrived: Bool = false
    var originLat: Double = 0
    var originLng: Double = 0
    var destLat: Double = 0
    var destLng: Double = 0
    var currentLat: Double = 0
    var currentLng: Double = 0
    var progress: Double = 0
    var etaMinutes: Int = 0
    var distanceKm: Double = 0
    var message: String = ""
    /// One line per waypoint, swapped in as the crow passes each mark.
    var narration: [String] = []
    var narrationMarks: [Double] = []
    var startedAt: Date = .now
    var arrivesAt: Date = .now

    /// The narration line for a given progress, matching how the Live Activity
    /// steps through them.
    func line(at progress: Double) -> String {
        guard !narration.isEmpty else { return message }
        var current = message
        for (index, mark) in narrationMarks.enumerated() where progress >= mark {
            if index < narration.count { current = narration[index] }
        }
        return current
    }

    private enum CodingKeys: String, CodingKey {
        case id, arrived, progress, message, narration
        case originLabel = "origin_label"
        case destLabel = "dest_label"
        case originLat = "origin_lat"
        case originLng = "origin_lng"
        case destLat = "dest_lat"
        case destLng = "dest_lng"
        case currentLat = "current_lat"
        case currentLng = "current_lng"
        case etaMinutes = "eta_minutes"
        case distanceKm = "distance_km"
        case narrationMarks = "narration_marks"
        case startedAt = "started_at"
        case arrivesAt = "arrives_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        originLabel = try c.decodeIfPresent(String.self, forKey: .originLabel)
        destLabel = try c.decodeIfPresent(String.self, forKey: .destLabel)
        arrived = try c.decodeIfPresent(Bool.self, forKey: .arrived) ?? false
        originLat = try c.decodeIfPresent(Double.self, forKey: .originLat) ?? 0
        originLng = try c.decodeIfPresent(Double.self, forKey: .originLng) ?? 0
        destLat = try c.decodeIfPresent(Double.self, forKey: .destLat) ?? 0
        destLng = try c.decodeIfPresent(Double.self, forKey: .destLng) ?? 0
        currentLat = try c.decodeIfPresent(Double.self, forKey: .currentLat) ?? 0
        currentLng = try c.decodeIfPresent(Double.self, forKey: .currentLng) ?? 0
        progress = try c.decodeIfPresent(Double.self, forKey: .progress) ?? 0
        etaMinutes = try c.decodeIfPresent(Int.self, forKey: .etaMinutes) ?? 0
        distanceKm = try c.decodeIfPresent(Double.self, forKey: .distanceKm) ?? 0
        message = try c.decodeIfPresent(String.self, forKey: .message) ?? ""
        narration = try c.decodeIfPresent([String].self, forKey: .narration) ?? []
        narrationMarks = try c.decodeIfPresent([Double].self, forKey: .narrationMarks) ?? []
        startedAt = try c.decodeIfPresent(Date.self, forKey: .startedAt) ?? .now
        arrivesAt = try c.decodeIfPresent(Date.self, forKey: .arrivesAt) ?? .now
    }
}

struct CrowFlightResponse: Decodable, Sendable {
    let flight: CrowFlight
}

// MARK: - The merged thread

/// Chat and crows in one timeline. A scroll takes its place when it was sent,
/// not when it lands — so the in-flight bubble sits where it belongs and opens
/// where you're already looking.
enum ThreadEntry: Identifiable, Sendable {
    case chat(ChatMessage)
    case scroll(ScrollMessage)

    var id: String {
        switch self {
        case .chat(let message): "chat-\(message.id)"
        case .scroll(let scroll): "scroll-\(scroll.id)"
        }
    }

    var sortDate: Date {
        switch self {
        case .chat(let message): message.createdAt
        case .scroll(let scroll): scroll.sentAt
        }
    }

    var senderID: String {
        switch self {
        case .chat(let message): message.senderID
        case .scroll(let scroll): scroll.senderID
        }
    }
}
