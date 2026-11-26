import ActivityKit
import WidgetKit
import SwiftUI

private let bg = Color(red: 0.122, green: 0.122, blue: 0.118)      // #1f1f1e background

// Ananda Namaste display font (bundled as NamasteRegular.ttf via UIAppFonts).
private func scrollFont(_ size: CGFloat) -> Font { Font.custom("AnandaNamaste", size: size) }

// Colourful watercolour sweep for the scroll text, matching the in-app reader.
// Two variants: the oxblood→gold sweep reads on the pale parchment tile of the
// lock-screen banner, but its dark end would disappear on the Dynamic Island's
// black background, so the island uses a brightened sweep instead.
// Earthy watercolour sweep (terracotta → brick → crimson → plum → indigo → blue
// → teal), matching the Nepali-font inspiration. The lock-screen banner is on the
// pale tile, so it uses these muted tones; the Dynamic Island is on black, so it
// uses a brightened set.
private let scrollGradientOnLight = LinearGradient(
    colors: [
        Color(red: 0.71, green: 0.38, blue: 0.17), Color(red: 0.66, green: 0.20, blue: 0.20),
        Color(red: 0.61, green: 0.18, blue: 0.37), Color(red: 0.49, green: 0.23, blue: 0.53),
        Color(red: 0.29, green: 0.29, blue: 0.62), Color(red: 0.18, green: 0.43, blue: 0.63),
        Color(red: 0.18, green: 0.52, blue: 0.49),
    ],
    startPoint: .topLeading, endPoint: .bottomTrailing)
private let scrollGradientOnDark = LinearGradient(
    colors: [
        Color(red: 0.88, green: 0.54, blue: 0.31), Color(red: 0.88, green: 0.36, blue: 0.33),
        Color(red: 0.84, green: 0.36, blue: 0.54), Color(red: 0.66, green: 0.47, blue: 0.75),
        Color(red: 0.49, green: 0.49, blue: 0.82), Color(red: 0.35, green: 0.61, blue: 0.82),
        Color(red: 0.36, green: 0.75, blue: 0.68),
    ],
    startPoint: .leading, endPoint: .trailing)

// Blue flight-trail: a solid blue dashed line, blue waypoint nodes, and a blue
// progress fill (no gradient).
private let trailLine = Color(red: 0.180, green: 0.431, blue: 0.627)  // #2e6ea0
private let trailNode = Color(red: 0.180, green: 0.431, blue: 0.627)  // #2e6ea0
private let trailFill = Color(red: 0.180, green: 0.431, blue: 0.627)  // #2e6ea0

// Solid dark halo under the banner title (not a gradient).
private extension View {
    func scrollTextShadow() -> some View {
        self
            .shadow(color: Color(red: 0.12, green: 0.05, blue: 0.02).opacity(0.55), radius: 1.1, x: 0, y: 0.5)
            .shadow(color: Color(red: 0.12, green: 0.05, blue: 0.02).opacity(0.35), radius: 0.6, x: 0, y: 0)
    }
}
// Tapping the crow / weather Live Activity opens the in-app straight-line flight
// tracker (both normal scrolls and forecast scrolls use this same activity).
private let deepLink = URL(string: "sneakystuff://crow-tracker")

// A bird at each end of the journey: crow_land_00 departs on the left,
// crow_land_10 waits (perched) on the right. Both are shown at all times.
private let crowLeft = "crow_send_06-0"
private let crowRight = "crow_land_10-1"
// The in-flight crow that glides along the trail (faces right, toward the
// destination). Shown only while the scroll is still travelling — it vanishes
// once landed, leaving just the two static bookend crows.
private let crowMover = "crow_send_06-2"

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
        ? (a.kind == "forecast" ? "An Indian Roller has arrived" : "News from \(a.originLabel).")
        : "A roll will be arriving… eventually."
}

// Subtitle: in flight → "dispatched from …" (or the live street narration in
// `message`); landed → the scroll's text (passed in `message`).
private func subtitle(_ s: CrowActivityAttributes.ContentState, _ a: CrowActivityAttributes) -> String {
    if s.landed {
        return s.message.isEmpty ? "A bird has arrived" : s.message
    }
    return s.message.isEmpty ? "A bird has been dispatched from \(a.originLabel)" : s.message
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
                    Image(crowLeft).resizable().scaledToFit().frame(width: 34.5, height: 34.5)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(crowRight).resizable().scaledToFit().frame(width: 34.5, height: 34.5)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        // The pun / live narration headlines here too.
                        Text(subtitle(context.state, context.attributes))
                            .font(scrollFont(18))
                            .foregroundStyle(scrollGradientOnDark)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
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
            .stroke(trailLine, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [4, 7]))
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
                Capsule().fill(trailFill).frame(height: 3)
            } else {
                ProgressView(timerInterval: startedAt...arrivesAt, countsDown: false) {
                    EmptyView()
                } currentValueLabel: { EmptyView() }
                    .tint(trailFill)
            }
            WaypointNodes(reached: reached, color: trailNode)
            // The gliding crow — above the trail + nodes, hidden once delivered.
            // Its position steps between waypoints as phase updates arrive, easing
            // between them so it appears to fly rather than teleport.
            if !landed {
                GeometryReader { geo in
                    Image(crowMover).resizable().scaledToFit()
                        .frame(width: 34.5, height: 34.5)
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
            Image("tile2").resizable().scaledToFill()
            VStack(spacing: 8) {
                // Flipped: the live narration / country pun is now the headline,
                // and the generic line drops to the small secondary slot.
                Text(subtitle(context.state, context.attributes))
                    .font(scrollFont(22))
                    .foregroundStyle(scrollGradientOnLight)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)                 // longer puns wrap to two lines…
                    .minimumScaleFactor(0.7)      // …and shrink a touch if still too wide

                Text(title(context.state, context.attributes))
                    .font(scrollFont(12))
                    .foregroundStyle(scrollGradientOnLight)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .padding(.horizontal, 20)

                HStack(spacing: 10) {
                    // Static "leave" crow bookends the trail on the left; the
                    // gliding crow flies out from here and the perched crow waits
                    // on the right. The trail fills solid black left → right as the
                    // crow flies, its three waypoint nodes popping as it passes.
                    Image(crowLeft).resizable().scaledToFit().frame(width: 34.5, height: 34.5)
                    CrowTrail(startedAt: context.state.startedAt,
                              arrivesAt: context.state.arrivesAt,
                              landed: context.state.landed,
                              phase: context.state.phase)
                    Image(crowRight).resizable().scaledToFit().frame(width: 34.5, height: 34.5)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity)
        .widgetURL(deepLink)       // tapping the banner opens the chat
    }
}
