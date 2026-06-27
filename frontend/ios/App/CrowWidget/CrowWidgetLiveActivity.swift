import ActivityKit
import WidgetKit
import SwiftUI

// Minimal, bulletproof crow Live Activity — plain text on a solid background, no
// custom font / image / timer, so nothing can fail to render. Once this is
// confirmed showing on the lock screen / Dynamic Island we add the styling back.
struct CrowWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CrowActivityAttributes.self) { context in
            // Lock screen / banner.
            HStack(spacing: 10) {
                Text("🐦‍⬛").font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.landed ? "A crow has arrived" : "A crow has been dispatched")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("important news will be arriving shortly")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.85))
                }
                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity)
            .activityBackgroundTint(Color(red: 0.63, green: 0.30, blue: 0.54))
            .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.landed ? "A crow has arrived" : "A crow has been dispatched")
                        .font(.headline)
                }
            } compactLeading: {
                Text("🐦‍⬛")
            } compactTrailing: {
                Text(context.state.landed ? "✉️" : "🐦‍⬛")
            } minimal: {
                Text("🐦‍⬛")
            }
        }
    }
}
