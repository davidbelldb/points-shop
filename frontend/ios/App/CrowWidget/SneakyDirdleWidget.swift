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

// MARK: - Mini grid

private struct DirdleGrid: View {
    let rows: [[String]]      // states per cell, or empty for outline mode
    let outlineOnly: Bool
    let cell: CGFloat = 8
    let gap: CGFloat = 1.5

    var body: some View {
        VStack(spacing: gap) {
            ForEach(0..<max(rows.count, 1), id: \.self) { r in
                HStack(spacing: gap) {
                    ForEach(0..<5, id: \.self) { c in
                        square(state: rows.indices.contains(r) && rows[r].indices.contains(c) ? rows[r][c] : "absent")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func square(state: String) -> some View {
        if outlineOnly {
            RoundedRectangle(cornerRadius: 1.5)
                .stroke(.white.opacity(0.85), lineWidth: 1)
                .frame(width: cell, height: cell)
        } else {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(fill(state))
                .frame(width: cell, height: cell)
        }
    }

    // Monochrome mapping: solid = correct, half = present, faint outline = absent.
    private func fill(_ state: String) -> Color {
        switch state {
        case "correct": return .white
        case "present": return .white.opacity(0.5)
        default: return .white.opacity(0.15)
        }
    }
}

// MARK: - View

struct DirdleLockView: View {
    let data: WDirdle?

    var body: some View {
        content
            .widgetURL(URL(string: "https://sneakypoints.com/games/dirty-wordle"))
    }

    @ViewBuilder
    private var content: some View {
        let name = data?.name ?? "They"
        switch data?.status {
        case "completed":
            HStack(spacing: 8) {
                DirdleGrid(rows: data?.grid ?? [], outlineOnly: false)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 3) {
                        Image(systemName: (data?.won ?? false) ? "checkmark.circle.fill" : "xmark.circle")
                        Text("\(data?.attempts ?? 0)/\(data?.max ?? 6)")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundStyle(.white.opacity(0.85))
                }
                Spacer(minLength: 0)
            }
        case "in_progress":
            HStack(spacing: 8) {
                DirdleGrid(rows: Array(repeating: [], count: data?.attempts ?? 1), outlineOnly: true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(name).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    Text("mid-dirdle · \(data?.attempts ?? 0)/\(data?.max ?? 6)")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
        default:
            VStack(alignment: .leading, spacing: 2) {
                Label {
                    Text("Dirdle").font(.system(size: 13, weight: .semibold))
                } icon: {
                    Image(systemName: "square.grid.3x3.fill")
                }
                Text("\(name) is yet to dirdle today")
                    .font(.system(size: 12)).foregroundStyle(.secondary)
                    .lineLimit(2)
            }
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
