import ActivityKit
import WidgetKit
import SwiftUI

private let bg = Color(red: 0.122, green: 0.122, blue: 0.118)      // #1f1f1e background
private let deepLink = URL(string: "sneakystuff://messages")

// A crow at each end of the journey: crow_land_00 departs on the left,
// crow_land_10 waits (perched) on the right. Both are shown at all times.
private let crowLeft = "crow_land_00"
private let crowRight = "crow_land_10"

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
                        // White so it's visible on the black Dynamic Island.
                        // Stays put once landed (shown full), just no longer animates.
                        Group {
                            if context.state.landed {
                                Capsule().fill(Color.white).frame(height: 4)
                            } else {
                                ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                             countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                    .tint(.white)
                            }
                        }
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
    private let fracs: [CGFloat] = [0.25, 0.5, 0.75]
    var body: some View {
        GeometryReader { geo in
            ForEach(Array(fracs.enumerated()), id: \.offset) { idx, frac in
                let isOn = reached >= idx + 1
                ZStack {
                    // Soft translucent halo appears once the crow reaches the node.
                    Circle()
                        .fill(Color.black.opacity(0.22))
                        .frame(width: 20, height: 20)
                        .scaleEffect(isOn ? 1 : 0.3)
                        .opacity(isOn ? 1 : 0)
                    // Inner dot — same size whether reached or not.
                    Circle().fill(Color.black).frame(width: 8, height: 8)
                }
                .position(x: geo.size.width * frac, y: geo.size.height / 2)
            }
        }
        .frame(height: 20)
        .animation(.spring(response: 0.35, dampingFraction: 0.45), value: reached)
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
                    Image(crowLeft).resizable().scaledToFit().frame(width: 30, height: 30)
                    // Dashed trail that fills in solid black, left → right, as the
                    // crow flies. The auto-advancing ProgressView draws the solid
                    // fill; the dashes show ahead of it.
                    ZStack {
                        DashedLine(color: .black)
                        if context.state.landed {
                            Capsule().fill(Color.black).frame(height: 3)   // arrived → full solid
                        } else {
                            ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                         countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(.black)
                        }
                        // Three evenly-spaced waypoint nodes (centre + one either
                        // side). Each "pops" as the crow's progress reaches it.
                        WaypointNodes(reached: context.state.landed ? 3 : context.state.phase)
                    }
                    .frame(height: 12)
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
