import ActivityKit
import WidgetKit
import SwiftUI

// The "crow in flight" Live Activity. It uses the shared CrowActivityAttributes
// type (defined in CrowActivityAttributes.swift, which must belong to BOTH the
// App and CrowWidget targets). Background is tile.png (add it to this widget's
// Assets catalog as "tile"); text is black, in ImperialBlack if that font is
// bundled into the widget, otherwise the iOS default.
struct CrowWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CrowActivityAttributes.self) { context in
            // Lock screen / notification banner.
            ZStack {
                Image("tile")
                    .resizable()
                    .scaledToFill()
                VStack(spacing: 4) {
                    Text(context.state.landed ? "A crow has arrived" : "A crow has been dispatched")
                        .font(.custom("ImperialBlack", size: 20))
                        .foregroundColor(.black)
                        .multilineTextAlignment(.center)
                    Text("important news will be arriving shortly")
                        .font(.custom("ImperialBlack", size: 13))
                        .foregroundColor(.black)
                        .opacity(0.85)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .activityBackgroundTint(Color.clear)
            .activitySystemActionForegroundColor(Color.black)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(context.state.landed ? "A crow has arrived" : "A crow has been dispatched")
                            .font(.headline)
                        if !context.state.landed {
                            Text(timerInterval: context.state.startedAt...context.state.arrivesAt, countsDown: true)
                                .font(.caption)
                                .monospacedDigit()
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 120)
                        }
                    }
                }
            } compactLeading: {
                Text("🐦‍⬛")
            } compactTrailing: {
                if context.state.landed {
                    Image(systemName: "envelope.fill")
                } else {
                    Text(timerInterval: context.state.startedAt...context.state.arrivesAt, countsDown: true)
                        .monospacedDigit()
                        .frame(maxWidth: 44)
                }
            } minimal: {
                Text("🐦‍⬛")
            }
        }
    }
}
