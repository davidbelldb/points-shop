//
//  SneakyWidgetShared.swift
//  CrowWidget
//
//  Shared model + networking + theming for the Sneaky home-screen and
//  lock-screen widgets. The app writes a bearer token + API base into the
//  shared App Group; these widgets read it and fetch their own data directly.
//

import Foundation
import SwiftUI
import WidgetKit

// MARK: - Shared storage (App Group)

enum SneakyWidget {
    // Must match the App Group added to BOTH the app and widget targets.
    static let appGroup = "group.com.david.sneakystuff"
    static let defaultAPIBase = "https://sneakypoints.com"

    enum Key {
        static let token = "widgetToken"
        static let apiBase = "apiBase"
    }

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
    static var token: String? { defaults?.string(forKey: Key.token) }
    static var apiBase: String { defaults?.string(forKey: Key.apiBase) ?? defaultAPIBase }
}

// MARK: - Theme

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255,
            opacity: alpha
        )
    }
    static let sneakyPink = Color(hex: 0xEE70BD) // as specified
    static let sneakyTeal = Color(hex: 0x15B8A6)
    static let sneakyBG   = Color(hex: 0x1F1F1E) // dark grey ground
    static let sneakyBGHi = Color(hex: 0x2A2A28)
}

// MARK: - Models (decoded from /api/widget/*)

struct WNextEvent: Decodable {
    let id: String
    let title: String
    let startsAt: String
    let endsAt: String?
    let allDay: Bool
    let location: String?
    let icon: String?
    let gifts: Bool
    let showAndTell: Bool
    let snackCount: Int

    var start: Date? { WDate.parse(startsAt) }
}

struct WCalendar: Decodable {
    let year: Int
    let month: Int          // 1–12
    let today: Int          // day-of-month
    let eventDays: [Int]
    let next: WNextEvent?
}

struct WDirdle: Decodable {
    let name: String?
    let date: String
    let max: Int
    let status: String      // not_played | in_progress | completed
    let won: Bool?
    let attempts: Int?
    let grid: [[String]]?   // rows of "correct" | "present" | "absent"
}

// Both players' boards for today (the score-modal widget).
struct WDirdlePlayer: Decodable {
    let id: String
    let name: String
    let photoUrl: String?
    let isMe: Bool
    let status: String      // not_played | in_progress | completed
    let won: Bool?
    let attempts: Int
    let grid: [[String]]    // coloured rows guessed so far
}

struct WDirdleBoard: Decodable {
    let date: String
    let max: Int
    let players: [WDirdlePlayer]
}

// MARK: - Date helpers

enum WDate {
    // API sends ISO-8601 with milliseconds ("2026-07-22T18:00:00.000Z").
    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let isoNoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    static func parse(_ s: String) -> Date? {
        iso.date(from: s) ?? isoNoFrac.date(from: s)
    }

    static var london: TimeZone { TimeZone(identifier: "Europe/London") ?? .current }
}

// MARK: - API client

enum WidgetAPI {
    static func calendar() async -> WCalendar? { await fetch("/api/widget/calendar") }
    static func dirdle() async -> WDirdle? { await fetch("/api/widget/dirdle") }
    static func dirdleBoard() async -> WDirdleBoard? { await fetch("/api/widget/dirdle-board") }

    // Download raw image bytes (profile photos) — widgets must fetch images in
    // the timeline provider, not lazily in the view. Foundation only, so this is
    // safe on both iOS and watchOS targets.
    static func imageData(_ urlString: String?) async -> Data? {
        guard let s = urlString, let url = URL(string: s) else { return nil }
        do {
            let (data, resp) = try await URLSession.shared.data(from: url)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            return data
        } catch {
            return nil
        }
    }

    private static func fetch<T: Decodable>(_ path: String) async -> T? {
        guard let token = SneakyWidget.token,
              let url = URL(string: SneakyWidget.apiBase + path) else { return nil }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 15
        req.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            let dec = JSONDecoder()
            dec.keyDecodingStrategy = .convertFromSnakeCase
            return try dec.decode(T.self, from: data)
        } catch {
            return nil
        }
    }
}

// MARK: - Event icon → SF Symbol (mirrors lib/eventIcons.jsx keys)

func sneakySymbol(for icon: String?) -> String {
    switch icon {
    case "food": return "fork.knife"
    case "coffee": return "cup.and.saucer.fill"
    case "cinema": return "film.fill"
    case "cake": return "party.popper.fill"
    case "gift": return "gift.fill"
    case "heart": return "heart.fill"
    case "music": return "music.note"
    case "camera": return "camera.fill"
    case "football": return "soccerball"
    case "tennis": return "figure.tennis"
    case "basketball": return "figure.basketball"
    case "boat": return "sailboat.fill"
    case "hiking": return "figure.hiking"
    case "bicycle": return "bicycle"
    case "beach": return "sun.max.fill"
    case "car": return "car.fill"
    case "plane": return "airplane"
    case "paw": return "pawprint.fill"
    case "book": return "book.fill"
    case "underwear": return "sparkles"
    case "laptop": return "laptopcomputer"
    case "gamecontroller": return "gamecontroller.fill"
    case "lips": return "heart.fill"
    default: return "calendar"
    }
}

// MARK: - Ordinal ("1st", "2nd", "3rd"…) for the Dirdle attempt title

func dirdleOrdinal(_ n: Int) -> String {
    let ones = n % 10, tens = (n / 10) % 10
    let suffix = (tens == 1) ? "th" : (ones == 1 ? "st" : ones == 2 ? "nd" : ones == 3 ? "rd" : "th")
    return "\(n)\(suffix)"
}

// MARK: - iOS 17 container background shim (deployment target is 16.1)

extension View {
    /// Applies WidgetKit's removable container background on iOS 17+, and falls
    /// back to a plain background fill on iOS 16 so home widgets still get their
    /// dark ground.
    @ViewBuilder
    func sneakyContainerBackground(_ color: Color) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(color, for: .widget)
        } else {
            self.background(color)
        }
    }
}
