import Foundation
import ActivityKit

/// The crow Live Activity's shape.
///
/// This MUST stay identical to the Capacitor app's CrowActivityAttributes and
/// to what the backend sends: APNs matches on `attributes-type`, which is the
/// literal string "CrowActivityAttributes", and the content-state keys are
/// built by `crowContentState()` in backend/src/modules/notifications/apns.js.
/// Rename a field here and the push silently stops rendering.
struct CrowActivityAttributes: ActivityAttributes {
    /// Dynamic state — updated as the crow flies / lands.
    public struct ContentState: Codable, Hashable {
        /// When the crow set off.
        var startedAt: Date
        /// When the crow is due to land.
        var arrivesAt: Date
        /// Flips true once the scroll has been delivered.
        var landed: Bool
        /// Server-driven subtitle (street-name progress updates). The backend
        /// always sends this; "" means "use the default subtitle".
        var message: String = ""
        /// How many of the 3 waypoint nodes the crow has passed (0–3; 4 = landed).
        var phase: Int = 0
    }

    /// Static info — fixed for the life of one flight.
    var originLabel: String
    var destLabel: String
    /// Maps a per-activity update token back to the scroll.
    var scrollId: String = ""
    /// "scroll" (person to person) or "forecast" (the Three-Eyed Crow).
    var kind: String = "scroll"
}
