import UIKit
import Capacitor
import UserNotifications
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    // Privacy overlay shown over the app's content in the iOS app switcher so a
    // glance at the multitasking preview can't reveal a chat / photo.
    var privacyOverlay: UIView?
    // A Home-screen Quick Action tapped on a cold launch, handled once the
    // webview is ready (see applicationDidBecomeActive / routeToWebView).
    var pendingShortcut: UIApplicationShortcutItem?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // NB: on iOS 13+ with the UIScene lifecycle adopted (see SceneDelegate +
        // UIApplicationSceneManifest in Info.plist), the window is created by the
        // scene, a cold-launch Quick Action arrives via the scene's
        // connectionOptions, and the active/resign callbacks are the scene's — not
        // this delegate's. This method keeps only the app-wide setup.
        // After an app update, WKWebView can keep serving web assets it cached
        // from the previous build (its cache lives in the app container, which an
        // in-place update doesn't wipe — only a delete would). That's what left a
        // heavily-used device showing the OLD map/fonts/sprites on a NEW build.
        // Clear ONLY the webview's HTTP/resource caches when the build changes —
        // cookies/localStorage (the login session) are left intact, and OS
        // permissions (location/notifications) are untouched — so a plain update
        // now always pulls the new bundle in, no reinstall needed.
        clearWebViewCacheIfBuildChanged()
        registerChatReplyCategory()
        // Force the custom Capacitor plugin to load so its @objc class is
        // registered with the Objective-C runtime and Capacitor's auto-discovery
        // finds it. Without this reference, an app-target plugin that's only
        // reached via the JS bridge can be missed ("plugin is not implemented").
        _ = CrowActivityPlugin.self
        _ = OmwActivityPlugin.self
        _ = NfcPlugin.self
        return true
    }

    // Purge the webview's cached HTTP responses (disk + memory + offline + fetch
    // caches) the first time the app runs after its build number changes, so the
    // freshly-bundled web assets load instead of stale cached ones. Deliberately
    // does NOT clear cookies / localStorage / IndexedDB (that would log the user
    // out and wipe their data); those are preserved. Runs at most once per update.
    private func clearWebViewCacheIfBuildChanged() {
        let key = "lastRunBundleVersion"
        let current = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""
        let previous = UserDefaults.standard.string(forKey: key)
        guard current != previous else { return }   // same build — nothing to do
        UserDefaults.standard.set(current, forKey: key)

        let cacheTypes: Set<String> = [
            WKWebsiteDataTypeDiskCache,
            WKWebsiteDataTypeMemoryCache,
            WKWebsiteDataTypeOfflineWebApplicationCache,
            WKWebsiteDataTypeFetchCache,
        ]
        WKWebsiteDataStore.default().removeData(
            ofTypes: cacheTypes,
            modifiedSince: Date(timeIntervalSince1970: 0)
        ) {
            // If the webview already loaded from the stale cache before the purge
            // finished, reload it from origin so this takes effect on first launch
            // rather than the next one.
            DispatchQueue.main.async {
                if let vc = self.window?.rootViewController as? CAPBridgeViewController {
                    vc.bridge?.webView?.reloadFromOrigin()
                }
            }
        }
    }

    // Defines the "Reply" text-input action shown on chat-message push banners.
    // Pushes carrying `"category": "CHAT_REPLY"` get a Reply box; the typed text
    // is forwarded by the Capacitor push plugin to the web layer (nativePush.js),
    // which sends it using the logged-in session.
    private func registerChatReplyCategory() {
        let reply = UNTextInputNotificationAction(
            identifier: "REPLY",
            title: "Reply",
            options: [],
            textInputButtonTitle: "Send",
            textInputPlaceholder: "Message…")
        let category = UNNotificationCategory(
            identifier: "CHAT_REPLY",
            actions: [reply],
            intentIdentifiers: [],
            options: [])
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    // Quick Action entry point, called by the SceneDelegate for both the
    // warm-launch (windowScene:performActionFor:) and cold-launch
    // (scene:willConnectTo: connectionOptions.shortcutItem) cases.
    func handleShortcut(_ item: UIApplicationShortcutItem) {
        routeShortcut(item)
    }

    private func routeShortcut(_ item: UIApplicationShortcutItem) {
        guard let url = item.userInfo?["url"] as? String else { return }
        routeToWebView(url, attempt: 0)
    }

    // Dispatch a 'sneakyQuickAction' into the web app, retrying until the JS
    // handler exists (the webview may not have finished loading on cold launch).
    private func routeToWebView(_ url: String, attempt: Int) {
        guard attempt < 15 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            guard let vc = self.window?.rootViewController as? CAPBridgeViewController,
                  let webView = vc.bridge?.webView else {
                self.routeToWebView(url, attempt: attempt + 1); return
            }
            let js = "(function(){ if (window.sneakyQuickAction) { window.sneakyQuickAction('\(url)'); return 'ok'; } return 'wait'; })()"
            webView.evaluateJavaScript(js) { result, _ in
                if (result as? String) != "ok" { self.routeToWebView(url, attempt: attempt + 1) }
            }
        }
    }

    // Cover the screen with a blur while inactive, so the app-switcher
    // snapshot doesn't expose the content underneath. Called by the
    // SceneDelegate's sceneWillResignActive.
    func showPrivacyOverlay() {
        guard let window = self.window, privacyOverlay == nil else { return }
        let overlay = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        overlay.frame = window.bounds
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        // Cheeky label on the frosted screen.
        let label = UILabel()
        label.text = "Sneaky Mode, innit."
        label.font = UIFont.systemFont(ofSize: 22, weight: .bold)
        label.textColor = .white
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        overlay.contentView.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: overlay.contentView.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: overlay.contentView.centerYAnchor),
        ])

        window.addSubview(overlay)
        privacyOverlay = overlay
    }

    // Reveal the content again once the app is back in the foreground, clear the
    // badge, and run any Quick Action that launched the app from cold. Called by
    // the SceneDelegate's sceneDidBecomeActive.
    func handleDidBecomeActive() {
        privacyOverlay?.removeFromSuperview()
        privacyOverlay = nil
        UIApplication.shared.applicationIconBadgeNumber = 0
        if let shortcut = pendingShortcut {
            pendingShortcut = nil
            routeShortcut(shortcut)
        }
    }

    // Forward APNs registration results to Capacitor's PushNotifications plugin.
    // Required because the SPM integration doesn't reliably swizzle these in —
    // without them, register() succeeds but the 'registration' event never fires.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
