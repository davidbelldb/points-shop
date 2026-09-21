import Foundation

// Mirrors backend/src/modules/games/ducky.routes.js.
//
// The server decides the whole race up front: who wins, every duck's finish
// time, and an `at`-sorted list of obstacles per duck. Pauses and leaps are
// already baked into `finishMs`, so the client is a pure replay engine.

struct Duck: Codable, Sendable, Identifiable, Equatable {
    let ord: Int
    let name: String
    var duckColour: String?
    var billColour: String?
    var oddsNum: Int
    var oddsDen: Int
    var active: Bool = true

    var id: Int { ord }

    /// Fractional odds as shown in the picker: "3/1".
    var oddsLabel: String { "\(oddsNum)/\(oddsDen)" }

    /// Total return multiplier — stake × (num/den + 1).
    var oddsMultiplier: Double { Double(oddsNum) / Double(oddsDen) + 1 }

    func potentialReturn(stake: Int) -> Int {
        Int((Double(stake) * oddsMultiplier).rounded())
    }

    private enum CodingKeys: String, CodingKey {
        case ord, name
        case duckColour = "duck_colour"
        case billColour = "bill_colour"
        case oddsNum = "odds_num"
        case oddsDen = "odds_den"
        case active
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ord = try c.decode(Int.self, forKey: .ord)
        active = try c.decodeIfPresent(Bool.self, forKey: .active) ?? true
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Duck \(ord)"
        duckColour = try c.decodeIfPresent(String.self, forKey: .duckColour)
        billColour = try c.decodeIfPresent(String.self, forKey: .billColour)
        oddsNum = try c.decodeIfPresent(Int.self, forKey: .oddsNum) ?? 1
        oddsDen = try c.decodeIfPresent(Int.self, forKey: .oddsDen) ?? 1
    }
}

/// One obstacle in a duck's course. `at` is a fraction of the course (0…1).
struct Obstacle: Codable, Sendable, Equatable {
    enum Kind: String, Codable, Sendable {
        case whirl, buoy, pad, iceberg
    }

    enum Outcome: String, Codable, Sendable {
        case drown, boost
    }

    let kind: Kind
    let at: Double
    var durationMs: Double = 0
    var loops: Int = 0
    var colour: String?
    var fromTop: Bool = false
    var boost: Double = 0
    var boostMs: Double = 0
    var outcome: Outcome?

    /// Pads and boosting icebergs move the duck forward; everything else stalls it.
    var isBoost: Bool { kind == .pad || (kind == .iceberg && outcome == .boost) }

    private enum CodingKeys: String, CodingKey {
        case kind, at, durationMs, loops, colour, fromTop, boost, boostMs, outcome
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = (try? c.decode(Kind.self, forKey: .kind)) ?? .whirl
        at = try c.decodeIfPresent(Double.self, forKey: .at) ?? 0
        durationMs = try c.decodeIfPresent(Double.self, forKey: .durationMs) ?? 0
        loops = try c.decodeIfPresent(Int.self, forKey: .loops) ?? 0
        colour = try c.decodeIfPresent(String.self, forKey: .colour)
        fromTop = try c.decodeIfPresent(Bool.self, forKey: .fromTop) ?? false
        boost = try c.decodeIfPresent(Double.self, forKey: .boost) ?? 0
        boostMs = try c.decodeIfPresent(Double.self, forKey: .boostMs) ?? 0
        outcome = try c.decodeIfPresent(Outcome.self, forKey: .outcome)
    }

    /// Memberwise init kept for tests and previews.
    init(kind: Kind, at: Double, durationMs: Double = 0, loops: Int = 0,
         colour: String? = nil, fromTop: Bool = false,
         boost: Double = 0, boostMs: Double = 0, outcome: Outcome? = nil) {
        self.kind = kind
        self.at = at
        self.durationMs = durationMs
        self.loops = loops
        self.colour = colour
        self.fromTop = fromTop
        self.boost = boost
        self.boostMs = boostMs
        self.outcome = outcome
    }
}

/// A line of admin-editable text (banner, phrase, commentary, intro).
struct DuckyTextRow: Codable, Sendable, Identifiable, Equatable {
    let ord: Int
    var text: String = ""
    var active: Bool = false
    var placement: String?
    var colour: String?

