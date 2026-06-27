import ActivityKit
import WidgetKit
import SwiftUI

private let bg = Color(red: 0.122, green: 0.122, blue: 0.118)      // #1f1f1e background
private let deepLink = URL(string: "sneakystuff://messages")

// A crow at each end of the journey: crow_land_00 departs on the left,
// crow_land_10 waits (perched) on the right. Both are shown at all times.
private let crowLeft = "crow_land_00"
private let crowRight = "crow_land_10"

private func title(_ landed: Bool) -> String {
    landed ? "A crow has arrived." : "A crow has been dispatched."
}

// Subtitle: server-driven (street-name updates) when present, else a sensible default.
private func subtitle(_ s: CrowActivityAttributes.ContentState, _ a: CrowActivityAttributes) -> String {
    if !s.message.isEmpty { return s.message }
    return s.landed ? "Important news from \(a.originLabel)" : "Important news will be arriving shortly"
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
                        Text(title(context.state.landed))
                            .font(.headline).foregroundColor(.white)
                        if !context.state.landed {
                            // White so it's visible on the black Dynamic Island.
                            ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                         countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(.white)
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
            .widgetURL(deepLink)   // tapping the island opens the chat
        }
    }
}

// Lock-screen / banner: tile.png background, black text, a crow at each end of a
// timeline bar that auto-fills as the flight progresses.
struct CrowLockScreenView: View {
    let context: ActivityViewContext<CrowActivityAttributes>

    var body: some View {
        ZStack {
            Image("tile").resizable().scaledToFill()
            VStack(spacing: 8) {
                Text(title(context.state.landed))
                    .font(.custom("ImperialBlack", size: 22))
                    .foregroundColor(.black)
                    .multilineTextAlignment(.center)

                Text(subtitle(context.state, context.attributes))
                    .font(.custom("ImperialBlack", size: 12))
                    .foregroundColor(.black)
                    .opacity(0.85)
                    .multilineTextAlignment(.center)

                HStack(spacing: 10) {
                    Image(crowLeft).resizable().scaledToFit().frame(width: 30, height: 30)
                    ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                 countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                        .tint(.black)
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
