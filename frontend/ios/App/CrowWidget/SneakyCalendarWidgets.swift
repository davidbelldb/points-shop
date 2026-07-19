//
//  SneakyCalendarWidgets.swift
//  CrowWidget
//
//  Sneaky Calendar — home-screen (small + medium) and lock-screen (rectangular)
//  widgets. Mimics the native iOS calendar widget in the app's own colours: a
//  dark ground, pink event-day circles, a teal "today" ring, and a rich
//  next-event panel.
//

import WidgetKit
import SwiftUI

// MARK: - Timeline

struct CalendarEntry: TimelineEntry {
    let date: Date
    let data: WCalendar?
}

struct CalendarProvider: TimelineProvider {
    func placeholder(in context: Context) -> CalendarEntry {
        CalendarEntry(date: Date(), data: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (CalendarEntry) -> Void) {
        Task {
            let data = await WidgetAPI.calendar()
            completion(CalendarEntry(date: Date(), data: data))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry>) -> Void) {
        Task {
            let data = await WidgetAPI.calendar()
            let now = Date()
            // Refresh in an hour, but never later than the next local midnight so
            // "today" and the day circles roll over correctly.
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = WDate.london
            let hourly = cal.date(byAdding: .hour, value: 1, to: now) ?? now.addingTimeInterval(3600)
            let midnight = cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 5),
                                        matchingPolicy: .nextTime) ?? hourly
            let next = min(hourly, midnight)
            completion(Timeline(entries: [CalendarEntry(date: now, data: data)], policy: .after(next)))
        }
    }
}

// MARK: - Month grid

private struct MonthGrid: View {
    let year: Int
    let month: Int
    let today: Int
    let eventDays: Set<Int>

    private var layout: (leading: Int, days: Int) {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2 // Monday
        let comps = DateComponents(year: year, month: month, day: 1)
        guard let first = cal.date(from: comps),
              let range = cal.range(of: .day, in: .month, for: first) else {
            return (0, 30)
        }
        let weekday = cal.component(.weekday, from: first) // 1=Sun … 7=Sat
        let leading = (weekday - cal.firstWeekday + 7) % 7
        return (leading, range.count)
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 3), count: 7)
    private let headers = ["M", "T", "W", "T", "F", "S", "S"]

    var body: some View {
        let l = layout
        VStack(spacing: 3) {
            HStack(spacing: 3) {
                ForEach(0..<7, id: \.self) { i in
                    Text(headers[i])
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.4))
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(columns: columns, spacing: 3) {
                ForEach(0..<(l.leading), id: \.self) { _ in Color.clear.frame(height: 19) }
                ForEach(1...l.days, id: \.self) { day in
                    dayCell(day)
                }
            }
        }
    }

    @ViewBuilder
    private func dayCell(_ day: Int) -> some View {
        let isToday = day == today
        let hasEvent = eventDays.contains(day)
        // No more circles — just colour the number: teal for today, pink for an
        // event day, muted white otherwise. Reads far less congested.
        let colour: Color = isToday ? .sneakyTeal : (hasEvent ? .sneakyPink : .white.opacity(0.85))
        Text("\(day)")
            .font(.system(size: 12, weight: (isToday || hasEvent) ? .bold : .medium))
            .foregroundStyle(colour)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .frame(width: 19, height: 19)
            .frame(maxWidth: .infinity)
    }
}

// MARK: - Next-event panel

private struct NextEventPanel: View {
    let event: WNextEvent?
    var compact: Bool = false

    var body: some View {
        if let ev = event {
            VStack(alignment: .leading, spacing: compact ? 4 : 7) {
                Text("UP NEXT")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white.opacity(0.45))
                Text(ev.title)
                    .font(.system(size: compact ? 14 : 19, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if let start = ev.start {
                    Text(dateLine(start, allDay: ev.allDay))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.sneakyTeal)
                }
                if let loc = ev.location, !loc.isEmpty {
                    Text(loc)
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.6))
                        .lineLimit(1)
                }
                if !compact {
                    badges(ev)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Nothing coming up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
                Text("Enjoy the quiet 🖤")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.4))
            }
        }
    }

    @ViewBuilder
    private func badges(_ ev: WNextEvent) -> some View {
        HStack(spacing: 6) {
            if ev.gifts { pill("gift.fill", "Gifts") }
            if ev.showAndTell { pill("sparkles", "Show & tell") }
            if ev.snackCount > 0 { pill("takeoutbag.and.cup.and.straw.fill", "\(ev.snackCount) snack\(ev.snackCount == 1 ? "" : "s")") }
        }
    }

    private func pill(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 10))
            Text(text).font(.system(size: 11, weight: .medium))
        }
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(Capsule().fill(Color.sneakyPink.opacity(0.22)))
        .foregroundStyle(Color.sneakyPink)
    }

    private func dateLine(_ date: Date, allDay: Bool) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = WDate.london
        let df = DateFormatter()
        df.timeZone = WDate.london
        if cal.isDateInToday(date) {
            df.dateFormat = allDay ? "'Today'" : "'Today' HH:mm"
        } else if cal.isDateInTomorrow(date) {
            df.dateFormat = allDay ? "'Tomorrow'" : "'Tomorrow' HH:mm"
        } else {
            df.dateFormat = allDay ? "EEE d MMM" : "EEE d MMM  HH:mm"
        }
        return df.string(from: date)
    }
}

