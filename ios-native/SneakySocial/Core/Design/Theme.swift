import SwiftUI

extension Color {
    /// `#rrggbb` / `#rrggbbaa`, to keep the admin-configured hex values from the
    /// database usable as-is.
    init(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        var int: UInt64 = 0
        Scanner(string: value).scanHexInt64(&int)

        let r, g, b, a: Double
        switch value.count {
        case 8:
            r = Double((int >> 24) & 0xFF) / 255
            g = Double((int >> 16) & 0xFF) / 255
            b = Double((int >> 8) & 0xFF) / 255
            a = Double(int & 0xFF) / 255
        case 6:
            r = Double((int >> 16) & 0xFF) / 255
            g = Double((int >> 8) & 0xFF) / 255
            b = Double(int & 0xFF) / 255
            a = 1
        default:
            r = 0; g = 0; b = 0; a = 1
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

extension Color {
    /// Lighten (positive) or darken (negative) a hex colour by a flat amount per
    /// channel — the web app's `shade()` helper, used for wave and grass layers.
    static func shade(_ hex: String, by amount: Int) -> Color {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6 else { return Color(hex: hex) }

        var int: UInt64 = 0
        Scanner(string: value).scanHexInt64(&int)
        let channels = [(int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF].map { channel -> Double in
            Double(min(255, max(0, Int(channel) + amount))) / 255
        }
        return Color(.sRGB, red: channels[0], green: channels[1], blue: channels[2], opacity: 1)
    }
}

/// The app's fixed palette. Anything the admin can change (water, grass, buoys)
/// comes from the API at runtime — these are only the values baked into the
/// web app's own stylesheet.
enum Palette {
    // Shell
    static let points = Color(hex: "#b45309")        // amber-700, the points figure
    static let basket = Color(hex: "#ed70bd")        // the basket button beside the pill
    static let pill = Color(hex: "#263f39")          // the points pill body, sampled from the web app
    static let cardBorder = Color(hex: "#e5e5e5")

    /// Message bubbles, lifted straight from the web app so the two clients
    /// look like the same product. Mine is teal, theirs is pink, and each has
    /// its own pair for light and dark.
    enum Bubble {
        static func background(mine: Bool, night: Bool) -> Color {
            switch (mine, night) {
            case (true, true):   Color(hex: "#21433b")
            case (true, false):  Color(hex: "#c8ede4")
            case (false, true):  Color(hex: "#4e1d37")
            case (false, false): Color(hex: "#f0d5e8")
            }
        }

        static func foreground(mine: Bool, night: Bool) -> Color {
            night ? .white : Color(hex: mine ? "#0d3d2e" : "#3b0f2a")
        }

        /// A secret that hasn't been opened yet — neither side's colour.
        static let sealed = Color(hex: "#3b3b3b")
    }

    // Crow tracker map — the On My Way styling: near-black land, pink route.
    static let mapBackground = Color(hex: "#1f1f1f")   // painted under the tiles
    static let mapRoute = Color(hex: "#ee70bd")        // OMW's pink

    // Crow tracker — "The Marauder's Map"
    static let parchment = Color(hex: "#ebc876")
    static let oxblood = Color(hex: "#5e1a13")
    static let scrollCard = Color(hex: "#f7db9b")

    // Ducky Derby — daylight defaults, overridden by ducky_config
    static let water = Color(hex: "#4aa3c7")
    static let grass = Color(hex: "#5bbf3a")
    static let mud = Color(hex: "#6b4a2a")
    static let buoy = Color(hex: "#e0322e")

    // Ducky Derby — night palette (replaces the admin colours in dark mode)
    static let nightWater = Color(hex: "#0b2545")
    static let nightGrass = Color(hex: "#1a3d20")
    static let nightMud = Color(hex: "#1a0e06")

    // Confetti
    static let dayConfetti = ["#ffd23f", "#ff5d8f", "#4aa3c7", "#5bbf3a", "#ff8c42", "#a878ff", "#ffffff"].map(Color.init(hex:))
    static let nightConfetti = ["#ffe600", "#ff1a6e", "#00d4ff", "#39ff14", "#ff7700", "#bf3eff", "#ffffff"].map(Color.init(hex:))

    // Form-guide placing pills. The web app has no dark variants for these —
    // these are the night equivalents, keeping the same gold/green/pink coding.
    static func placing(_ place: Int, night: Bool = false) -> (background: Color, foreground: Color) {
        switch (place, night) {
        case (0, false): (Color(hex: "#fbcfe8"), Color(hex: "#be185d"))   // DNF — sank
        case (0, true):  (Color(hex: "#831843"), Color(hex: "#fbcfe8"))
        case (1, false): (Color(hex: "#fbbf24"), Color(hex: "#451a03"))   // winner
        case (1, true):  (Color(hex: "#b45309"), Color(hex: "#fde68a"))
        case (2, false), (3, false): (Color(hex: "#10b981"), .white)      // podium
        case (2, true), (3, true):   (Color(hex: "#065f46"), Color(hex: "#6ee7b7"))
        case (_, false): (Color(hex: "#e5e5e5"), Color(hex: "#525252"))
        case (_, true):  (Color(hex: "#3f3f46"), Color(hex: "#d4d4d8"))
        }
    }
}
