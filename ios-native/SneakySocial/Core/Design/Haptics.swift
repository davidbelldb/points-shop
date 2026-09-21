import UIKit

/// Thin wrapper over the generators, mirroring frontend/src/lib/haptics.js.
@MainActor
enum Haptics {
    private static let impact = UIImpactFeedbackGenerator(style: .light)
    private static let notification = UINotificationFeedbackGenerator()

    /// A light tick — buttons, picking a duck, tapping a crow.
    static func tap() {
        impact.prepare()
        impact.impactOccurred()
    }

    /// The "nudge" — a heavy double knock.
    static func nudge() {
        let heavy = UIImpactFeedbackGenerator(style: .heavy)
        heavy.prepare()
        heavy.impactOccurred()
        Task {
            try? await Task.sleep(for: .milliseconds(120))
            heavy.impactOccurred()
        }
    }

    static func success() {
        notification.prepare()
        notification.notificationOccurred(.success)
    }

    static func warning() {
        notification.prepare()
        notification.notificationOccurred(.warning)
    }
}
