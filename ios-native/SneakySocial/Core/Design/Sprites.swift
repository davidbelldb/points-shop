import SwiftUI
import UIKit

/// Loads the artwork copied over from `frontend/public`.
///
/// The ducks are .webp, which `UIImage(named:)` won't find as a loose bundle
/// resource, so we go through the bundle URL and let ImageIO decode it.
@MainActor
enum Sprites {
    private static var cache: [String: Image?] = [:]

    static func image(_ name: String) -> Image? {
        if let cached = cache[name] { return cached }
        let loaded = load(name).map(Image.init(uiImage:))
        cache[name] = loaded
        return loaded
    }

    static func duck(ord: Int, night: Bool) -> Image? {
        image(night ? "night_duck_\(ord)" : "duck_\(ord)")
    }

    static func bread(night: Bool) -> Image? {
        image(night ? "night_bread" : "bread")
    }

    static func breadPost(night: Bool) -> Image? {
        image(night ? "night_bread_post" : "bread_post")
    }

    static var iceberg: Image? { image("iceberg") }

    /// Iceberg artwork aspect ratio, so a width implies its height.
    /// `nonisolated` because the course layout works it out off the main actor.
    nonisolated static let icebergAspect: Double = 815.0 / 1312.0

    private static func load(_ name: String) -> UIImage? {
        if let asset = UIImage(named: name) { return asset }
        for ext in ["webp", "png", "jpg"] {
            if let url = Bundle.main.url(forResource: name, withExtension: ext),
               let data = try? Data(contentsOf: url),
               let image = UIImage(data: data) {
                return image
            }
        }
        return nil
    }
}
