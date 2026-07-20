import ActivityKit
import WidgetKit
import SwiftUI

// "On My Way" Live Activity. Reuses DashedLine + WaypointNodes from
// CrowWidgetLiveActivity.swift (same widget-extension target). No custom font,
// no background texture — a plain tint we can tweak once it's working.

// TODO(David): drop the pixelated cycling sprite PNGs into the widget's
// Assets.xcassets as image sets named below, then adjust these two constants if
// you want a distinct "departing" vs "waiting" frame. Both currently point at
// the same sprite. (See ON_MY_WAY_SETUP.md.)
private let cycleLeft = "david_cycle_00"
private let cycleRight = "david_cycle_00"

// Plain background tint (tweak later). Kept off-black so the sprites + black
// dashed trail read well.
private let omwBg = Color(red: 0.86, green: 0.92, blue: 0.97)   // soft sky
private let omwDeepLink = URL(string: "sneakystuff://new-chat")

private func omwTitle(_ a: OmwActivityAttributes, _ s: OmwActivityAttributes.ContentState) -> String {
    s.arrived
        ? "\(a.travellerName) has arrived"
        : "\(a.travellerName) is on his way and will be with you soon"
}

private let omwSubtitle = "Wait and save? I think not."

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

struct OmwLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OmwActivityAttributes.self) { context in
            OmwLockScreenView(context: context)
                .activityBackgroundTint(omwBg)
                .activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(cycleLeft).resizable().scaledToFit().frame(width: 30, height: 30)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Image(cycleRight).resizable().scaledToFit().frame(width: 30, height: 30)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        Text(omwTitle(context.attributes, context.state))
                            .font(.headline).foregroundColor(.white)
                            .multilineTextAlignment(.center)
                        Text(omwSubtitle)
                            .font(.caption).foregroundColor(.white).opacity(0.85)
                        ProgressView(value: context.state.arrived ? 1 : context.state.progress)
                            .tint(.white)
                            .frame(maxWidth: 195)
                    }
                }
            } compactLeading: {
                Image(cycleLeft).resizable().scaledToFit()
            } compactTrailing: {
                Image(cycleRight).resizable().scaledToFit()
            } minimal: {
                Image(cycleRight).resizable().scaledToFit()
            }
            .widgetURL(omwDeepLink)
        }
    }
}

// Lock-screen / banner: plain tint, black text + trail, a cycling sprite at each
// end of a dashed line with three waypoint nodes that pop as progress passes.
struct OmwLockScreenView: View {
    let context: ActivityViewContext<OmwActivityAttributes>

    var body: some View {
        let progress = context.state.arrived ? 1 : context.state.progress
        let reached = context.state.arrived ? 3 : context.state.phase

        VStack(spacing: 8) {
            Text(omwTitle(context.attributes, context.state))
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.black)
                .multilineTextAlignment(.center)

            Text(omwSubtitle)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.black)
                .opacity(0.8)
                .multilineTextAlignment(.center)

            HStack(spacing: 10) {
                Image(cycleLeft).resizable().scaledToFit().frame(width: 30, height: 30)
                ZStack {
                    DashedLine(color: .black)
                    OmwProgressFill(progress: progress, color: .black)
                    WaypointNodes(reached: reached)
                }
                .frame(height: 12)
                Image(cycleRight).resizable().scaledToFit().frame(width: 30, height: 30)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .widgetURL(omwDeepLink)
    }
}
