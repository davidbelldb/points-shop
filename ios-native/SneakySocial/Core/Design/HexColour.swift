import SwiftUI
import UIKit

/// The backend stores and validates colours as `#rrggbb` strings, so the admin
/// screens convert both ways rather than holding a `Color`.
enum HexColour {
    static func isValid(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        guard trimmed.count == 7, trimmed.hasPrefix("#") else { return false }
        return trimmed.dropFirst().allSatisfy(\.isHexDigit)
    }

    static func string(from color: Color) -> String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let channels = [red, green, blue].map { Int((min(max($0, 0), 1) * 255).rounded()) }
        return "#" + channels.map { String(format: "%02x", $0) }.joined()
    }
}
