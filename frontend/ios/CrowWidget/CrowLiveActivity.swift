import ActivityKit
import WidgetKit
import SwiftUI

/// The "crow in flight" Live Activity — lock-screen banner + Dynamic Island.
///
/// Background is the bundled `tile` image (add tile.png to THIS widget target's
/// Assets as an image set named "tile"). Text is black, in the ImperialBlack
/// font if it's bundled with the widget (else it falls back to a heavy system
/// font automatically). Drag ImperialBlack-zr5A0.ttf into this target and add
/// it to the widget's Info.plist under "Fonts provided by application".
@available(iOS 16.1, *)
struct CrowLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CrowActivityAttributes.self) { context in
            CrowBannerView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.center) {
                    CrowBannerView(state: context.state)
                }
            } compactLeading: {
                Image(systemName: "bird.fill")
            } compactTrailing: {
                if context.state.landed {
                    Image(systemName: "envelope.open.fill")
                } else {
                    Text(timerInterval: context.state.startedAt...context.state.arrivesAt, countsDown: true)
                        .monospacedDigit()
                        .frame(maxWidth: 54)
                }
            } minimal: {
                Image(systemName: "bird.fill")
            }
        }
    }
}

@available(iOS 16.1, *)
struct CrowBannerView: View {
    let state: CrowActivityAttributes.ContentState

    // Custom face if present; SwiftUI falls back to the system font silently if
    // "ImperialBlack" isn't registered, so this is safe either way.
    private func imperial(_ size: CGFloat) -> Font { Font.custom("ImperialBlack", size: size) }

    var body: some View {
        ZStack {
            Image("tile")
                .resizable()
                .scaledToFill()

            VStack(spacing: 4) {
                Text(state.landed ? "A crow has arrived" : "A crow has been dispatched")
                    .font(imperial(20))
                    .foregroundColor(.black)
                Text(state.landed ? "important news has arrived" : "important news will be arriving shortly")
                    .font(imperial(13))
                    .foregroundColor(.black)
                if !state.landed {
                    Text(timerInterval: state.startedAt...state.arrivesAt, countsDown: true)
                        .font(imperial(15))
                        .monospacedDigit()
                        .foregroundColor(.black)
                }
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .activityBackgroundTint(.clear)
        .activitySystemActionForegroundColor(.black)
    }
}
