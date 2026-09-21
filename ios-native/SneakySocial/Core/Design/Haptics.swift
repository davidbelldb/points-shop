import UIKit

/// Thin wrapper over the feedback generators, mirroring frontend/src/lib/haptics.js
/// and adding the race cues the web app can't do.
@MainActor
enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let notification = UINotificationFeedbackGenerator()

    /// Call before a burst so the Taptic Engine is warm and the first hit lands on time.
    static func prepare() {
        light.prepare()
        heavy.prepare()
        rigid.prepare()
    }

    /// A light tick — buttons, picking a duck, tapping a crow.
    static func tap(intensity: CGFloat = 1) {
        light.impactOccurred(intensity: intensity)
        light.prepare()
    }

    /// A duck clattering into something.
    static func knock() {
        heavy.impactOccurred(intensity: 0.85)
        heavy.prepare()
    }

    /// The "nudge" — a heavy double knock.
    static func nudge() {
        heavy.impactOccurred()
        Task {
            try? await Task.sleep(for: .milliseconds(120))
            heavy.impactOccurred()
        }
    }

    /// Two sharp clicks — the camera on a photo finish.
    static func shutter() {
        rigid.impactOccurred(intensity: 0.9)
        Task {
            try? await Task.sleep(for: .milliseconds(90))
            rigid.impactOccurred(intensity: 0.7)
        }
    }

    static func success() {
        notification.notificationOccurred(.success)
    }

    static func failure() {
        notification.notificationOccurred(.error)
    }

    static func warning() {
        notification.notificationOccurred(.warning)
    }
}