    var id: Int { ord }
    var isUsable: Bool { active && !text.trimmingCharacters(in: .whitespaces).isEmpty }
    var isBottomBanner: Bool { (placement ?? "top") == "bottom" }

    private enum CodingKeys: String, CodingKey { case ord, text, active, placement, colour }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ord = try c.decode(Int.self, forKey: .ord)
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        active = try c.decodeIfPresent(Bool.self, forKey: .active) ?? false
        placement = try c.decodeIfPresent(String.self, forKey: .placement)
        colour = try c.decodeIfPresent(String.self, forKey: .colour)
    }
}

/// Which set of words the derby speaks. The ducks, odds, form and race maths
/// are shared — only the content differs, so both apps race the same field.
enum DuckyVariant: String, Codable, Sendable, CaseIterable, Identifiable {
    /// What the Capacitor app has always shown.
    case original
    /// The kid-friendly set this app plays.
    case kids

    var id: String { rawValue }

    var title: String {
        switch self {
        case .original: "Original"
        case .kids: "Kid-friendly"
        }
    }

    /// The variant this app races with.
    static let app: DuckyVariant = .kids

    var query: String { "?variant=\(rawValue)" }
}

struct DuckyConfig: Codable, Sendable, Equatable {
    /// Defaults to original: an older backend that doesn't echo a variant is,
    /// by definition, serving the original content.
    var variant: DuckyVariant = .original
    var waterColour: String?
    var grassColour: String?
    var mudColour: String?
    var buoyColour: String?
    var buoyCount: Int = 4
    var raceDuckCount: Int = 10
    var icebergEnabled: Bool = false
    var icebergSize: Int = 7
    var icebergSizeMin: Int = 2
    var icebergCount: Int = 3

    var ducks: [Duck] = []
    var banners: [DuckyTextRow] = []
    var phrases: [DuckyTextRow] = []
    var commentary: [DuckyTextRow] = []
    var intro: [DuckyTextRow] = []
    var nightPhrases: [DuckyTextRow] = []
    var nightCommentary: [DuckyTextRow] = []
    var nightIntro: [DuckyTextRow] = []

    func phrases(night: Bool) -> [String] {
        (night ? nightPhrases : phrases).filter(\.isUsable).map(\.text)
    }

    func commentary(night: Bool) -> [String] {
        (night ? nightCommentary : commentary).filter(\.isUsable).map(\.text)
    }

    func intro(night: Bool) -> [String] {
        (night ? nightIntro : intro).filter(\.isUsable).map(\.text)
    }

    private enum CodingKeys: String, CodingKey {
        case waterColour = "water_colour"
        case grassColour = "grass_colour"
        case mudColour = "mud_colour"
        case buoyColour = "buoy_colour"
        case buoyCount = "buoy_count"
        case raceDuckCount = "race_duck_count"
        case icebergEnabled = "iceberg_enabled"
        case icebergSize = "iceberg_size"
        case icebergSizeMin = "iceberg_size_min"
        case icebergCount = "iceberg_count"
        case variant
        case ducks, banners, phrases, commentary, intro
        case nightPhrases = "night_phrases"
        case nightCommentary = "night_commentary"
        case nightIntro = "night_intro"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        variant = (try? c.decode(DuckyVariant.self, forKey: .variant)) ?? .original
        waterColour = try c.decodeIfPresent(String.self, forKey: .waterColour)
        grassColour = try c.decodeIfPresent(String.self, forKey: .grassColour)
        mudColour = try c.decodeIfPresent(String.self, forKey: .mudColour)
        buoyColour = try c.decodeIfPresent(String.self, forKey: .buoyColour)
        buoyCount = try c.decodeIfPresent(Int.self, forKey: .buoyCount) ?? 4
        raceDuckCount = try c.decodeIfPresent(Int.self, forKey: .raceDuckCount) ?? 10
        icebergEnabled = try c.decodeIfPresent(Bool.self, forKey: .icebergEnabled) ?? false
        icebergSize = try c.decodeIfPresent(Int.self, forKey: .icebergSize) ?? 7
        icebergSizeMin = try c.decodeIfPresent(Int.self, forKey: .icebergSizeMin) ?? 2
        icebergCount = try c.decodeIfPresent(Int.self, forKey: .icebergCount) ?? 3
        ducks = try c.decodeIfPresent([Duck].self, forKey: .ducks) ?? []
        banners = try c.decodeIfPresent([DuckyTextRow].self, forKey: .banners) ?? []
        phrases = try c.decodeIfPresent([DuckyTextRow].self, forKey: .phrases) ?? []
        commentary = try c.decodeIfPresent([DuckyTextRow].self, forKey: .commentary) ?? []
        intro = try c.decodeIfPresent([DuckyTextRow].self, forKey: .intro) ?? []
        nightPhrases = try c.decodeIfPresent([DuckyTextRow].self, forKey: .nightPhrases) ?? []
        nightCommentary = try c.decodeIfPresent([DuckyTextRow].self, forKey: .nightCommentary) ?? []
        nightIntro = try c.decodeIfPresent([DuckyTextRow].self, forKey: .nightIntro) ?? []
    }
}