// MARK: - Family views

private struct CalendarMediumView: View {
    let data: WCalendar?
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            NextEventPanel(event: data?.next)
                .frame(maxWidth: .infinity, alignment: .leading)
            Rectangle().fill(.white.opacity(0.08)).frame(width: 1).frame(maxHeight: .infinity)
            VStack(alignment: .leading, spacing: 6) {
                Text(monthTitle)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white.opacity(0.45))
                if let d = data {
                    MonthGrid(year: d.year, month: d.month, today: d.today,
                              eventDays: Set(d.eventDays))
                } else {
                    placeholderGrid
                }
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 11)
        .padding(.vertical, 13)
        .sneakyContainerBackground(Color.sneakyBG)
    }
    // Uppercase month name to sit beside "UP NEXT" (matches the native layout).
    private var monthTitle: String {
        guard let d = data else { return "" }
        let symbols = DateFormatter().monthSymbols ?? []
        let idx = max(0, min(11, d.month - 1))
        return idx < symbols.count ? symbols[idx].uppercased() : ""
    }
    private var placeholderGrid: some View {
        RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.05))
    }
}

private struct CalendarSmallView: View {
    let data: WCalendar?
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let d = data, let ev = d.next, let start = ev.start {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: -2) {
                        Text(weekday(start)).font(.system(size: 11, weight: .bold))
                            .foregroundStyle(Color.sneakyPink)
                        Text(dayNum(start)).font(.system(size: 30, weight: .heavy))
                            .foregroundStyle(.white)
                    }
                    Spacer()
                    Image(systemName: sneakySymbol(for: ev.icon))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color.sneakyTeal)
                }
                Text(ev.title).font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white).lineLimit(2)
                Spacer(minLength: 0)
                Text(timeOrCountdown(ev, start))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            } else {
                Text("Sneaky Calendar").font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Color.sneakyPink)
                Spacer()
                Text("Nothing coming up").font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .sneakyContainerBackground(Color.sneakyBG)
    }
    private func weekday(_ d: Date) -> String { fmt(d, "EEE").uppercased() }
    private func dayNum(_ d: Date) -> String { fmt(d, "d") }
    private func timeOrCountdown(_ ev: WNextEvent, _ d: Date) -> String {
        if ev.allDay { return fmt(d, "EEE d MMM") }
        return fmt(d, "EEE d MMM · HH:mm")
    }
    private func fmt(_ d: Date, _ f: String) -> String {
        let df = DateFormatter(); df.timeZone = WDate.london; df.dateFormat = f
        return df.string(from: d)
    }
}

private struct CalendarLockView: View {
    let data: WCalendar?
    var body: some View {
        if let ev = data?.next, let start = ev.start {
            VStack(alignment: .leading, spacing: 1) {
                Text(ev.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                Text(lockDate(start, allDay: ev.allDay))
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                    .lineLimit(1)
                if let loc = ev.location, !loc.isEmpty {
                    Text(loc)
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .widgetURL(URL(string: "https://sneakypoints.com/calendar"))
        } else {
            Text("No events coming up")
                .font(.system(size: 13, weight: .medium))
        }
    }
    private func lockDate(_ d: Date, allDay: Bool) -> String {
        let df = DateFormatter(); df.timeZone = WDate.london
        df.dateFormat = allDay ? "EEE d MMM" : "EEE d MMM  HH:mm"
        return df.string(from: d)
    }
}

// MARK: - Widget

struct SneakyCalendarEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: CalendarProvider.Entry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            CalendarLockView(data: entry.data)
        case .systemSmall:
            CalendarSmallView(data: entry.data)
                .widgetURL(URL(string: "https://sneakypoints.com/calendar"))
        default:
            CalendarMediumView(data: entry.data)
                .widgetURL(URL(string: "https://sneakypoints.com/calendar"))
        }
    }
}

struct SneakyCalendarWidget: Widget {
    let kind = "SneakyCalendarWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CalendarProvider()) { entry in
            SneakyCalendarEntryView(entry: entry)
        }
        .configurationDisplayName("Sneaky Calendar")
        .description("This month's events and what's coming up next.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
