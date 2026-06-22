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
    }

    /// Static info — fixed for the life of one flight.
    var originLabel: String   // road name the crow left from
    var destLabel: String     // road name the crow is heading to
}
