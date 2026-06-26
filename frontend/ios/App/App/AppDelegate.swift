import UIKit
import Capacitor
import UserNotifications

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
        if let shortcut = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
            pendingShortcut = shortcut
        }
        registerChatReplyCategory()
        return true
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

    // Warm launch — app already running when the Quick Action is tapped.
    func application(_ application: UIApplication, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        routeShortcut(shortcutItem)
        completionHandler(true)
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

    func applicationWillResignActive(_ application: UIApplication) {
        // Cover the screen with a blur while inactive, so the app-switcher
        // snapshot doesn't expose the content underneath.
        guard let window = self.window else { return }
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

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Reveal the content again once the app is back in the foreground.
        privacyOverlay?.removeFromSuperview()
        privacyOverlay = nil
        // Clear the app-icon badge whenever the user opens the app.
        application.applicationIconBadgeNumber = 0
        // Handle a Quick Action that launched the app from cold, now the
        // webview has had a moment to come up.
        if let shortcut = pendingShortcut {
            pendingShortcut = nil
            routeShortcut(shortcut)
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
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
