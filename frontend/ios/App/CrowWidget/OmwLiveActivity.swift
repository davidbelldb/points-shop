import ActivityKit
import WidgetKit
import SwiftUI

// "On My Way" Live Activity. Reuses DashedLine from CrowWidgetLiveActivity.swift
// (same widget-extension target). Standard iOS font, white text on the app's
// grey, and its own white waypoint nodes (the crow's are black).

// Pixel sprites in the widget's Assets.xcassets, chosen by the trip's transport.
// bicycle → david_leave / david_arrive; scooter → david_scoot_leave /
// david_scoot_arrive. Left departs, right waits (mirrors the crow's pair).
private func spriteLeft(_ a: OmwActivityAttributes) -> String {
    a.transport == "scooter" ? "david_scoot_leave" : "david_leave"
}
private func spriteRight(_ a: OmwActivityAttributes) -> String {
    a.transport == "scooter" ? "david_scoot_arrive" : "david_arrive"
}

// Banner background tint, by transport: bicycle → deep green #122b1f,
// scooter → coral #d86d61. White text + trail read on both.
private func omwBg(_ a: OmwActivityAttributes) -> Color {
    a.transport == "scooter"
        ? Color(red: 0.8471, green: 0.4275, blue: 0.3804)   // #d86d61
        : Color(red: 0.0706, green: 0.1686, blue: 0.1216)   // #122b1f
}
private let omwDeepLink = URL(string: "sneakystuff://new-chat")

private func omwTitle(_ a: OmwActivityAttributes, _ s: OmwActivityAttributes.ContentState) -> String {
    s.arrived
        ? "\(a.travellerName) has arrived"
        : "\(a.travellerName) will be with you soon"
}

// The line under the title: the server-driven narration (progress-banded copy),
// falling back to the opening tagline before the first update lands.
private let omwSubtitle = "Wait and save? I think not."
private func omwLine(_ s: OmwActivityAttributes.ContentState) -> String {
    if s.arrived { return "" }
    return s.message.isEmpty ? omwSubtitle : s.message
}

// A solid trail that fills left→right to `progress` (0…1), drawn over the dashes.
struct OmwProgressFill: View {
    var progress: Double
    var color: Color
    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(color)
                .frame(width: max(0, min(1, progress)) * geo.size.width, height: 3)
                .position(x: (max(0, min(1, progress)) * geo.size.width) / 2, y: geo.size.height / 2)
        }
        .frame(height: 12)
    }
}

// Three white waypoint nodes at 25 / 50 / 75% of the trail. Each springs a halo
// once `reached` includes it — same behaviour as the crow's nodes, white so they
// read on the grey background.
struct OmwWaypointNodes: View {
    var reached: Int   // how many nodes have been passed (0–3)
    private let fracs: [CGFloat] = [0.25, 0.5, 0.75]
    var body: some View {
        GeometryReader { geo in
            ForEach(Array(fracs.enumerated()), id: \.offset) { idx, frac in
                let isOn = reached >= idx + 1
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.30))
                        .frame(width: 20, height: 20)
                        .scaleEffect(isOn ? 1 : 0.3)
                        .opacity(isOn ? 1 : 0)
                    Circle().fill(Color.white).frame(width: 8, height: 8)
                }
                .position(x: geo.size.width * frac, y: geo.size.height / 2)
            }
        }
        .frame(height: 20)
        .animation(.spring(response: 0.35, dampingFraction: 0.45), value: reached)
    }
}

struct OmwLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OmwActivityAttributes.self) { context in
            OmwLockScreenView(context: context)
                .activityBackgroundTint(omwBg(context.attributes))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(spriteLeft(context.attributes)).resizable().scaledToFit().frame(width: 30, height: 30)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(spriteRight(context.attributes)).resizable().scaledToFit().frame(width: 30, height: 30)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        Text(omwTitle(context.attributes, context.state))
                            .font(.headline).foregroundColor(.white)
                            .multilineTextAlignment(.center)
                        // Progress-banded narration (or the opening tagline).
                        Text(omwLine(context.state))
                            .font(.caption).foregroundColor(.white).opacity(0.85)
                            .lineLimit(1)
                        ZStack {
                            DashedLine(color: .white)
                            OmwProgressFill(progress: context.state.arrived ? 1 : context.state.progress, color: .white)
                            OmwWaypointNodes(reached: context.state.arrived ? 3 : context.state.phase)
                        }
                        .frame(maxWidth: 195, minHeight: 12)
                    }
                }
            } compactLeading: {
                Image(spriteLeft(context.attributes)).resizable().scaledToFit()
            } compactTrailing: {
                Image(spriteRight(context.attributes)).resizable().scaledToFit()
            } minimal: {
                Image(spriteRight(context.attributes)).resizable().scaledToFit()
            }
            .widgetURL(omwDeepLink)
        }
    }
}

// Lock-screen / banner: app-grey background, white text + trail, a sprite at each
// end of a white dashed line that fills solid, with three waypoint nodes that pop
// as progress passes. A live street line updates as the journey polls location.
struct OmwLockScreenView: View {
    let context: ActivityViewContext<OmwActivityAttributes>

    var body: some View {
        let progress = context.state.arrived ? 1 : context.state.progress
        let reached = context.state.arrived ? 3 : context.state.phase
        let line = omwLine(context.state)

        ZStack {
            omwBg(context.attributes)
            VStack(spacing: 8) {
                Text(omwTitle(context.attributes, context.state))
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)

                // Progress-banded narration (or the opening tagline). Hidden once
                // arrived so only the "has arrived" title shows.
                if !line.isEmpty {
                    Text(line)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white)
                        .opacity(0.85)
                        .multilineTextAlignment(.center)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }

                HStack(spacing: 10) {
                    Image(spriteLeft(context.attributes)).resizable().scaledToFit().frame(width: 30, height: 30)
                    ZStack {
                        DashedLine(color: .white)
                        OmwProgressFill(progress: progress, color: .white)
                        OmwWaypointNodes(reached: reached)
                    }
                    .frame(height: 12)
                    Image(spriteRight(context.attributes)).resizable().scaledToFit().frame(width: 30, height: 30)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity)
        .widgetURL(omwDeepLink)
    }
}
