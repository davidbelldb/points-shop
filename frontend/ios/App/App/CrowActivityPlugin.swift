import Foundation
import Capacitor
import ActivityKit

/// Bridges the crow Live Activity to the web layer.
///
/// JS usage (see frontend/src/lib/crowActivity.js):
///   CrowActivity.start({ seconds, origin, dest })  // begin a flight
///   CrowActivity.land()                            // flip to "arrived"
///   CrowActivity.end()                             // dismiss
///
/// Auto-registered by Capacitor via CAPBridgedPlugin — no manual wiring needed.
@objc(CrowActivityPlugin)
public class CrowActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CrowActivityPlugin"
    public let jsName = "CrowActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "land", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enablePush", returnType: CAPPluginReturnPromise),
    ]

    // Start observing the push-to-start token and every activity's update token,
    // emitting them to the web layer (see crowActivity.js) which posts them to
    // the backend. This is what lets the server start/update the crow activity
    // while the app is closed.
    @objc func enablePush(_ call: CAPPluginCall) {
        if #available(iOS 17.2, *) {
            Task {
                for await data in Activity<CrowActivityAttributes>.pushToStartTokenUpdates {
                    let hex = data.map { String(format: "%02x", $0) }.joined()
                    self.notifyListeners("ptsToken", data: ["token": hex])
                }
            }
        }
        if #available(iOS 16.2, *) {
            // Update tokens for activities already running + any started later
            // (including ones started via push-to-start).
            Task {
                for activity in Activity<CrowActivityAttributes>.activities {
                    self.trackUpdateToken(activity)
                }
                for await activity in Activity<CrowActivityAttributes>.activityUpdates {
                    self.trackUpdateToken(activity)
                }
            }
        }
        call.resolve()
    }

    @available(iOS 16.2, *)
    private func trackUpdateToken(_ activity: Activity<CrowActivityAttributes>) {
        let scrollId = activity.attributes.scrollId
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                self.notifyListeners("updateToken", data: ["scrollId": scrollId, "token": hex])
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are disabled in Settings")
            return
        }
        // Don't stack duplicates — end any existing crow first.
        endAll()

        let seconds = call.getDouble("seconds") ?? 0
        let origin = call.getString("origin") ?? ""
        let dest = call.getString("dest") ?? ""
        let now = Date()
        let attributes = CrowActivityAttributes(originLabel: origin, destLabel: dest)
        let state = CrowActivityAttributes.ContentState(
            startedAt: now,
            arrivesAt: now.addingTimeInterval(seconds),
            landed: false
        )
        do {
            let activity = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
            call.resolve(["id": activity.id])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func land(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { call.resolve(); return }
        Task {
            for activity in Activity<CrowActivityAttributes>.activities {
                let landed = CrowActivityAttributes.ContentState(
                    startedAt: activity.contentState.startedAt,
                    arrivesAt: Date(),
                    landed: true
                )
                await activity.update(using: landed)
                // Linger briefly on the "arrived" state, then dismiss.
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                await activity.end(dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        endAll()
        call.resolve()
    }

    private func endAll() {
        guard #available(iOS 16.1, *) else { return }
        Task {
            for activity in Activity<CrowActivityAttributes>.activities {
                await activity.end(dismissalPolicy: .immediate)
            }
        }
    }
}
