import Foundation

/// The commentary ticker and the ducks' speech bubbles, worked out once when the
/// race result arrives rather than scattered across timers. Everything is in
/// RACE time (ms); the view converts to real time through `PhotoFinish`.
enum RaceNarration {

    struct Line: Identifiable, Equatable, Sendable {
        let id: Int
        let raceTimeMs: Double
        let text: String
    }

    struct Bubble: Identifiable, Equatable, Sendable {
        let id: Int
        let ord: Int
        let text: String
        let showAtMs: Double
        let hideAtMs: Double
    }

    /// Minimum gap between two callouts, so the ticker stays readable.
    static let minimumGapMs: Double = 1400
    /// Obstacle callouts are capped — five is plenty for a 25-second race.
    static let maximumHitCallouts = 5
    static let bubbleDurationMs: Double = 2600

    // MARK: - Commentary

    static func commentary(
        for result: DuckyRaceResult,
        photo: RaceEngine.PhotoFinish,
        fillers: [String],
        night: Bool = true
    ) -> [Line] {
        var generator = SystemRandomNumberGenerator()
        return commentary(for: result, photo: photo, fillers: fillers, night: night, using: &generator)
    }

    static func commentary<G: RandomNumberGenerator>(
        for result: DuckyRaceResult,
        photo: RaceEngine.PhotoFinish,
        fillers: [String],
        night: Bool = true,
        using generator: inout G
    ) -> [Line] {
        let names = Dictionary(uniqueKeysWithValues: result.ducks.map { ($0.ord, $0.name) })
        let winMs = photo.winMs
        var texts: [(Double, String)] = [(250, "And they're off!")]

        // Obstacle callouts — spread out, never for the duck that sinks.
        var hits: [(Double, String)] = []
        for duck in result.ducks where duck.ord != result.sink?.ord {
            let finish = result.finish(for: duck.ord)
            let obstacles = result.obstacles(for: duck.ord)
            let name = names[duck.ord] ?? "A duck"

            for obstacle in obstacles {
                // Icebergs are a night-only sight, so they're never called in daylight.
                if obstacle.kind == .iceberg, !night { continue }
                let time = RaceEngine.time(toProgress: obstacle.at, finishMs: finish, obstacles: obstacles)
                guard time > 2000, time < winMs - 3000 else { continue }

                let text: String
                switch obstacle.kind {
                case .buoy: text = "\(name) clatters into a buoy!"
                case .pad: text = "\(name) catches a lily pad and surges!"
                case .iceberg where obstacle.outcome == .boost:
                    text = "\(name) bounces off an iceberg and accelerates!"
                case .iceberg: text = "\(name) hits an iceberg!"
                case .whirl: text = "\(name) hits the rapids!"
                }
                hits.append((time, text))
            }
        }

        hits.sort { $0.0 < $1.0 }
        var lastHit = -9999.0
        var used = 0
        for hit in hits where used < maximumHitCallouts {
            if hit.0 - lastHit > 3000 {
                texts.append(hit)
                lastHit = hit.0
                used += 1
            }
        }

        // The sinking.
        if let sink = result.sink, let name = names[sink.ord] {
            let time = RaceEngine.time(
                toProgress: sink.at,
                finishMs: result.finish(for: sink.ord),
                obstacles: result.obstacles(for: sink.ord)
            )
            texts.append((time, "Disaster — \(name) has gone under!"))
        }

        texts.append((winMs * 0.42, "It's neck and neck out there!"))
        texts.append((winMs - 3400, "Into the final stretch!"))

        let winnerName = names[result.winnerOrd] ?? "The favourite"
        if photo.isPhoto {
            texts.append((winMs - 600, "Photo finish — too close to call!"))
            texts.append((winMs + 60, "\(winnerName) edges it on the line!"))
        } else {
            texts.append((winMs - 150, "\(winnerName) romps home to take it!"))
        }

        // Admin-editable filler lines, cycled from a random starting point.
        if !fillers.isEmpty {
            var index = Int.random(in: 0..<fillers.count, using: &generator)
            var time = 3400.0
            while time < winMs - 4200 {
                let filled = fillDuckTokens(
                    in: fillers[index % fillers.count],
                    ducks: result.ducks,
                    using: &generator
                )
                texts.append((time, filled))
                index += 1
                time += 3600
            }
        }

        // Space them out so nothing is swallowed by the line after it.
        texts.sort { $0.0 < $1.0 }
        var spaced: [(Double, String)] = []
        for entry in texts {
            if let previous = spaced.last, entry.0 - previous.0 < minimumGapMs {
                spaced.append((previous.0 + minimumGapMs, entry.1))
            } else {
                spaced.append(entry)
            }
        }

        return spaced.enumerated().map { Line(id: $0.offset, raceTimeMs: $0.element.0, text: $0.element.1) }
    }

    // MARK: - Speech bubbles

    static func bubbles(for result: DuckyRaceResult, phrases: [String]) -> [Bubble] {
        var generator = SystemRandomNumberGenerator()
        return bubbles(for: result, phrases: phrases, using: &generator)
    }

    static func bubbles<G: RandomNumberGenerator>(
        for result: DuckyRaceResult,
        phrases: [String],
        using generator: inout G
    ) -> [Bubble] {
        guard !phrases.isEmpty else { return [] }
        var bubbles: [Bubble] = []
        var id = 0

        for duck in result.ducks {
            let finish = result.finish(for: duck.ord)
            let count = Bool.random(using: &generator) ? 2 : 1
            for _ in 0..<count {
                let window = max(1000, finish - 5000)
                let showAt = 1800 + Double.random(in: 0..<window, using: &generator)
                let text = phrases[Int.random(in: 0..<phrases.count, using: &generator)]
                bubbles.append(
                    Bubble(id: id, ord: duck.ord, text: text,
                           showAtMs: showAt, hideAtMs: showAt + bubbleDurationMs)
                )
                id += 1
            }
        }
        return bubbles
    }

    // MARK: - Tokens

    /// `{duck}`, `{duck2}`… each occurrence resolves to a different racer.
    static func fillDuckTokens<G: RandomNumberGenerator>(
        in text: String,
        ducks: [Duck],
        using generator: inout G
    ) -> String {
        guard !ducks.isEmpty else { return text }
        let pool = ducks.shuffled(using: &generator)
        var index = 0
        var output = ""
        var remainder = Substring(text)

        while let range = remainder.range(of: "\\{duck\\d*\\}", options: .regularExpression) {
            output += remainder[remainder.startIndex..<range.lowerBound]
            output += pool[index % pool.count].name
            index += 1
            remainder = remainder[range.upperBound...]
        }
        output += remainder
        return output
    }

    /// Intro chatter while you're still choosing — one line every 2.5s.
    static func introLines(from pool: [String], ducks: [Duck]) -> [Line] {
        var generator = SystemRandomNumberGenerator()
        return pool.enumerated().map { index, text in
            Line(id: index,
                 raceTimeMs: Double(index) * 2500,
                 text: fillDuckTokens(in: text, ducks: ducks, using: &generator))
        }
    }
}
