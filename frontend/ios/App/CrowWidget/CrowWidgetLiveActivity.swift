import ActivityKit
import WidgetKit
import SwiftUI

private let bg = Color(red: 0.122, green: 0.122, blue: 0.118)      // #1f1f1e background
// Tapping the crow / weather Live Activity opens the in-app straight-line flight
// tracker (both normal scrolls and forecast scrolls use this same activity).
private let deepLink = URL(string: "sneakystuff://crow-tracker")

// A crow at each end of the journey: crow_land_00 departs on the left,
// crow_land_10 waits (perched) on the right. Both are shown at all times.
private let crowLeft = "crow_land_00"
private let crowRight = "crow_land_10"
// The in-flight crow that glides along the trail (faces right, toward the
// destination). Shown only while the scroll is still travelling — it vanishes
// once landed, leaving just the two static bookend crows.
private let crowMover = "crow_land_xx"

// Where the gliding crow sits, as a fraction of the trail, for each flight phase.
// It rides just off the left crow at take-off (0.06), lands on each of the three
// waypoint nodes (0.25 / 0.50 / 0.75) as it's "spotted" over them, then eases in
// for landing (0.92) before the delivered state hides it.
private func crowMoverFrac(_ phase: Int) -> CGFloat {
    switch phase {
    case 0:  return 0.06
    case 1:  return 0.25
    case 2:  return 0.50
    case 3:  return 0.75
    default: return 0.92
    }
}

private func title(_ s: CrowActivityAttributes.ContentState, _ a: CrowActivityAttributes) -> String {
    s.landed
        ? (a.kind == "forecast" ? "A Three-Eyed Crow has arrived" : "News from \(a.originLabel).")
        : "A scroll will shortly be arriving."
}

// Subtitle: in flight → "dispatched from …" (or the live street narration in
// `message`); landed → the scroll's text (passed in `message`).
private func subtitle(_ s: CrowActivityAttributes.ContentState, _ a: CrowActivityAttributes) -> String {
    if s.landed {
        return s.message.isEmpty ? "A crow has arrived" : s.message
    }
    return s.message.isEmpty ? "A crow has been dispatched from \(a.originLabel)" : s.message
}

struct CrowWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CrowActivityAttributes.self) { context in
            CrowLockScreenView(context: context)
                .activityBackgroundTint(bg)              // #1f1f1e, shows if tile missing
                .activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(crowLeft).resizable().scaledToFit().frame(width: 30, height: 30)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(crowRight).resizable().scaledToFit().frame(width: 30, height: 30)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        Text(title(context.state, context.attributes))
                            .font(.headline).foregroundColor(.white)
                        // The same flight trail as the banner, but tinted for the
                        // black Dynamic Island: white line/fill/nodes with the
                        // gliding crow riding along, gone once landed.
                        CrowTrail(startedAt: context.state.startedAt,
                                  arrivesAt: context.state.arrivesAt,
                                  landed: context.state.landed,
                                  phase: context.state.phase,
                                  tint: .white)
                            .frame(maxWidth: 195)
                    }
                }
            } compactLeading: {
                Image(crowLeft).resizable().scaledToFit()
            } compactTrailing: {
                Image(crowRight).resizable().scaledToFit()
            } minimal: {
                Image(crowRight).resizable().scaledToFit()
            }
            .widgetURL(deepLink)   // tapping the island opens the chat
        }
    }
}

// A dashed horizontal "flight trail" drawn between the two crows.
struct DashedLine: View {
    var color: Color
    var body: some View {
        GeometryReader { geo in
            Path { p in
                let y = geo.size.height / 2
                p.move(to: CGPoint(x: 0, y: y))
                p.addLine(to: CGPoint(x: geo.size.width, y: y))
            }
            .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [4, 7]))
        }
        .frame(height: 12)
    }
}

