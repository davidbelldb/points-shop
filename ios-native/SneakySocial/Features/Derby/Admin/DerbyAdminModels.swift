import Foundation

/// Partial updates for the admin endpoints. Optionals that stay nil are left out
/// by the encoder, which is exactly what the PATCH handlers expect — they only
/// touch the keys present in the body.

struct DuckyConfigPatch: Encodable, Sendable {
    var waterColour: String?
    var grassColour: String?
    var mudColour: String?
    var buoyColour: String?
    var raceDuckCount: Int?
    var buoyCount: Int?
    var icebergEnabled: Bool?
    var icebergSize: Int?
    var icebergSizeMin: Int?
    var icebergCount: Int?

    enum CodingKeys: String, CodingKey {
        case waterColour = "water_colour"
        case grassColour = "grass_colour"
        case mudColour = "mud_colour"
        case buoyColour = "buoy_colour"
        case raceDuckCount = "race_duck_count"
        case buoyCount = "buoy_count"
        case icebergEnabled = "iceberg_enabled"
        case icebergSize = "iceberg_size"
        case icebergSizeMin = "iceberg_size_min"
        case icebergCount = "iceberg_count"
    }
}

struct DuckPatch: Encodable, Sendable {
    var name: String?
    var duckColour: String?
    var billColour: String?
    var oddsNum: Int?
    var oddsDen: Int?
    var active: Bool?

    enum CodingKeys: String, CodingKey {
        case name, active
        case duckColour = "duck_colour"
        case billColour = "bill_colour"
        case oddsNum = "odds_num"
        case oddsDen = "odds_den"
    }
}

struct TextRowPatch: Encodable, Sendable {
    var text: String?
    var active: Bool?
    var placement: String?
    var colour: String?
}

/// Every admin-editable list of lines, with the endpoint and row count the
/// backend will accept for it.
enum DuckyTextList: String, CaseIterable, Identifiable, Sendable {
    case banners, phrases, commentary, intro
    case nightPhrases, nightCommentary, nightIntro

    var id: String { rawValue }

    var title: String {
        switch self {
        case .banners: "Bank banners"
        case .phrases: "Duck speech phrases"
        case .commentary: "Race commentary"
        case .intro: "Pre-race intro"
        case .nightPhrases: "Night — speech phrases"
        case .nightCommentary: "Night — race commentary"
        case .nightIntro: "Night — pre-race intro"
        }
    }

    var rowLabel: String {
        switch self {
        case .banners: "Banner"
        case .phrases: "Phrase"
        case .commentary: "Line"
        case .intro: "Intro"
        case .nightPhrases: "Night phrase"
        case .nightCommentary: "Night line"
        case .nightIntro: "Night intro"
        }
    }

    var footnote: String? {
        switch self {
        case .banners:
            "Active banners are spread evenly along the course; the two banks are spaced independently."
        case .commentary, .nightCommentary:
            "Filler lines between the scripted beats. {duck} becomes a random racer's name."
        case .intro, .nightIntro:
            "Plays in order before each race. {duck} and {duck2} become two different racers."
        case .nightPhrases:
            "Replaces the day phrases when dark mode is active."
        case .phrases:
            "Spoken by the ducks mid-race."
        }
    }

    /// Path segment under /api/admin/games/ducky.
    var path: String {
        switch self {
        case .banners: "banners"
        case .phrases: "phrases"
        case .commentary: "commentary"
        case .intro: "intro"
        case .nightPhrases: "night-phrases"
        case .nightCommentary: "night-commentary"
        case .nightIntro: "night-intro"
        }
    }

    var isBanner: Bool { self == .banners }

    func rows(in config: DuckyConfig) -> [DuckyTextRow] {
        switch self {
        case .banners: config.banners
        case .phrases: config.phrases
        case .commentary: config.commentary
        case .intro: config.intro
        case .nightPhrases: config.nightPhrases
        case .nightCommentary: config.nightCommentary
        case .nightIntro: config.nightIntro
        }
    }
}
