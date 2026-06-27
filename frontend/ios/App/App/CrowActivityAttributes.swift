import ActivityKit
import Foundation

/// Shared data contract for the "crow in flight" Live Activity.
///
/// IMPORTANT: this file must belong to BOTH targets — the App and the Widget
/// Extension. After creating the widget target, select this file in Xcode and
/// tick both targets under File Inspector → Target Membership.
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
        /// Drives the node "pop" on the timeline. Always sent by the backend.
        var phase: Int = 0
    }

    /// Static info — fixed for the life of one flight.
    var originLabel: String   // road name the crow left from
    var destLabel: String     // road name the crow is heading to
    var scrollId: String = "" // maps a per-activity update token back to the scroll
}
