//
//  SneakyWatchApp.swift
//  SneakyWatch (watchOS app)
//
//  A deliberately tiny watch app whose real job is to (a) host the widget
//  extension and (b) receive the widget bearer token from the phone over
//  WatchConnectivity and stash it in the watch's App Group so the watch widgets
//  can authenticate. There's no rich UI — everything glanceable lives in the
//  Smart Stack tiles / watch-face complications.
//

import SwiftUI
import WatchConnectivity
import WidgetKit

@main
struct SneakyWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate
    var body: some Scene {
        WindowGroup { WatchRootView() }
    }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate, WCSessionDelegate {
    // Same identifier as the iOS side; on the watch this resolves to the
    // watch's own container.
    private let appGroup = "group.com.david.sneakystuff"

    func applicationDidFinishLaunching() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // Latest-state delivery — this is what we rely on.
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        store(applicationContext)
    }
    // Queued fallback the phone uses if application-context isn't ready.
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        store(userInfo)
    }
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // On activation, pick up any context already waiting from the phone.
        if activationState == .activated {
            store(session.receivedApplicationContext)
        }
    }

    private func store(_ dict: [String: Any]) {
        guard let d = UserDefaults(suiteName: appGroup) else { return }
        var changed = false
        if let t = dict["widgetToken"] as? String, !t.isEmpty { d.set(t, forKey: "widgetToken"); changed = true }
        if let b = dict["apiBase"] as? String, !b.isEmpty { d.set(b, forKey: "apiBase"); changed = true }
        if changed { WidgetCenter.shared.reloadAllTimelines() }
    }
}

struct WatchRootView: View {
    private var linked: Bool { UserDefaults(suiteName: "group.com.david.sneakystuff")?.string(forKey: "widgetToken") != nil }
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "calendar")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(Color(red: 0xEE / 255, green: 0x70 / 255, blue: 0xBD / 255))
            Text("Sneaky").font(.headline)
            Text(linked
                 ? "Add the tiles from your Smart Stack or watch face."
                 : "Open the Sneaky app on your iPhone to link.")
                .font(.caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}
