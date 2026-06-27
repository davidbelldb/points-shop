import ActivityKit
import WidgetKit
import SwiftUI

private let teal = Color(red: 0.086, green: 0.557, blue: 0.467)   // #168e77 timeline
private let plum = Color(red: 0.63, green: 0.30, blue: 0.54)       // #a04d89 fallback bg

// A crow at each end of the journey: crow_land_00 departs on the left,
// crow_land_10 waits (perched) on the right. Both are shown at all times.
private let crowLeft = "crow_land_00"
private let crowRight = "crow_land_10"

private func title(_ landed: Bool) -> String {
    landed ? "A crow has arrived" : "A crow has been dispatched"
}

struct CrowWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CrowActivityAttributes.self) { context in
            CrowLockScreenView(context: context)
                .activityBackgroundTint(plum)            // shows if tile image missing
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
                    VStack(spacing: 4) {
                        Text(title(context.state.landed)).font(.headline)
                        if !context.state.landed {
                            ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                         countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(teal)
                        }
                    }
                }
            } compactLeading: {
                Image(crowLeft).resizable().scaledToFit()
            } compactTrailing: {
                Image(crowRight).resizable().scaledToFit()
            } minimal: {
                Image(crowRight).resizable().scaledToFit()
            }
        }
    }
}

// Lock-screen / banner: tile.png background, black text, a crow at each end of a
// timeline bar that auto-fills as the flight progresses.
struct CrowLockScreenView: View {
    let context: ActivityViewContext<CrowActivityAttributes>

    private var subtitle: String {
        context.state.landed
            ? "Important news from \(context.attributes.originLabel)"
            : "Important news will be arriving shortly"
    }

    var body: some View {
        ZStack {
            Image("tile").resizable().scaledToFill()
            VStack(spacing: 8) {
                Text(title(context.state.landed))
                    .font(.custom("ImperialBlack", size: 22))
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)

                Text(subtitle)
                    .font(.custom("ImperialBlack", size: 12))
                    .foregroundColor(.black)
                    .opacity(0.85)
                    .multilineTextAlignment(.center)

                HStack(spacing: 10) {
                    Image(crowLeft).resizable().scaledToFit().frame(width: 30, height: 30)
                    ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                 countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                        .tint(teal)
                    Image(crowRight).resizable().scaledToFit().frame(width: 30, height: 30)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
        }
        .frame(maxWidth: .infinity)
    }
}
