//
//  SneakyWatchWidgets.swift
//  SneakyWatchWidget (watchOS widget extension)
//
//  Rectangular watch widgets — they appear as swipe-up Smart Stack tiles and can
//  be pinned to a watch face as a large-rectangular complication (same
//  accessoryRectangular family). Reuses the shared models / API client / theme
//  (SneakyWidgetShared.swift must be a member of this target too).
//

import WidgetKit
import SwiftUI

// MARK: - Calendar (next event)

struct WatchCalendarEntry: TimelineEntry {
    let date: Date
    let data: WCalendar?
}

struct WatchCalendarProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchCalendarEntry {
        WatchCalendarEntry(date: Date(), data: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (WatchCalendarEntry) -> Void) {
        Task { completion(WatchCalendarEntry(date: Date(), data: await WidgetAPI.calendar())) }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchCalendarEntry>) -> Void) {
        Task {
            let data = await WidgetAPI.calendar()
            let now = Date()
            let next = Calendar.current.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
            completion(Timeline(entries: [WatchCalendarEntry(date: now, data: data)], policy: .after(next)))
        }
    }
}

struct WatchCalendarView: View {
    let data: WCalendar?
    var body: some View {
        Group {
            if let ev = data?.next, let start = ev.start {
                VStack(alignment: .leading, spacing: 1) {
                    Text(ev.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                    Text(line(start, allDay: ev.allDay))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Color(hex: 0x61DBBB))
                        .lineLimit(1)
                    if let loc = ev.location, !loc.isEmpty {
                        Text(loc).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            } else {
                Text("No events coming up")
                    .font(.system(size: 14, weight: .medium))
            }
        }
        .widgetURL(URL(string: "https://sneakypoints.com/calendar"))
    }
    private func line(_ d: Date, allDay: Bool) -> String {
        let df = DateFormatter(); df.timeZone = WDate.london
        df.dateFormat = allDay ? "EEE d MMM" : "EEE d MMM  HH:mm"
        return df.string(from: d)
    }
}

struct SneakyWatchCalendarWidget: Widget {
    let kind = "SneakyWatchCalendarWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WatchCalendarProvider()) { entry in
            WatchCalendarView(data: entry.data)
        }
        .configurationDisplayName("Sneaky Calendar")
        .description("What's coming up next.")
        .supportedFamilies([.accessoryRectangular])
    }
}

// MARK: - Dirdle (partner status)

struct WatchDirdleEntry: TimelineEntry {
    let date: Date
    let data: WDirdle?
}

struct WatchDirdleProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchDirdleEntry {
        WatchDirdleEntry(date: Date(), data: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (WatchDirdleEntry) -> Void) {
        Task { completion(WatchDirdleEntry(date: Date(), data: await WidgetAPI.dirdle())) }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchDirdleEntry>) -> Void) {
        Task {
            let data = await WidgetAPI.dirdle()
            let now = Date()
            let next = Calendar.current.date(byAdding: .minute, value: 30, to: now) ?? now.addingTimeInterval(1800)
            completion(Timeline(entries: [WatchDirdleEntry(date: now, data: data)], policy: .after(next)))
        }
    }
}

struct WatchDirdleView: View {
    let data: WDirdle?

    private var isComplete: Bool { data?.status == "completed" }
    // Just the partner's latest guess row (5 states).
    private var lastRow: [String]? { data?.grid?.last }
    private var attempts: Int { data?.attempts ?? 0 }
    private var title: String {
        let name = data?.name ?? "They"
        return attempts > 0 ? "\(name) · \(dirdleOrdinal(attempts)) attempt" : "\(name) · yet to play"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            GeometryReader { geo in
                let gap: CGFloat = 3
                let side = min((geo.size.width - gap * 4) / 5, geo.size.height)
                HStack(spacing: gap) {
                    ForEach(0..<5, id: \.self) { i in
                        cell(lastRow != nil && lastRow!.indices.contains(i) ? lastRow![i] : nil)
                            .frame(width: side, height: side)
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height, alignment: .bottom)
            }
        }
        // Tap → open the app to the partner's full grid (leaderboard modal).
        .widgetURL(URL(string: "https://sneakypoints.com/games/dirty-wordle?board=1"))
    }

    // Square boxes: solid when their game is complete, outlined while in
    // progress — either way tinted with the real Dirdle colours.
    @ViewBuilder
    private func cell(_ state: String?) -> some View {
        let c = dirdleColour(state)
        if isComplete {
            RoundedRectangle(cornerRadius: 3).fill(c)
        } else {
            RoundedRectangle(cornerRadius: 3).strokeBorder(c, lineWidth: 2)
        }
    }

    private func dirdleColour(_ state: String?) -> Color {
        switch state {
        case "correct": return Color(hex: 0x61DBBB) // teal
        case "present": return Color(hex: 0xED70BD) // pink
        case "absent":  return Color(hex: 0x525252) // grey
        default:        return Color(hex: 0x525252).opacity(0.5)
        }
    }
}

struct SneakyWatchDirdleWidget: Widget {
    let kind = "SneakyWatchDirdleWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WatchDirdleProvider()) { entry in
            WatchDirdleView(data: entry.data)
        }
        .configurationDisplayName("Sneaky Dirdle")
        .description("How your partner did at today's Dirdle.")
        .supportedFamilies([.accessoryRectangular])
    }
}

// MARK: - Bundle

@main
struct SneakyWatchWidgetBundle: WidgetBundle {
    var body: some Widget {
        SneakyWatchCalendarWidget()
        SneakyWatchDirdleWidget()
    }
}
