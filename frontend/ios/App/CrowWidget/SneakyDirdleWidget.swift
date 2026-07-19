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

    private var attempts: Int { data?.attempts ?? 0 }
    private var maxGuesses: Int { data?.max ?? 6 }
    private var isComplete: Bool { data?.status == "completed" }
    // At least one row, at most two.
    private var rowCount: Int { min(max(attempts, 1), 2) }

    var body: some View {
        HStack(spacing: 9) {
            grid
            Spacer(minLength: 0)
        }
        .widgetURL(URL(string: "https://sneakypoints.com/games/dirty-wordle?board=1"))
    }

    private var grid: some View {
        VStack(spacing: 2.5) {
            ForEach(0..<rowCount, id: \.self) { _ in
                HStack(spacing: 2.5) {
                    ForEach(0..<5, id: \.self) { _ in cell }
                }
            }
        }
    }

    @ViewBuilder
    private var cell: some View {
        if isComplete {
            RoundedRectangle(cornerRadius: 2).fill(.white).frame(width: 12, height: 12)
        } else {
            RoundedRectangle(cornerRadius: 2).strokeBorder(.white, lineWidth: 1.3).frame(width: 12, height: 12)
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