// Three black waypoint nodes at 25 / 50 / 75% of the trail. A node enlarges
// (springs) once `reached` includes it — iOS animates the change as the crow's
// progress arrives at that point.
struct WaypointNodes: View {
    var reached: Int   // how many nodes have been passed (0–3)
    var color: Color = .black   // black on the banner, white on the Dynamic Island
    private let fracs: [CGFloat] = [0.25, 0.5, 0.75]
    var body: some View {
        GeometryReader { geo in
            ForEach(Array(fracs.enumerated()), id: \.offset) { idx, frac in
                let isOn = reached >= idx + 1
                ZStack {
                    // Soft translucent halo appears once the crow reaches the node.
                    Circle()
                        .fill(color.opacity(0.22))
                        .frame(width: 20, height: 20)
                        .scaleEffect(isOn ? 1 : 0.3)
                        .opacity(isOn ? 1 : 0)
                    // Inner dot — same size whether reached or not.
                    Circle().fill(color).frame(width: 8, height: 8)
                }
                .position(x: geo.size.width * frac, y: geo.size.height / 2)
            }
        }
        .frame(height: 20)
        .animation(.spring(response: 0.35, dampingFraction: 0.45), value: reached)
    }
}

// The crow's flight trail: the dashed line, the solid time-driven fill, the three
// waypoint nodes, and the gliding crow that rides along above them. The gliding
// crow is hidden once landed (the perched crow on the right says it all), leaving
// only the static bookend sprites — mirroring the "On My Way" trail. Shared by the
// lock-screen banner and the Dynamic Island so both surfaces animate identically.
struct CrowTrail: View {
    var startedAt: Date
    var arrivesAt: Date
    var landed: Bool
    var phase: Int
    var tint: Color = .black    // black on the tile banner, white on the Dynamic Island
    var body: some View {
        let reached = landed ? 3 : phase
        ZStack {
            DashedLine(color: tint)
            // Solid fill: full colour once arrived, otherwise the auto-advancing
            // timer bar (draws the fill; dashes show ahead of it).
            if landed {
                Capsule().fill(tint).frame(height: 3)
            } else {
                ProgressView(timerInterval: startedAt...arrivesAt, countsDown: false) {
                    EmptyView()
                } currentValueLabel: { EmptyView() }
                    .tint(tint)
            }
            WaypointNodes(reached: reached, color: tint)
            // The gliding crow — above the trail + nodes, hidden once delivered.
            // Its position steps between waypoints as phase updates arrive, easing
            // between them so it appears to fly rather than teleport.
            if !landed {
                GeometryReader { geo in
                    Image(crowMover).resizable().scaledToFit()
                        .frame(width: 30, height: 30)
                        .position(x: crowMoverFrac(phase) * geo.size.width,
                                  y: geo.size.height / 2)
                        .animation(.easeInOut(duration: 1.2), value: phase)
                }
                .zIndex(1)
            }
        }
        .frame(height: 12)
    }
}

// Lock-screen / banner: tile.png background, black text, a crow at each end of a
// dashed flight trail.
struct CrowLockScreenView: View {
    let context: ActivityViewContext<CrowActivityAttributes>

    var body: some View {
        ZStack {
            Image("tile").resizable().scaledToFill()
            VStack(spacing: 8) {
                Text(title(context.state, context.attributes))
                    .font(.custom("ImperialBlack", size: 22))
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)

                Text(subtitle(context.state, context.attributes))
                    .font(.custom("ImperialBlack", size: 12))
                    .foregroundColor(.black)
                    .opacity(0.85)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)                 // landed scroll text → one line…
                    .truncationMode(.tail)        // …with a trailing ellipsis
                    .padding(.horizontal, 20)     // truncate ~6 chars sooner, off the edge

                HStack(spacing: 10) {
                    // Static "leave" crow bookends the trail on the left; the
                    // gliding crow flies out from here and the perched crow waits
                    // on the right. The trail fills solid black left → right as the
                    // crow flies, its three waypoint nodes popping as it passes.
                    Image(crowLeft).resizable().scaledToFit().frame(width: 30, height: 30)
                    CrowTrail(startedAt: context.state.startedAt,
                              arrivesAt: context.state.arrivesAt,
                              landed: context.state.landed,
                              phase: context.state.phase)
                    Image(crowRight).resizable().scaledToFit().frame(width: 30, height: 30)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity)
        .widgetURL(deepLink)       // tapping the banner opens the chat
    }
}
