import Foundation
import Observation

/// What this account is allowed to reach, straight from the server.
///
/// The backend is the boundary — it 404s anything a kids account shouldn't
/// have. This just stops the app offering a tab that would come back empty,
/// and means George and David get different apps from the same build.
@MainActor
@Observable
final class FeatureStore {
    enum Feature: String, Sendable {
        case shop
        case duckyDerby = "ducky_derby"
        case shutTheBox = "shut_the_box"
        case messaging
        case scrolls
        case stories
        case sneakyButton = "sneaky_button"
        case hero
    }

    private(set) var audience = "adult"
    private(set) var enabled: Set<String> = []
    private(set) var hasLoaded = false

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    func has(_ feature: Feature) -> Bool {
        // Before the first load, assume nothing — a tab appearing a beat late is
        // better than one that shouldn't be there at all.
        enabled.contains(feature.rawValue)
    }

    var isKids: Bool { audience == "kids" }

    func load() async {
        guard let response = try? await api.get("/features", as: FeatureResponse.self) else {
            hasLoaded = true
            return
        }
        audience = response.audience
        enabled = Set(response.features)
        hasLoaded = true
    }

    private struct FeatureResponse: Decodable, Sendable {
        let audience: String
        let features: [String]
    }
}
