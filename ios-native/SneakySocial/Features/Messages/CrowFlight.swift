import SwiftUI

/// The crow's flight trail, ported from CrowWidgetLiveActivity.swift in the
/// Capacitor app so the chat bubble and the Live Activity are the same drawing
/// rather than two designs that drift apart.
///
/// The fill is a `ProgressView(timerInterval:)`, which advances itself against
/// the flight's start and arrival dates — no timer, and it stays correct if the
/// view appears mid-flight.

enum CrowArt {
    /// Departing crow, bookending the left of the trail.
    static let left = "crow_land_00"
    /// Perched crow waiting at the destination.
    static let right = "crow_land_10"
    /// The one that glides along the trail while the scroll is travelling.
    static let mover = "crow_land_00"
    /// The two flying poses, alternated to beat the wings. The same pair the
    /// crow tracker uses on the map, so a bird in a bubble and a bird on a map
    /// fly at the same rate.
    static let flyA = "crow_send_03"
    static let flyB = "crow_send_04"

    /// The system font. Messages used to be set in ImperialBlack on parchment;
    /// they now match the web app, which is plain text on a coloured bubble.
    static func font(size: CGFloat) -> Font {
        .system(size: size)
    }
}

/// A crow, loaded the same way, with a glyph to fall back on.
struct CrowSprite: View {
    let name: String
    var size: CGFloat

    var body: some View {
        Group {
            if let sprite = Sprites.image(name) {
                sprite.resizable().scaledToFit()
            } else {
                Image(systemName: "bird.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(.black.opacity(0.75))
            }
        }
        .frame(width: size, height: size)
    }
}

/// A crow with its wings going, for the trail.
///
/// The beat runs off `TimelineView` rather than a timer: the clock is the
/// source, so every crow on screen flaps in step and none of them keep beating
/// when the thread is scrolled away. Only the image swaps — the position lives
/// on the view around this one, so a waypoint move still animates smoothly
/// underneath the flapping.
struct FlappingCrow: View {
    var size: CGFloat
    /// One frame per 140ms — a beat every 280ms, matching the map tracker.
    private static let frameInterval: TimeInterval = 0.14

    var body: some View {
        TimelineView(.periodic(from: .now, by: Self.frameInterval)) { context in
            let tick = Int(context.date.timeIntervalSinceReferenceDate / Self.frameInterval)
            CrowSprite(name: tick.isMultiple(of: 2) ? CrowArt.flyA : CrowArt.flyB, size: size)
        }
    }
}

/// Where the gliding crow sits, as a fraction of the trail, for each phase.
/// It leaves just off the left crow, lands on each waypoint as it's spotted,
/// then eases in before the delivered state hides it.
func crowMoverFraction(_ phase: Int) -> CGFloat {
    switch phase {
    case 0: 0.06
    case 1: 0.25
    case 2: 0.50
    case 3: 0.75
    default: 0.92
    }
}

struct DashedLine: View {
    var color: Color

    var body: some View {
        GeometryReader { geo in
            Path { path in
                let y = geo.size.height / 2
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: geo.size.width, y: y))
            }
            .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [4, 7]))
        }
        .frame(height: 12)
    }
}

/// Three waypoint nodes at 25 / 50 / 75%. Each springs open as the crow passes.
struct WaypointNodes: View {
    var reached: Int
    var color: Color = .black

    private let fractions: [CGFloat] = [0.25, 0.5, 0.75]

    var body: some View {
        GeometryReader { geo in
            ForEach(Array(fractions.enumerated()), id: \.offset) { index, fraction in
                let isOn = reached >= index + 1
                ZStack {
                    Circle()
                        .fill(color.opacity(0.22))
                        .frame(width: 20, height: 20)
                        .scaleEffect(isOn ? 1 : 0.3)
                        .opacity(isOn ? 1 : 0)
                    Circle().fill(color).frame(width: 8, height: 8)
                }
                .position(x: geo.size.width * fraction, y: geo.size.height / 2)
            }
        }
        .frame(height: 20)
        .animation(.spring(response: 0.35, dampingFraction: 0.45), value: reached)
    }
}

/// Dashed line, time-driven fill, waypoints, and the gliding crow above them.
struct CrowTrail: View {
    var startedAt: Date
    var arrivesAt: Date
    var landed: Bool
    var phase: Int
    var tint: Color = .black

    var body: some View {
        let reached = landed ? 3 : phase

        ZStack {
            DashedLine(color: tint)

            if landed {
                Capsule().fill(tint).frame(height: 3)
            } else {
                ProgressView(timerInterval: startedAt...arrivesAt, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .tint(tint)
            }

            WaypointNodes(reached: reached, color: tint)

            if !landed {
                GeometryReader { geo in
                    FlappingCrow(size: 30)
                        .position(x: crowMoverFraction(phase) * geo.size.width,
                                  y: geo.size.height / 2)
                        .animation(.easeInOut(duration: 1.2), value: phase)
                }
                .zIndex(1)
            }
        }
        .frame(height: 12)
    }
}

/// The banner itself — the same composition as the Live Activity's lock-screen
/// view, sized to sit in a chat thread.
struct CrowFlightBanner: View {
    var title: String
    var subtitle: String
    var startedAt: Date
    var arrivesAt: Date
    var landed: Bool
    var phase: Int

    var body: some View {
        ZStack {
            Palette.Bubble.background(mine: false, night: false)

            VStack(spacing: 8) {
                Text(title)
                    .font(CrowArt.font(size: 19))
                    .foregroundStyle(.black)
                    .multilineTextAlignment(.center)

                Text(subtitle)
                    .font(CrowArt.font(size: 12))
                    .foregroundStyle(.black.opacity(0.85))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .padding(.horizontal, 16)

                HStack(spacing: 10) {
                    CrowSprite(name: CrowArt.left, size: 30)
                    CrowTrail(startedAt: startedAt, arrivesAt: arrivesAt,
                              landed: landed, phase: phase)
                    CrowSprite(name: CrowArt.right, size: 30)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .frame(maxWidth: .infinity)
        .clipShape(.rect(cornerRadius: 18))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(subtitle)")
    }
}
