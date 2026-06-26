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
    ]

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
