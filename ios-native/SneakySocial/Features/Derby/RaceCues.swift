import Foundation

/// The things the phone should *do* during a race — buzz, play a sound, or tell
/// VoiceOver what just happened. Worked out up front from the same determined
/// result the replay uses, in REAL time (ms from the off), so the runner only
/// has to sleep between them.
enum RaceCue: Equatable, Sendable {
    /// Your duck clipped something.
    case bump
    /// A duck has gone under.
    case sink
    /// Camera flash on a photo finish.
    case shutter
    /// The line, one way or the other.
    case won
    case lost
    /// Commentary, for VoiceOver.
    case announce(String)
}

struct ScheduledCue: Identifiable, Equatable, Sendable {
    let id: Int
    let realTimeMs: Double
    let cue: RaceCue
}

enum RaceCues {

    /// Only the player's own duck buzzes — every duck's bumps would be a
    /// 25-second massage.
    static func schedule(
        for result: DuckyRaceResult,
        photo: RaceEngine.PhotoFinish,
        commentary: [RaceNarration.Line]
    ) -> [ScheduledCue] {
        var events: [(Double, RaceCue)] = []

        let mine = result.pickedOrd
        let myObstacles = result.obstacles(for: mine)
        let myFinish = result.finish(for: mine)

        for obstacle in myObstacles where !obstacle.isBoost {
            let raceTime = RaceEngine.time(toProgress: obstacle.at, finishMs: myFinish, obstacles: myObstacles)
            events.append((photo.realTime(fromRace: raceTime), .bump))
        }

        if let sink = result.sink {
            let raceTime = RaceEngine.time(
                toProgress: sink.at,
                finishMs: result.finish(for: sink.ord),
                obstacles: result.obstacles(for: sink.ord)
            )
            events.append((photo.realTime(fromRace: raceTime), .sink))
        }

        if photo.isPhoto {
            events.append((photo.slowFrom, .shutter))
        }

        events.append((photo.realTime(fromRace: photo.winMs), result.won ? .won : .lost))

        for line in commentary {
            events.append((photo.realTime(fromRace: line.raceTimeMs), .announce(line.text)))
        }

        return events
            .filter { $0.0 >= 0 }
            .sorted { $0.0 < $1.0 }
            .enumerated()
            .map { ScheduledCue(id: $0.offset, realTimeMs: $0.element.0, cue: $0.element.1) }
    }
}
