//
//  SneakyDirdleBoardWidget.swift
//  CrowWidget
//
//  Home-screen (systemMedium) widget that mirrors the in-game Dirdle score
//  modal: both players side by side (divider between, like the calendar widget)
//  with their profile photo, name, and a full 6×5 board — filled colours for a
//  finished game, stroke outlines while in progress, faint empties for rows not
//  yet guessed. The caller is tinted teal, their partner pink.
//

import WidgetKit
import SwiftUI
import UIKit

// MARK: - Timeline

struct DirdleBoardEntry: TimelineEntry {
    let date: Date
    let board: WDirdleBoard?
    let photos: [String: Data]   // player id → image bytes
}

struct DirdleBoardProvider: TimelineProvider {
    func placeholder(in context: Context) -> DirdleBoardEntry {
        DirdleBoardEntry(date: Date(), board: nil, photos: [:])
    }
    func getSnapshot(in context: Context, completion: @escaping (DirdleBoardEntry) -> Void) {
        Task {
            let board = await WidgetAPI.dirdleBoard()
            completion(DirdleBoardEntry(date: Date(), board: board, photos: await loadPhotos(board)))
        }
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DirdleBoardEntry>) -> Void) {
        Task {
            let board = await WidgetAPI.dirdleBoard()
            let photos = await loadPhotos(board)
            let now = Date()
            var cal = Calendar(identifier: .gregorian); cal.timeZone = WDate.london
            let quarter = cal.date(byAdding: .minute, value: 15, to: now) ?? now.addingTimeInterval(900)
            let midnight = cal.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0, second: 5),
                                        matchingPolicy: .nextTime) ?? quarter
            completion(Timeline(entries: [DirdleBoardEntry(date: now, board: board, photos: photos)],
                                policy: .after(min(quarter, midnight))))
        }
    }
    private func loadPhotos(_ board: WDirdleBoard?) async -> [String: Data] {
        var out: [String: Data] = [:]
        for p in board?.players ?? [] {
            if let data = await WidgetAPI.imageData(p.photoUrl) { out[p.id] = data }
        }
        return out
    }
}

// MARK: - View

struct DirdleBoardView: View {
    var entry: DirdleBoardProvider.Entry

    var body: some View {
        Group {
            if let players = entry.board?.players, players.count >= 2 {
                HStack(spacing: 12) {
                    column(players[0])
                    Rectangle().fill(.white.opacity(0.08)).frame(width: 1).frame(maxHeight: .infinity)
                    column(players[1])
                }
            } else {
                VStack(spacing: 4) {
                    Text("DIRDLE").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.sneakyPink)
                    Text("Open the app while logged in").font(.system(size: 11)).foregroundStyle(.white.opacity(0.5))
                }
            }
        }
        .padding(12)
        .sneakyContainerBackground(Color.sneakyBG)
        .widgetURL(URL(string: "https://sneakypoints.com/games/dirty-wordle?board=1"))
    }

    private func column(_ p: WDirdlePlayer) -> some View {
        let accent = p.isMe ? Color(hex: 0x61DBBB) : Color(hex: 0xED70BD)
        return VStack(spacing: 6) {
            HStack(spacing: 6) {
                avatar(p, accent: accent)
                Text(p.name.uppercased())
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(accent)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
            }
            board(p)
            statusLine(p, accent: accent)
        }
        .frame(maxWidth: .infinity)
    }

    private func avatar(_ p: WDirdlePlayer, accent: Color) -> some View {
        Group {
            if let data = entry.photos[p.id], let ui = UIImage(data: data) {
                Image(uiImage: ui).resizable().scaledToFill()
            } else {
                ZStack {
                    Color.sneakyBGHi
                    Text(String(p.name.prefix(1)).uppercased())
                        .font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                }
            }
        }
        .frame(width: 20, height: 20)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(accent, lineWidth: 1.5))
    }

    private func board(_ p: WDirdlePlayer) -> some View {
        let isComplete = p.status == "completed"
        return VStack(spacing: 2) {
            ForEach(0..<6, id: \.self) { r in
                HStack(spacing: 2) {
                    ForEach(0..<5, id: \.self) { c in
                        let played = r < p.grid.count
                        let state: String? = (played && c < p.grid[r].count) ? p.grid[r][c] : nil
                        cell(state: state, played: played, isComplete: isComplete)
                    }
                }
            }
        }
    }

    // Played + complete → solid colour; played + in-progress → stroke colour;
    // not yet played → faint empty box.
    @ViewBuilder
    private func cell(state: String?, played: Bool, isComplete: Bool) -> some View {
        let c = dirdleColour(state)
        if played && isComplete {
            RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 13, height: 13)
        } else if played {
            RoundedRectangle(cornerRadius: 2).strokeBorder(c, lineWidth: 1.5).frame(width: 13, height: 13)
        } else {
            RoundedRectangle(cornerRadius: 2).fill(Color.white.opacity(0.06)).frame(width: 13, height: 13)
        }
    }

    private func statusLine(_ p: WDirdlePlayer, accent: Color) -> some View {
        let text: String
        let max = entry.board?.max ?? 6
        switch p.status {
        case "completed": text = (p.won ?? false) ? "\(p.attempts)/\(max)" : "X/\(max)"
        case "in_progress": text = "\(p.attempts)/\(max)"
        default: text = "yet to play"
        }
        return Text(text)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(p.status == "not_played" ? .white.opacity(0.5) : accent)
    }

    private func dirdleColour(_ state: String?) -> Color {
        switch state {
        case "correct": return Color(hex: 0x61DBBB)
        case "present": return Color(hex: 0xED70BD)
        case "absent":  return Color(hex: 0x525252)
        default:        return Color(hex: 0x525252).opacity(0.5)
        }
    }
}

// MARK: - Widget

struct SneakyDirdleBoardWidget: Widget {
    let kind = "SneakyDirdleBoardWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DirdleBoardProvider()) { entry in
            DirdleBoardView(entry: entry)
        }
        .configurationDisplayName("Sneaky Dirdle Board")
        .description("Today's Dirdle for both of you, side by side.")
        .supportedFamilies([.systemMedium])
    }
}
