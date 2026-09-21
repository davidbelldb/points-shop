import Foundation
import Testing
@testable import SneakySocial

/// The commentary builder has real rules in it — a cap on obstacle callouts,
/// 3s between them, 1.4s minimum between any two lines — and they're the sort
/// of thing that silently rots. These pin them down.
@Suite("Race narration")
struct RaceNarrationTests {

    /// A race with far more obstacle hits than the callout cap allows.
    private func busyRace(won: Bool = false, sink: DuckySink? = nil) throws -> DuckyRaceResult {
        var obstacles: [String: [[String: Any]]] = [:]
        for ord in 1...6 {
            obstacles["\(ord)"] = (0..<6).map { index in
                ["kind": "buoy", "at": 0.12 + Double(index) * 0.11, "durationMs": 600]
            }
        }

        var json: [String: Any] = [
            "winner_ord": 1,
            "ducks": (1...6).map { ord in
                ["ord": ord, "name": "Duck \(ord)", "odds_num": ord, "odds_den": 1]
            },
            "picked_ord": won ? 1 : 2,
            "stake": 100,
            "won": won,
            "payout": won ? 200 : 0,
            "balance": 1000,
            "odds_num": 2,
            "odds_den": 1,
            "finish_ms": Dictionary(uniqueKeysWithValues: (1...6).map { ("\($0)", 25_000 + Double($0) * 900) }),
            "whirlpools": obstacles,
        ]
        // A nil Optional isn't valid JSON, so only add the key when there is one.
        if let sink { json["sink"] = ["ord": sink.ord, "at": sink.at] }

        let data = try JSONSerialization.data(withJSONObject: json)
        return try APIClient.decoder.decode(DuckyRaceResult.self, from: data)
    }

    private func photo(for result: DuckyRaceResult) -> RaceEngine.PhotoFinish {
        RaceEngine.PhotoFinish(finishMs: result.finishMs, sink: result.sink)
    }

    @Test("Lines never crowd each other")
    func linesAreSpaced() throws {
        let result = try busyRace()
        let lines = RaceNarration.commentary(for: result, photo: photo(for: result), fillers: [])

        for (previous, next) in zip(lines, lines.dropFirst()) {
            #expect(next.raceTimeMs - previous.raceTimeMs >= RaceNarration.minimumGapMs - 0.001,
                    "\(previous.text) → \(next.text) were too close together")
        }
    }

    @Test("Obstacle callouts are capped and spread out")
    func obstacleCalloutsAreCapped() throws {
        let result = try busyRace()
        let lines = RaceNarration.commentary(for: result, photo: photo(for: result), fillers: [])
        let hits = lines.filter { $0.text.contains("buoy") }

        #expect(hits.count <= RaceNarration.maximumHitCallouts)
        #expect(!hits.isEmpty, "a race full of buoys should call at least one")
    }

    @Test("The race opens and closes with the scripted beats")
    func scriptedBeatsArePresent() throws {
        let result = try busyRace()
        let lines = RaceNarration.commentary(for: result, photo: photo(for: result), fillers: [])

        #expect(lines.first?.text == "And they're off!")
        #expect(lines.contains { $0.text.contains("final stretch") })
        #expect(lines.contains { $0.text.contains("Duck 1") }, "the winner should be named")
    }

    @Test("A sinking duck gets its callout, and never an obstacle one")
    func sinkingDuckIsNarrated() throws {
        let result = try busyRace(sink: DuckySink(ord: 3, at: 0.45))
        let lines = RaceNarration.commentary(for: result, photo: photo(for: result), fillers: [])

        #expect(lines.contains { $0.text == "Disaster — Duck 3 has gone under!" })
        #expect(!lines.contains { $0.text.contains("Duck 3 clatters") },
                "a duck that sinks shouldn't also be reported hitting things")
    }

    @Test("{duck} tokens become real, different racers")
    func tokensResolveToDistinctDucks() {
        let ducks = (1...4).map { ord in
            try! APIClient.decoder.decode(
                Duck.self,
                from: Data(#"{"ord":\#(ord),"name":"Duck \#(ord)","odds_num":1,"odds_den":1}"#.utf8)
            )
        }

        var generator = SystemRandomNumberGenerator()
        let filled = RaceNarration.fillDuckTokens(
            in: "{duck} eyes up {duck2} on the bend",
            ducks: ducks,
            using: &generator
        )

        #expect(!filled.contains("{duck"))
        let named = ducks.filter { filled.contains($0.name) }
        #expect(named.count == 2, "each token should resolve to a different racer")
    }

    @Test("Speech bubbles land inside the race, not after it")
    func bubblesFallWithinTheRace() throws {
        let result = try busyRace()
        let bubbles = RaceNarration.bubbles(for: result, phrases: ["Quack!", "Out of my way"])

        #expect(!bubbles.isEmpty)
        for bubble in bubbles {
            #expect(bubble.showAtMs >= 1800)
            #expect(bubble.showAtMs < result.finish(for: bubble.ord))
            #expect(bubble.hideAtMs == bubble.showAtMs + RaceNarration.bubbleDurationMs)
        }
    }

    @Test("No phrases configured means no bubbles at all")
    func noPhrasesNoBubbles() throws {
        let result = try busyRace()
        #expect(RaceNarration.bubbles(for: result, phrases: []).isEmpty)
    }

    // MARK: - Cues

    @Test("Only your own duck's bumps buzz the phone")
    func cuesOnlyFollowYourDuck() throws {
        let result = try busyRace()          // picked duck 2, six buoys each
        let finish = photo(for: result)
        let cues = RaceCues.schedule(for: result, photo: finish, commentary: [])

        let bumps = cues.filter { $0.cue == .bump }
        #expect(bumps.count == result.obstacles(for: result.pickedOrd).count)
    }

    @Test("A loss ends on the failure cue, a win on the success one")
    func outcomeCueMatchesResult() throws {
        let lost = try busyRace(won: false)
        let lostCues = RaceCues.schedule(for: lost, photo: photo(for: lost), commentary: [])
        #expect(lostCues.contains { $0.cue == .lost })
        #expect(!lostCues.contains { $0.cue == .won })

        let won = try busyRace(won: true)
        let wonCues = RaceCues.schedule(for: won, photo: photo(for: won), commentary: [])
        #expect(wonCues.contains { $0.cue == .won })
    }

    @Test("Cues come out in order, and none before the off")
    func cuesAreOrdered() throws {
        let result = try busyRace(sink: DuckySink(ord: 4, at: 0.5))
        let cues = RaceCues.schedule(for: result, photo: photo(for: result), commentary: [])

        #expect(cues.contains { $0.cue == .sink })
        #expect(cues.allSatisfy { $0.realTimeMs >= 0 })
        for (previous, next) in zip(cues, cues.dropFirst()) {
            #expect(next.realTimeMs >= previous.realTimeMs)
        }
    }
}
