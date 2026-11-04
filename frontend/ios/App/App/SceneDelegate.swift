import UIKit
import Capacitor

// Adopts the UIScene lifecycle, which iOS 13+ provides and the iOS 26/27 SDK now
// *enforces* — an app built against that SDK with no scene manifest traps at
// launch (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdopt). The window
// + root view controller are still built from Main.storyboard (UISceneStoryboardFile
// in Info.plist), so MainViewController.capacitorDidLoad() keeps registering the
// custom plugins exactly as before. This class just re-homes the window-dependent
// bits that used to live on AppDelegate: the app-switcher privacy blur, the badge
// clear, Home-screen Quick Actions, and custom-URL / Universal-Link deep links
// (forwarded to Capacitor's ApplicationDelegateProxy so the JS bridge sees them).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    // UIKit creates this window from Main.storyboard and assigns it here before
    // scene(_:willConnectTo:) runs.
    var window: UIWindow?

    private var appDelegate: AppDelegate? {
        UIApplication.shared.delegate as? AppDelegate
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Keep the AppDelegate's window reference in sync so its Quick Action
        // routing (which reaches the webview via window.rootViewController) and the
        // privacy overlay keep working.
        appDelegate?.window = window

        // Cold-launch Quick Action — run it once the webview is up.
        if let shortcut = connectionOptions.shortcutItem {
            appDelegate?.pendingShortcut = shortcut
        }

        // Cold-launch Universal Links.
        for activity in connectionOptions.userActivities {
            ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: activity) { _ in }
        }

        // Cold-launch custom URL scheme.
        if let urlContext = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        appDelegate?.handleDidBecomeActive()
    }

    func sceneWillResignActive(_ scene: UIScene) {
        appDelegate?.showPrivacyOverlay()
    }

    // Warm-launch Quick Action — app already running when the action is tapped.
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        appDelegate?.handleShortcut(shortcutItem)
        completionHandler(true)
    }

    // Custom URL scheme while running.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let urlContext = URLContexts.first else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: urlContext.url, options: [:])
    }

    // Universal Link while running.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity) { _ in }
    }
}
