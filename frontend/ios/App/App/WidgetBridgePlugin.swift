import Foundation
import Capacitor
import WidgetKit

/// Bridges the web app to the home-screen / lock-screen widgets.
///
/// The widgets fetch their own data directly from the API, but they can't see
/// the web app's session cookie — so the app mints a bearer token
/// (POST /api/widget/token) and hands it here, where we stash it in the shared
/// App Group for the widget target to read. We also reload the widget timelines
/// so a fresh login / data change shows up promptly.
///
/// JS usage (see frontend/src/lib/widgetBridge.js):
///   SneakyWidget.setCredentials({ token, apiBase })  // store + reload
///   SneakyWidget.reload()                            // nudge timelines
///   SneakyWidget.clear()                             // on logout
///
/// Registered manually in MainViewController (app-target plugins aren't
/// auto-discovered by Capacitor).
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "SneakyWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    // Must match SneakyWidget.appGroup in the widget target.
    private let appGroup = "group.com.david.sneakystuff"

    private var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    @objc func setCredentials(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("token is required")
            return
        }
        let apiBase = call.getString("apiBase") ?? "https://sneakypoints.com"
        guard let store = defaults else {
            call.reject("App Group \(appGroup) unavailable — check the App Groups capability")
            return
        }
        store.set(token, forKey: "widgetToken")
        store.set(apiBase, forKey: "apiBase")
        reloadTimelines()
        // Also ferry the token to the paired Apple Watch (App Groups don't span
        // devices — the watch app writes it into the watch's own container).
        WatchTokenBridge.shared.send(token: token, apiBase: apiBase)
        call.resolve(["ok": true])
    }

    @objc func reload(_ call: CAPPluginCall) {
        reloadTimelines()
        call.resolve(["ok": true])
    }

    @objc func clear(_ call: CAPPluginCall) {
        defaults?.removeObject(forKey: "widgetToken")
        reloadTimelines()
        call.resolve(["ok": true])
    }

    private func reloadTimelines() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
