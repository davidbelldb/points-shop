import Foundation

/// The replay maths, ported from DuckyDerbyPage.jsx.
///
/// The server bakes every pause and every leap into a duck's `finishMs`, so the
/// duck moves at a constant "normal" rate between obstacles and the numbers add
/// up exactly. Nothing here touches UIKit or SwiftUI — it's all testable.
enum RaceEngine {

    // MARK: - Course geometry (world units; 1 unit = one screen width)

    /// The course is this many screen-widths long.
    static let courseLength: Double = 2.5
    /// Where the leader sits on screen as the camera follows.
    static let cameraAnchor: Double = 0.4
    /// How much of the course stays visible at the finish.
    static let endX: Double = 0.68
    /// Horizontal spread between first and last, as a % of screen width.
    static let spread: Double = 235
    /// The start line sits a little ahead of the ducks.
    static let startX: Double = 0.2

    // MARK: - Obstacle totals

    struct Totals: Equatable {
        var pauseMs: Double = 0
        var boostMs: Double = 0
        var boostProgress: Double = 0
    }

    static func totals(of obstacles: [Obstacle]) -> Totals {
        var totals = Totals()
        for obstacle in obstacles {
            if obstacle.isBoost {
                totals.boostMs += obstacle.boostMs
                totals.boostProgress += obstacle.boost
            } else {
                totals.pauseMs += obstacle.durationMs
            }
        }
        return totals
    }

    // MARK: - Where a duck is at a given moment

    enum Pause: Equatable {
        /// Circular drift through `loops` full turns.
        case whirl(fraction: Double, loops: Int)
        /// A short sideways knock.
        case buoy(fraction: Double)
        /// Mid-leap: the duck stretches forward and sprints.
        case leap(fraction: Double)
        /// Struck an iceberg and stalled.
        case iceberg(fraction: Double)
    }

    struct DuckState: Equatable {
        /// Progress along the course, 0…1.
        var progress: Double
        var pause: Pause?
    }

    /// A duck's state `elapsed` ms into the race.
    static func state(elapsed: Double, finishMs: Double, obstacles: [Obstacle]) -> DuckState {
        let totals = totals(of: obstacles)
        let movingMs = max(1, finishMs - totals.pauseMs - totals.boostMs)
        // Normal-speed progress per millisecond, with boosted distance removed.
        let rate = max(1 - totals.boostProgress, 0.01) / movingMs

        var remaining = elapsed
        var lastAt: Double = 0

        for obstacle in obstacles {
            let segmentMs = max(0, obstacle.at - lastAt) / rate
            if remaining < segmentMs {
                return DuckState(progress: lastAt + remaining * rate, pause: nil)
            }
            remaining -= segmentMs

            if obstacle.isBoost {
                if remaining < obstacle.boostMs {
                    let fraction = obstacle.boostMs > 0 ? remaining / obstacle.boostMs : 0
                    return DuckState(
                        progress: min(1, obstacle.at + fraction * obstacle.boost),
                        pause: .leap(fraction: fraction)
                    )
                }
                remaining -= obstacle.boostMs
                lastAt = obstacle.at + obstacle.boost
            } else {
                if remaining < obstacle.durationMs {
                    let fraction = obstacle.durationMs > 0 ? remaining / obstacle.durationMs : 0
                    let pause: Pause
                    switch obstacle.kind {
                    case .buoy: pause = .buoy(fraction: fraction)
                    case .iceberg: pause = .iceberg(fraction: fraction)
                    default: pause = .whirl(fraction: fraction, loops: obstacle.loops)
                    }
                    return DuckState(progress: obstacle.at, pause: pause)
                }
                remaining -= obstacle.durationMs
                lastAt = obstacle.at
            }
        }

        return DuckState(progress: min(1, lastAt + remaining * rate), pause: nil)
    }

