import AppIntents
import Foundation

/// One-tap "quick reply" fired from the On My Way Live Activity button.
///
/// Tapping the button runs this intent in the background (no app open) and POSTs
/// to the backend, which sends the caller's slot-1 reply phrase back to the other
/// person. Auth uses the shared widget bearer token written to the App Group by
/// OmwActivityPlugin (same token the Siri intent / native tracker use).
///
/// IMPORTANT: this file must belong to BOTH the **App** target AND the
/// **CrowWidgetExtension** target (File Inspector → Target Membership → tick
/// both), because the widget's `Button(intent:)` references it.

private let omwQuickReplyAppGroup = "group.com.david.sneakystuff"

@available(iOS 16.0, *)
func sendOmwQuickReply(tripId: String) async {
    let defaults = UserDefaults(suiteName: omwQuickReplyAppGroup)
    guard let token = defaults?.string(forKey: "widgetToken"), !tripId.isEmpty else { return }
    let apiBase = defaults?.string(forKey: "apiBase") ?? "https://sneakypoints.com"
    guard let url = URL(string: apiBase + "/api/omw/trips/\(tripId)/quick-reply") else { return }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = "{}".data(using: .utf8)
    _ = try? await URLSession.shared.data(for: req)
}

@available(iOS 17.0, *)
struct OmwQuickReplyIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Quick reply"
    static var description = IntentDescription("Send your quick reply from the On My Way Live Activity.")
    static var openAppWhenRun = false

    @Parameter(title: "Trip")
    var tripId: String

    init() {}
    init(tripId: String) { self.tripId = tripId }

    func perform() async throws -> some IntentResult {
        await sendOmwQuickReply(tripId: tripId)
        return .result()
    }
}
