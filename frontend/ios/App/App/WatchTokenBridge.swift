import Foundation
import WatchConnectivity

/// Ferries the widget bearer token from the phone to the paired Apple Watch.
///
/// App Groups don't cross devices, so the Watch can't read the phone's shared
/// container. Instead the phone pushes the token over WatchConnectivity; the
/// watch app (SneakyWatchApp) receives it and writes it into the WATCH's own
/// App Group, where the watch widget reads it.
///
/// We send via `updateApplicationContext` (latest-state, survives the watch
/// being asleep) and fall back to `transferUserInfo` (queued) if the session
/// isn't ready yet.
final class WatchTokenBridge: NSObject, WCSessionDelegate {
    static let shared = WatchTokenBridge()
    private override init() { super.init() }

    private var lastPayload: [String: Any]?

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        if s.activationState != .activated { s.activate() }
    }

    func send(token: String, apiBase: String) {
        guard WCSession.isSupported() else { return }
        let payload: [String: Any] = ["widgetToken": token, "apiBase": apiBase]
        lastPayload = payload
        let session = WCSession.default
        if session.activationState != .activated {
            session.delegate = self
            session.activate()   // lastPayload is flushed in activationDidComplete
            return
        }
        push(payload, on: session)
    }

    private func push(_ payload: [String: Any], on session: WCSession) {
        do {
            try session.updateApplicationContext(payload)
        } catch {
            session.transferUserInfo(payload)
        }
    }

    // MARK: WCSessionDelegate
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated, let payload = lastPayload {
            push(payload, on: session)
        }
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