    /// Inverse of `state`: when a duck first reaches `progress`. Used to time the
    /// commentary callouts against the obstacles that trigger them.
    static func time(toProgress target: Double, finishMs: Double, obstacles: [Obstacle]) -> Double {
        let totals = totals(of: obstacles)
        let movingMs = max(1, finishMs - totals.pauseMs - totals.boostMs)
        let rate = max(1 - totals.boostProgress, 0.01) / movingMs

        var elapsed: Double = 0
        var lastAt: Double = 0

        for obstacle in obstacles {
            if target <= obstacle.at {
                return elapsed + max(0, target - lastAt) / rate
            }
            elapsed += max(0, obstacle.at - lastAt) / rate

            if obstacle.isBoost {
                elapsed += obstacle.boostMs
                lastAt = obstacle.at + obstacle.boost
            } else {
                elapsed += obstacle.durationMs
                lastAt = obstacle.at
            }
        }

        return elapsed + max(0, target - lastAt) / rate
    }

    // MARK: - Photo finish

    /// When first and second are within a whisker, the race drops into slow-mo and
    /// a camera flash goes off. `PhotoFinish` maps between real elapsed time and
    /// race time so everything else can keep working in race time.
    struct PhotoFinish: Equatable {
        static let slowFactor: Double = 0.4
        /// Gap (ms) between 1st and 2nd that counts as a photo finish.
        static let threshold: Double = 650

        let isPhoto: Bool
        let winMs: Double
        let secondMs: Double
        let maxMs: Double
        let slowFrom: Double
        let slowTo: Double
        let realSlowTo: Double
        /// When the race is over, in race time.
        let raceEndMs: Double
        /// When the race is over, in real time.
        let realEndMs: Double

        init(finishMs: [Int: Double], sink: DuckySink?) {
            let times = finishMs
                .filter { sink == nil || $0.key != sink!.ord }
                .values
                .sorted()

            let win = times.first ?? 0
            let second = times.count > 1 ? times[1] : win
            let longest = times.last ?? win

            winMs = win
            secondMs = second
            maxMs = longest
            isPhoto = times.count >= 2 && (second - win) <= Self.threshold
            slowFrom = win - 1200
            slowTo = second + 250
            realSlowTo = slowFrom + (slowTo - slowFrom) / Self.slowFactor
            raceEndMs = isPhoto ? slowTo + 700 : longest + 600
            realEndMs = isPhoto ? realSlowTo + 900 : longest + 800
        }

        /// Real elapsed time → race time (slowed inside the photo window).
        func raceTime(fromReal real: Double) -> Double {
            guard isPhoto, real > slowFrom else { return real }
            if real >= realSlowTo { return slowTo + (real - realSlowTo) }
            return slowFrom + (real - slowFrom) * Self.slowFactor
        }

        /// Race time → real elapsed time.
        func realTime(fromRace race: Double) -> Double {
            guard isPhoto, race > slowFrom else { return race }
            if race >= slowTo { return realSlowTo + (race - slowTo) }
            return slowFrom + (race - slowFrom) / Self.slowFactor
        }
    }

    // MARK: - Camera

    /// Where the camera sits (in world units) given the leader's progress.
    static func cameraX(leaderProgress: Double) -> Double {
        let leaderWorldX = leaderProgress * courseLength
        return min(max(leaderWorldX - cameraAnchor, 0), courseLength - endX)
    }

    /// A duck's horizontal position as a fraction of screen width.
    /// The leader is pinned at the anchor; the rest trail by `spread`.
    static func screenX(progress: Double, leaderProgress: Double, cameraX: Double) -> Double {
        let leaderScreen = (leaderProgress * courseLength - cameraX)
        return leaderScreen - (leaderProgress - progress) * (spread / 100)
    }

    /// The bread lure runs ahead of the fastest duck so it always leads the pack.
    static func breadProgress(elapsed: Double, fastestFinishMs: Double) -> Double {
        guard fastestFinishMs > 0 else { return 0 }
        return min(1, elapsed / (fastestFinishMs * 0.82))
    }
}
