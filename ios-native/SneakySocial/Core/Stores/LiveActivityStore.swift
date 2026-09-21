import Foundation
import Observation
import ActivityKit

/// Keeps the server able to push crow Live Activities to this device.
///
/// Two kinds of token matter. The *push-to-start* token lets the backend begin
/// an activity when a crow sets off, with the app closed. Each started activity
/// then has its own *update* token for the street-by-street progress. Both go
/// to `POST /api/scrolls/live-activity-token`, which is the same endpoint the
/// Capacitor app uses — with `app: "native"` so the server knows which bundle
/// id to address, and the Capacitor app's own registrations are untouched.
@MainActor
@Observable
final class LiveActivityStore {
    private(set) var isEnabled = false

    private let api: APIClient
    private var watching: [Task<Void, Never>] = []

    init(api: APIClient = .shared) {
        self.api = api
    }

    /// Called once the session is known to be signed in — a token is useless
    /// to the server until it can attach it to an account.
    func start() {
        guard watching.isEmpty else { return }
        isEnabled = ActivityAuthorizationInfo().areActivitiesEnabled

        watching.append(Task { await watchPushToStart() })
        watching.append(Task { await watchExistingActivities() })
    }

    func stop() {
        watching.forEach { $0.cancel() }
        watching = []
    }

    // MARK: - Tokens

    /// The device's push-to-start token. It rotates, so this is a stream rather
    /// than a one-off read.
    private func watchPushToStart() async {
        for await tokenData in Activity<CrowActivityAttributes>.pushToStartTokenUpdates {
            await send(kind: "pts", token: hex(tokenData), scrollID: nil)
        }
    }

    /// Any activity already running (started by a push while we were closed, or
    /// left over from a previous launch) plus every new one, each reporting its
    /// own update token.
    private func watchExistingActivities() async {
        for activity in Activity<CrowActivityAttributes>.activities {
            watch(activity)
        }
        for await activity in Activity<CrowActivityAttributes>.activityUpdates {
            watch(activity)
        }
    }

    private func watch(_ activity: Activity<CrowActivityAttributes>) {
        let scrollID = activity.attributes.scrollId
        watching.append(Task {
            for await tokenData in activity.pushTokenUpdates {
                await send(kind: "update", token: hex(tokenData), scrollID: scrollID)
            }
        })
    }

    private func send(kind: String, token: String, scrollID: String?) async {
        struct Body: Encodable, Sendable {
            let kind: String
            let token: String
            let scrollId: String?
            /// Which app this token belongs to, so the server pushes with the
            /// right APNs topic. Absent means the Capacitor app, as before.
            let app = "native"
            /// A build run from Xcode gets a sandbox token, which production
            /// APNs rejects outright. Telling the server which gateway to use
            /// is what lets this be tested before TestFlight.
            #if DEBUG
            let environment = "development"
            #else
            let environment = "production"
            #endif
        }
        await api.fireAndForget(
            "/scrolls/live-activity-token",
            method: "POST",
            body: Body(kind: kind, token: token, scrollId: scrollID)
        )
    }

    /// APNs wants the token as hex, not base64.
    private nonisolated func hex(_ data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }
}
