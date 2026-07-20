//
//  SneakyDirdleWidget.swift
//  CrowWidget
//
//  Lock-screen (accessoryRectangular) widget showing the PARTNER's Dirdle
//  status for today, so David and Katie can see at a glance how the other did:
//   • not played  → "{name} is yet to dirdle today"
//   • in progress → outline grid of their attempts so far + n/6
//   • completed   → filled grid + n/6 (✓ if won)
//  Lock-screen widgets render monochrome/tinted — native white opacity is fine.
//

import WidgetKit
import SwiftUI

// MARK: - Timeline

struct DirdleEntry: TimelineEntry {
    let date: Date
    let data: WDirdle?
}

struct DirdleProvider: TimelineProvider {
    func placeholder(in context: Context) -> DirdleEntry {
        DirdleEntry(date: Date(), data: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (DirdleEntry) -> Void) {
        Task { completion(DirdleEntry(date: Date(), data: await WidgetAPI.dirdle())) }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DirdleEntry>) -> Void) {
        Task {
            let data = await WidgetAPI.dirdle()
            let now = Date()
            var cal = Calendar(identifier: .gregorian); cal.timeZone = WDate.london
            let refresh = cal.date(byAdding: .minute, value: 30, to: now) ?? now.addingTimeInterval(1800)
            completion(Timeline(entries: [DirdleEntry(date: now, data: data)], policy: .after(refresh)))
        }
    }
}

// MARK: - View

/// Compact glance: just the grid + the n/6 counter. No name, no tick.
/// The grid is 1–2 rows — outlined (stroke) while the game is incomplete,
/// filled once it's complete.
struct DirdleLockView: View {
    let data: WDirdle?
    private var isComplete: Bool { data?.status == "completed" }
    private var attempts: Int { data?.attempts ?? 0 }
    private var name: String { data?.name ?? "They" }
    private var attemptsText: String {
        attempts == 0 ? "yet to play" : "\(attempts) attempt\(attempts == 1 ? "" : "s")"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                Text("|")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Text(attemptsText)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            GeometryReader { geo in
                let gap: CGFloat = 5
                let side = min((geo.size.width - gap * 4) / 5, geo.size.height)
                HStack(spacing: gap) {
                    ForEach(0..<5, id: \.self) { _ in
                        box.frame(width: side, height: side)
                    }
                }
                // Sit the row directly under the title (top-aligned) so its top
                // lines up with the calendar widget's date line opposite.
                .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        // Tap → the partner's full grid (leaderboard modal) in the app.
        .widgetURL(URL(string: "https://sneakypoints.com/games/dirty-wordle?board=1"))
    }

    // One row of five SQUARES: stroke-only while their game is in progress, solid
    // once it's complete.
    @ViewBuilder
    private var box: some View {
        if isComplete {
            RoundedRectangle(cornerRadius: 4).fill(.white)
        } else {
            RoundedRectangle(cornerRadius: 4).strokeBorder(.white, lineWidth: 2)
        }
    }
}

// MARK: - Widget

struct SneakyDirdleEntryView: View {
    var entry: DirdleProvider.Entry
    var body: some View { DirdleLockView(data: entry.data) }
}

struct SneakyDirdleWidget: Widget {
    let kind = "SneakyDirdleWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DirdleProvider()) { entry in
            SneakyDirdleEntryView(entry: entry)
        }
        .configurationDisplayName("Sneaky Dirdle")
        .description("How your partner did at today's Dirdle.")
        .supportedFamilies([.accessoryRectangular])
    }
}
