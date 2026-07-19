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
                    Label {
                        Text(ev.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                    } icon: {
                        Image(systemName: sneakySymbol(for: ev.icon))
                    }
                    Text(line(start, allDay: ev.allDay))
                        .font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(1)
                    if let loc = ev.location, !loc.isEmpty {
                        Text(loc).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            } else {
                Label("No events coming up", systemImage: "calendar")
                    .font(.system(size: 14, weight: .medium))
            }
        }
        .widgetURL(URL(string: "https://sneakypoints.com/calendar"))
    }
    private func line(_ d: Date, allDay: Bool) -> String {
        let df = DateFormatter(); df.timeZone = WDate.london
        df.dateFormat = allDay ? "EEE d MMM" : "EEE d MMM · HH:mm"
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
    var body: some View {
        content.widgetURL(URL(string: "https://sneakypoints.com/games/dirty-wordle"))
    }

    @ViewBuilder
    private var content: some View {
        let name = data?.name ?? "They"
        switch data?.status {
        case "completed":
            HStack(spacing: 6) {
                miniGrid(rows: data?.grid ?? [], outline: false)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 2) {
                        Image(systemName: (data?.won ?? false) ? "checkmark.circle.fill" : "xmark.circle")
                        Text("\(data?.attempts ?? 0)/\(data?.max ?? 6)").font(.system(size: 14, weight: .bold))
                    }
                }
                Spacer(minLength: 0)
            }
        case "in_progress":
            HStack(spacing: 6) {
                miniGrid(rows: Array(repeating: [], count: data?.attempts ?? 1), outline: true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Text("mid-dirdle · \(data?.attempts ?? 0)/\(data?.max ?? 6)")
                        .font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
        default:
            Label {
                Text("\(name) is yet to dirdle").font(.system(size: 13, weight: .medium)).lineLimit(2)
            } icon: {
                Image(systemName: "square.grid.3x3.fill")
            }
        }
    }

    private func miniGrid(rows: [[String]], outline: Bool) -> some View {
        VStack(spacing: 1.2) {
            ForEach(0..<max(rows.count, 1), id: \.self) { r in
                HStack(spacing: 1.2) {
                    ForEach(0..<5, id: \.self) { c in
                        let state = rows.indices.contains(r) && rows[r].indices.contains(c) ? rows[r][c] : "absent"
                        RoundedRectangle(cornerRadius: 1)
                            .strokeBorder(.white.opacity(0.85), lineWidth: outline ? 1 : 0)
                            .background(outline ? Color.clear : fill(state))
                            .frame(width: 7, height: 7)
                    }
                }
            }
        }
    }
    private func fill(_ s: String) -> Color {
        switch s {
        case "correct": return .white
        case "present": return .white.opacity(0.5)
        default: return .white.opacity(0.15)
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
