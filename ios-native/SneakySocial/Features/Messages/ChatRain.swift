import SwiftUI
import RealityKit

/// The three things you can throw at someone, and the 3D that draws them.
///
/// Ported from ChatRain.jsx. The web app loads twirl.glb, popcorn.glb and a
/// gold-shaded duck_7.stl through three.js; those are converted to USDZ here
/// (centred, normalised to a unit cube, and with the emissive scan texture
/// rewired to diffuse — as exported, base colour on both GLBs is black).

enum RainKind: String, CaseIterable, Identifiable, Sendable {
    case twirl, popcorn, duck

    var id: String { rawValue }

    /// The bodies the backend recognises. They're gestures, not letters, so
    /// they arrive immediately rather than waiting on a crow.
    var body: String { "__rain_\(rawValue)__" }

    var model: String { rawValue }

    var label: String {
        switch self {
        case .twirl: "Rain Twirls"
        case .popcorn: "Rain popcorn"
        case .duck: "Rain ducks"
        }
    }

    /// How many fall, and how fast. The web app rains 30 of each.
    var count: Int {
        switch self {
        case .twirl: 24
        case .popcorn: 30
        case .duck: 22
        }
    }

    init?(body: String) {
        switch body {
        case "__rain_twirl__": self = .twirl
        case "__rain_popcorn__": self = .popcorn
        case "__rain_duck__": self = .duck
        default: return nil
        }
    }
}

/// Loads each USDZ once and hands out clones.
///
/// Loading is the expensive part and the rain wants thirty of them, so the
/// entity is fetched once per model and cloned after that.
@MainActor
enum RainModels {
    private static var cache: [String: Entity] = [:]

    static func entity(_ name: String) async -> Entity? {
        if let cached = cache[name] { return cached.clone(recursive: true) }
        guard let url = Bundle.main.url(forResource: name, withExtension: "usdz") else { return nil }
        guard let loaded = try? await Entity(contentsOf: url) else { return nil }
        cache[name] = loaded
        return loaded.clone(recursive: true)
    }
}

// MARK: - Tray thumbnail

/// One model, turning on the spot — the tray button's face.
struct SpinningModel: View {
    let model: String
    var size: CGFloat = 40

    @State private var entity: Entity?

    var body: some View {
        RealityView { content in
            content.camera = .virtual
            let camera = Entity()
            camera.components.set(PerspectiveCameraComponent(near: 0.01, far: 10, fieldOfViewInDegrees: 30))
            camera.position = [0, 0, 3.2]
            content.add(camera)

            // Two lights rather than one, so the silhouette doesn't flatten as
            // it turns away from the key.
            let key = Entity()
            key.components.set(DirectionalLightComponent(color: .white, intensity: 3_000))
            key.look(at: .zero, from: [1.5, 2, 2.5], relativeTo: nil)
            content.add(key)

            let fill = Entity()
            fill.components.set(DirectionalLightComponent(color: .white, intensity: 1_200))
            fill.look(at: .zero, from: [-2, -0.5, 1.5], relativeTo: nil)
            content.add(fill)

            if let loaded = await RainModels.entity(model) {
                let pivot = Entity()
                pivot.addChild(loaded)
                content.add(pivot)
                entity = pivot
                spin(pivot)
            }
        }
        .frame(width: size, height: size)
        .allowsHitTesting(false)
    }

    /// One turn every 2.6s, forever — matching the web tray's 1.4 rad/s.
    private func spin(_ pivot: Entity) {
        var transform = pivot.transform
        transform.rotation = simd_quatf(angle: .pi, axis: [0, 1, 0])
        pivot.move(to: transform, relativeTo: pivot.parent, duration: 1.3, timingFunction: .linear)

        Task {
            var angle: Float = 0
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(1_300))
                guard pivot.parent != nil else { return }
                angle += .pi
                var next = pivot.transform
                next.rotation = simd_quatf(angle: angle, axis: [0, 1, 0])
                pivot.move(to: next, relativeTo: pivot.parent, duration: 1.3, timingFunction: .linear)
            }
        }
    }
}

// MARK: - The rain itself

/// A shower of the chosen thing, falling over the conversation.
///
/// Each instance gets its own start position, fall speed and tumble, so thirty
/// of the same model don't read as thirty copies of one animation.
struct ChatRainView: View {
    let kind: RainKind
    var onFinished: () -> Void = {}

    /// How long the whole shower lasts.
    private let duration: TimeInterval = 5.5

    var body: some View {
        GeometryReader { geo in
            RealityView { content in
                content.camera = .virtual
                let camera = Entity()
                camera.components.set(PerspectiveCameraComponent(near: 0.05, far: 60, fieldOfViewInDegrees: 45))
                camera.position = [0, 0, 12]
                content.add(camera)

                let key = Entity()
                key.components.set(DirectionalLightComponent(color: .white, intensity: 3_500))
                key.look(at: .zero, from: [2, 4, 5], relativeTo: nil)
                content.add(key)

                let fill = Entity()
                fill.components.set(DirectionalLightComponent(color: .white, intensity: 1_500))
                fill.look(at: .zero, from: [-3, -1, 3], relativeTo: nil)
                content.add(fill)

                guard let template = await RainModels.entity(kind.model) else { return }

                // The visible width at the camera's distance, so things fall
                // across the screen rather than down a narrow strip.
                let halfWidth: Float = 5.5
                let top: Float = 7
                let bottom: Float = -8

                for index in 0..<kind.count {
                    let one = index == 0 ? template : template.clone(recursive: true)
                    let pivot = Entity()
                    pivot.addChild(one)

                    let x = Float.random(in: -halfWidth...halfWidth)
                    let z = Float.random(in: -1.5...1.5)
                    let scale = Float.random(in: 0.55...1.0)
                    pivot.scale = [scale, scale, scale]
                    pivot.position = [x, top + Float.random(in: 0...9), z]
                    pivot.orientation = simd_quatf(angle: .random(in: 0...(2 * .pi)),
                                                   axis: normalize([Float.random(in: -1...1),
                                                                    Float.random(in: -1...1),
                                                                    Float.random(in: -1...1)]))
                    content.add(pivot)

                    var end = pivot.transform
                    end.translation = [x + Float.random(in: -0.6...0.6), bottom, z]
                    end.rotation = pivot.orientation * simd_quatf(
                        angle: .random(in: (2 * .pi)...(6 * .pi)),
                        axis: normalize([Float.random(in: -1...1), 1, Float.random(in: -1...1)]))

                    pivot.move(to: end, relativeTo: nil,
                               duration: Double.random(in: 2.6...4.4),
                               timingFunction: .easeIn)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
        .task {
            try? await Task.sleep(for: .seconds(duration))
            onFinished()
        }
    }
}
