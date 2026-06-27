import ActivityKit
import WidgetKit
import SwiftUI

// Colours
private let teal = Color(red: 0.086, green: 0.557, blue: 0.467)   // #168e77 timeline
private let plum = Color(red: 0.63, green: 0.30, blue: 0.54)       // #a04d89 fallback bg

// Crow sprite name for the current state. NOTE: Live Activities can't animate
// frame-by-frame (no per-200ms timer in a widget), so this is a single static
// frame — a flying pose in flight, the perched crow once delivered.
private func crowImage(_ landed: Bool) -> String { landed ? "crow_land_10" : "crow_land_01" }

struct CrowWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CrowActivityAttributes.self) { context in
            CrowLockScreenView(context: context)
                .activityBackgroundTint(plum)            // shows if tile image is missing
                .activitySystemActionForegroundColor(.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(crowImage(context.state.landed))
                        .resizable().scaledToFit().frame(width: 30, height: 30)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if !context.state.landed {
                        Text(timerInterval: context.state.startedAt...context.state.arrivesAt, countsDown: true)
                            .monospacedDigit().frame(maxWidth: 64).multilineTextAlignment(.trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.landed ? "A crow has arrived" : "A crow has been dispatched")
                        .font(.headline)
                }
            } compactLeading: {
                Image(crowImage(context.state.landed)).resizable().scaledToFit()
            } compactTrailing: {
                if context.state.landed {
                    Image("crow_land_10").resizable().scaledToFit()
                } else {
                    Text(timerInterval: context.state.startedAt...context.state.arrivesAt, countsDown: true)
                        .monospacedDigit().frame(maxWidth: 44)
                }
            } minimal: {
                Image(crowImage(context.state.landed)).resizable().scaledToFit()
            }
        }
    }
}

// Lock-screen / banner presentation: tile.png background, black text, and a
// timeline bar that auto-fills as the crow flies.
struct CrowLockScreenView: View {
    let context: ActivityViewContext<CrowActivityAttributes>

    var body: some View {
        ZStack {
            Image("tile").resizable().scaledToFill()
            VStack(spacing: 10) {
                Text(context.state.landed ? "A crow has arrived" : "A crow has been dispatched")
                    .font(.custom("ImperialBlack", size: 22))
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)

                if context.state.landed {
                    Text("Important news from \(context.attributes.originLabel)")
                        .font(.custom("ImperialBlack", size: 13))
                        .foregroundColor(.black)
                        .multilineTextAlignment(.center)
                } else {
                    HStack(spacing: 10) {
                        Image(crowImage(false))
                            .resizable().scaledToFit().frame(width: 34, height: 34)
                        ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                     countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                            .tint(teal)
                        Text(timerInterval: context.state.startedAt...context.state.arrivesAt, countsDown: true)
                            .font(.custom("ImperialBlack", size: 13))
                            .foregroundColor(.black)
                            .monospacedDigit()
                            .frame(width: 52)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity)
    }
}
