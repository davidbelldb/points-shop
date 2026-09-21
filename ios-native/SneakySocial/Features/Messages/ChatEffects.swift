import SwiftUI
import UIKit

/// The jolt a nudge gives the thread — the native answer to the web app's
/// shake animation. Driven by a counter, so each new nudge shakes again.
struct ShakeEffect: GeometryEffect {
    var travel: CGFloat

    var animatableData: CGFloat {
        get { travel }
        set { travel = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        // Four diminishing swings, ending where it started.
        let progress = travel.truncatingRemainder(dividingBy: 1)
        let swing = sin(progress * .pi * 4) * 10 * (1 - progress)
        return ProjectionTransform(CGAffineTransform(translationX: swing, y: 0))
    }
}

/// A bubble drawing attention to itself — used when you come back from the map
/// by tapping the crow that delivered it.
///
/// Two swells rather than one: a single scale reads as a layout glitch, a
/// double beat reads as "this one".
struct PulseModifier: ViewModifier {
    let active: Bool

    @State private var swell: CGFloat = 1

    func body(content: Content) -> some View {
        content
            .scaleEffect(swell)
            .onChange(of: active) { _, isActive in
                guard isActive else { return }
                Task {
                    for scale in [1.07, 1.0, 1.05, 1.0] as [CGFloat] {
                        withAnimation(.spring(response: 0.22, dampingFraction: 0.55)) {
                            swell = scale
                        }
                        try? await Task.sleep(for: .milliseconds(180))
                    }
                }
            }
    }
}

extension View {
    func pulse(_ active: Bool) -> some View { modifier(PulseModifier(active: active)) }
}

/// The camera, for a photo taken there and then.
///
/// `PhotosPicker` covers the library; the camera still needs the UIKit
/// controller, and there's no SwiftUI equivalent.
struct CameraPicker: UIViewControllerRepresentable {
    var onCapture: (Data) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture, dismiss: { dismiss() })
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onCapture: (Data) -> Void
        let dismiss: () -> Void

        init(onCapture: @escaping (Data) -> Void, dismiss: @escaping () -> Void) {
            self.onCapture = onCapture
            self.dismiss = dismiss
        }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            defer { dismiss() }
            guard let image = info[.originalImage] as? UIImage else { return }
            // 0.85 JPEG: the backend re-encodes to WebP at 1600px anyway, so
            // there's nothing to gain from sending a 12MP original up a phone
            // connection.
            guard let data = image.jpegData(compressionQuality: 0.85) else { return }
            onCapture(data)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            dismiss()
        }
    }
}
