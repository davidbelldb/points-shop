import ActivityKit
import Foundation

/// Shared data contract for the "On My Way" Live Activity.
///
/// IMPORTANT: like CrowActivityAttributes, this file must belong to BOTH the App
/// target AND the CrowWidgetExtension target. Select it in Xcode → File
/// Inspector → Target Membership and tick both.
///
/// Kept deliberately separate from CrowActivityAttributes so OMW can evolve
/// (cycling sprites, live GPS progress) without any risk to the scroll activity.
struct OmwActivityAttributes: ActivityAttributes {
    /// Dynamic state — updated on every location ping the server receives.
    public struct ContentState: Codable, Hashable {
        /// When the journey began.
        var startedAt: Date
        /// Estimated arrival (kept for future use / Dynamic Island timer). The
        /// bar itself is driven by `progress`, not this.
        var etaAt: Date
        /// 0…1 fraction of the way there (GPS-driven, computed server-side).
        var progress: Double
        /// Straight-line distance still to travel, in km (for a subtitle later).
        var remainingKm: Double
        /// Optional server-driven message. "" = use the fixed copy.
        var message: String = ""
        /// How many of the 3 waypoint nodes have been passed (0–3; 4 = arrived).
        var phase: Int = 0
        /// Flips true when the traveller reaches the destination.
        var arrived: Bool = false
    }

    /// Static info — fixed for the life of one trip.
    var travellerName: String  // e.g. "David"
    var destLabel: String      // e.g. "Blinco Grove"
    var tripId: String = ""    // maps a per-activity update token back to the trip
}
