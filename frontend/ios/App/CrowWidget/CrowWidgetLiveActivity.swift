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
        ? "News from \(a.originLabel)."
        : "A scroll will be arriving shortly."
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
            .stroke(color, style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [4, 7]))
        }
        .frame(height: 12)
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
                            Capsule().fill(Color.black).frame(height: 4)   // arrived → full solid
                        } else {
                            ProgressView(timerInterval: context.state.startedAt...context.state.arrivesAt,
                                         countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(.black)
                        }
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
