import ActivityKit
import WidgetKit
import SwiftUI

// "On My Way" Live Activity. Reuses DashedLine from CrowWidgetLiveActivity.swift
// (same widget-extension target). Standard iOS font, white text on the app's
// grey, and its own white waypoint nodes (the crow's are black).

// Pixel sprites in the widget's Assets.xcassets, chosen by the trip's transport.
// bicycle → david_leave/arrive; scooter → david_scoot_leave/arrive;
// uber → katie_taxi_leave/arrive (Katie's only mode). Left departs, right waits.
private func spriteLeft(_ a: OmwActivityAttributes) -> String {
    switch a.transport {
    case "scooter": return "david_scoot_leave"
    case "uber":    return "katie_taxi_leave"
    default:        return "david_leave"
    }
}
private func spriteRight(_ a: OmwActivityAttributes) -> String {
    switch a.transport {
    case "scooter": return "david_scoot_arrive"
    case "uber":    return "katie_taxi_arrive"
    default:        return "david_arrive"
    }
}

// Banner background tint, by transport: bicycle → deep green #122b1f,
// scooter → coral #d86d61, uber (Katie) → near-black #0d0d0d. White text + trail
// read on all three.
private func omwBg(_ a: OmwActivityAttributes) -> Color {
    switch a.transport {
    case "scooter": return Color(red: 0.8471, green: 0.4275, blue: 0.3804)  // #d86d61
    case "uber":    return Color(red: 0.0510, green: 0.0510, blue: 0.0510)  // #0d0d0d
    default:        return Color(red: 0.0706, green: 0.1686, blue: 0.1216)  // #122b1f
    }
}
private let omwDeepLink = URL(string: "sneakystuff://messages")

// Title is identical for everyone — it uses the traveller's name (no pronoun) and
// the live ETA, which updates as the journey progresses.
private func omwTitle(_ a: OmwActivityAttributes, _ s: OmwActivityAttributes.ContentState) -> String {
    if s.arrived { return "\(a.travellerName) has arrived!" }
    return "\(a.travellerName) will be with you in \(omwEtaMinutes(s)) min"
}

// Remaining minutes, derived from the ETA and how far along the route we are
// (distance-driven), so it holds when the traveller stops. Min 1.
private func omwEtaMinutes(_ s: OmwActivityAttributes.ContentState) -> Int {
    let total = s.etaAt.timeIntervalSince(s.startedAt)
    let remaining = max(0, total * (1 - min(1, max(0, s.progress))))
    return max(1, Int(ceil(remaining / 60)))
}

// The line under the title: the server-driven narration (progress-banded copy),
// falling back to the opening tagline before the first update lands.
private let omwSubtitle = "Wait and save? I think not."
private func omwLine(_ s: OmwActivityAttributes.ContentState) -> String {
    if s.arrived { return s.message }   // the random arrival subtitle
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
                    Image(spriteLeft(context.attributes)).resizable().scaledToFit().frame(width: 33, height: 33)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(spriteRight(context.attributes)).resizable().scaledToFit().frame(width: 33, height: 33)
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
                    Image(spriteLeft(context.attributes)).resizable().scaledToFit().frame(width: 33, height: 33)
                    ZStack {
                        DashedLine(color: .white)
                        OmwProgressFill(progress: progress, color: .white)
                        OmwWaypointNodes(reached: reached)
                    }
                    .frame(height: 12)
                    Image(spriteRight(context.attributes)).resizable().scaledToFit().frame(width: 33, height: 33)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity)
        .widgetURL(omwDeepLink)
    }
}