struct DuckyLineup: Decodable, Sendable {
    let lineupID: String
    let ducks: [Duck]
    let balance: Int

    private enum CodingKeys: String, CodingKey {
        case lineupID = "lineup_id"
        case ducks, balance
    }
}

struct DuckySink: Sendable, Equatable {
    let ord: Int
    let at: Double
}

struct DuckyRaceResult: Decodable, Sendable {
    let winnerOrd: Int
    let ducks: [Duck]
    let pickedOrd: Int
    let stake: Int
    let won: Bool
    let payout: Int
    let balance: Int
    let oddsNum: Int
    let oddsDen: Int

    /// Keyed by duck ord — JSON object keys arrive as strings.
    let finishMs: [Int: Double]
    let obstacles: [Int: [Obstacle]]
    let sink: DuckySink?

    private enum CodingKeys: String, CodingKey {
        case winnerOrd = "winner_ord"
        case finishMs = "finish_ms"
        case obstacles = "whirlpools"
        case sink, ducks, stake, won, payout, balance
        case pickedOrd = "picked_ord"
        case oddsNum = "odds_num"
        case oddsDen = "odds_den"
    }

    private struct RawSink: Decodable { let ord: Int; let at: Double }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        winnerOrd = try c.decode(Int.self, forKey: .winnerOrd)
        ducks = try c.decode([Duck].self, forKey: .ducks)
        pickedOrd = try c.decodeIfPresent(Int.self, forKey: .pickedOrd) ?? 0
        stake = try c.decodeIfPresent(Int.self, forKey: .stake) ?? 0
        won = try c.decodeIfPresent(Bool.self, forKey: .won) ?? false
        payout = try c.decodeIfPresent(Int.self, forKey: .payout) ?? 0
        balance = try c.decodeIfPresent(Int.self, forKey: .balance) ?? 0
        oddsNum = try c.decodeIfPresent(Int.self, forKey: .oddsNum) ?? 1
        oddsDen = try c.decodeIfPresent(Int.self, forKey: .oddsDen) ?? 1

        let rawFinish = try c.decodeIfPresent([String: Double].self, forKey: .finishMs) ?? [:]
        finishMs = Dictionary(uniqueKeysWithValues: rawFinish.compactMap { key, value in
            Int(key).map { ($0, value) }
        })

        let rawObstacles = try c.decodeIfPresent([String: [Obstacle]].self, forKey: .obstacles) ?? [:]
        obstacles = Dictionary(uniqueKeysWithValues: rawObstacles.compactMap { key, value in
            Int(key).map { ($0, value.sorted { $0.at < $1.at }) }
        })

        if let raw = try? c.decodeIfPresent(RawSink.self, forKey: .sink) {
            sink = DuckySink(ord: raw.ord, at: raw.at)
        } else {
            sink = nil
        }
    }

    func obstacles(for ord: Int) -> [Obstacle] { obstacles[ord] ?? [] }
    func finish(for ord: Int) -> Double { finishMs[ord] ?? 0 }
    func duck(_ ord: Int) -> Duck? { ducks.first { $0.ord == ord } }
}

/// A duck's recent finishing positions. 1 = won, 2…n = placed, 0 = DNF (sank).
struct DuckForm: Decodable, Sendable {
    var runs: Int = 0
    var wins: Int = 0
    var recent: [Int] = []
}

struct DuckyBetRequest: Encodable, Sendable {
    let lineupID: String
    let pickedOrd: Int
    let stake: Int

    private enum CodingKeys: String, CodingKey {
        case lineupID = "lineup_id"
        case pickedOrd = "picked_ord"
        case stake
    }
}
