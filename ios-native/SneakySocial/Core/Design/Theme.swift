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

/// The app's fixed palette. Anything the admin can change (water, grass, buoys)
/// comes from the API at runtime — these are only the values baked into the
/// web app's own stylesheet.
enum Palette {
    // Shell
    static let points = Color(hex: "#b45309")        // amber-700, the points figure
    static let cardBorder = Color(hex: "#e5e5e5")

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

    // Form-guide placing pills
    static func placing(_ place: Int) -> (background: Color, foreground: Color) {
        switch place {
        case 0: return (Color(hex: "#fbcfe8"), Color(hex: "#be185d"))   // DNF — sank
        case 1: return (Color(hex: "#fbbf24"), Color(hex: "#451a03"))   // winner
        case 2, 3: return (Color(hex: "#10b981"), .white)               // podium
        default: return (Color(hex: "#e5e5e5"), Color(hex: "#525252"))
        }
    }
}
