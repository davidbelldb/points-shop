import Foundation
import Testing
@testable import SneakySocial

/// The server bakes every pause and leap into `finishMs`, so the one invariant
/// that matters is: whatever obstacles a duck meets, it crosses the line at
/// exactly `finishMs`. If that holds, the replay matches the server's result.
@Suite("Race replay engine")
struct RaceEngineTests {

    private let mixedCourse: [Obstacle] = [
        .init(kind: .whirl, at: 0.18, durationMs: 1800, loops: 2),
        .init(kind: .buoy, at: 0.32, durationMs: 700, colour: "#e0322e"),
        .init(kind: .pad, at: 0.45, boost: 0.06, boostMs: 480),
        .init(kind: .iceberg, at: 0.61, boost: 0.09, boostMs: 550, outcome: .boost),
        .init(kind: .iceberg, at: 0.74, durationMs: 600, outcome: .drown),
    ]

    @Test("A clear run is linear from start to finish")
    func clearRunIsLinear() {
        let finish: Double = 25_000

        #expect(RaceEngine.state(elapsed: 0, finishMs: finish, obstacles: []).progress == 0)
        #expect(abs(RaceEngine.state(elapsed: 12_500, finishMs: finish, obstacles: []).progress - 0.5) < 1e-9)
        #expect(abs(RaceEngine.state(elapsed: finish, finishMs: finish, obstacles: []).progress - 1) < 1e-9)
    }

    @Test("However cluttered the course, the duck finishes at exactly finishMs")
    func obstaclesAreBakedIntoTheFinishTime() {
        let finish: Double = 28_400
        let atFinish = RaceEngine.state(elapsed: finish, finishMs: finish, obstacles: mixedCourse)
        #expect(abs(atFinish.progress - 1) < 1e-9)

        // And it hasn't got there early.
        let justBefore = RaceEngine.state(elapsed: finish - 500, finishMs: finish, obstacles: mixedCourse)
        #expect(justBefore.progress < 1)
    }

    @Test("Progress never goes backwards")
    func progressIsMonotonic() {
        let finish: Double = 28_400
        var previous = -1.0
        for step in stride(from: 0.0, through: finish, by: 100) {
            let progress = RaceEngine.state(elapsed: step, finishMs: finish, obstacles: mixedCourse).progress
            #expect(progress >= previous - 1e-9)
            previous = progress
        }
    }

    @Test("A stalled duck reports the right pause and stays put")
    func pausesStallTheDuck() {
        let finish: Double = 28_400
        let whirl = mixedCourse[0]
        let entry = RaceEngine.time(toProgress: whirl.at, finishMs: finish, obstacles: mixedCourse)

        let midPause = RaceEngine.state(elapsed: entry + whirl.durationMs / 2,
                                        finishMs: finish, obstacles: mixedCourse)

        #expect(abs(midPause.progress - whirl.at) < 1e-9)
        if case .whirl(let fraction, let loops) = midPause.pause {
            #expect(abs(fraction - 0.5) < 0.01)
            #expect(loops == 2)
        } else {
            Issue.record("Expected a whirlpool pause, got \(String(describing: midPause.pause))")
        }
    }

    @Test("A lily pad carries the duck forward while it leaps")
    func padsBoostForward() {
        let finish: Double = 28_400
        let pad = mixedCourse[2]
        let entry = RaceEngine.time(toProgress: pad.at, finishMs: finish, obstacles: mixedCourse)

        let midLeap = RaceEngine.state(elapsed: entry + pad.boostMs / 2,
                                       finishMs: finish, obstacles: mixedCourse)

        #expect(midLeap.progress > pad.at)
        #expect(midLeap.progress < pad.at + pad.boost + 1e-9)
        if case .leap = midLeap.pause {} else {
            Issue.record("Expected a leap, got \(String(describing: midLeap.pause))")
        }
    }

    @Test("time(toProgress:) inverts state(elapsed:)")
    func timeAndStateAreInverses() {
        let finish: Double = 28_400
        for target in [0.05, 0.25, 0.4, 0.55, 0.8, 0.95] {
            let elapsed = RaceEngine.time(toProgress: target, finishMs: finish, obstacles: mixedCourse)
            let progress = RaceEngine.state(elapsed: elapsed, finishMs: finish, obstacles: mixedCourse).progress
            #expect(abs(progress - target) < 1e-6, "round trip failed at \(target)")
        }
    }

    // MARK: - Photo finish

    @Test("A tight finish triggers slow-mo; a comfortable one doesn't")
    func photoFinishDetection() {
        let tight = RaceEngine.PhotoFinish(finishMs: [1: 25_000, 2: 25_400, 3: 27_000], sink: nil)
        #expect(tight.isPhoto)
        #expect(tight.winMs == 25_000)
        #expect(tight.secondMs == 25_400)

        let comfortable = RaceEngine.PhotoFinish(finishMs: [1: 25_000, 2: 26_800, 3: 27_000], sink: nil)
        #expect(!comfortable.isPhoto)
    }

    @Test("The sunk duck is ignored when ranking the finish")
    func sinkIsExcludedFromRanking() {
        // Duck 2 sank, so 1st and 3rd are 1.6s apart — not a photo finish.
        let photo = RaceEngine.PhotoFinish(
            finishMs: [1: 25_000, 2: 25_200, 3: 26_600],
            sink: DuckySink(ord: 2, at: 0.5)
        )
        #expect(!photo.isPhoto)
        #expect(photo.secondMs == 26_600)
    }

    @Test("Real and race time convert both ways")
    func timeConversionRoundTrips() {
        let photo = RaceEngine.PhotoFinish(finishMs: [1: 25_000, 2: 25_400], sink: nil)
        #expect(photo.isPhoto)

        for real in [0.0, 10_000, photo.slowFrom, photo.slowFrom + 400, photo.realSlowTo, photo.realEndMs] {
            let race = photo.raceTime(fromReal: real)
            #expect(abs(photo.realTime(fromRace: race) - real) < 1e-6, "round trip failed at \(real)")
        }

        // Inside the window, race time advances slower than real time.
        let before = photo.raceTime(fromReal: photo.slowFrom)
        let after = photo.raceTime(fromReal: photo.slowFrom + 1000)
        #expect((after - before) < 1000)
    }

    @Test("Without a photo finish, race time is real time")
    func noSlowMoWhenComfortable() {
        let photo = RaceEngine.PhotoFinish(finishMs: [1: 25_000, 2: 27_000], sink: nil)
        #expect(photo.raceTime(fromReal: 26_000) == 26_000)
        #expect(photo.realTime(fromRace: 26_000) == 26_000)
    }

    // MARK: - Camera

    @Test("The camera clamps at both ends of the course")
    func cameraClamps() {
        #expect(RaceEngine.cameraX(leaderProgress: 0) == 0)
        let atFinish = RaceEngine.cameraX(leaderProgress: 1)
        #expect(abs(atFinish - (RaceEngine.courseLength - RaceEngine.endX)) < 1e-9)
    }

    @Test("The leader sits ahead of the field on screen")
    func trailingDucksSitBehind() {
        let leader = 0.5
        let camera = RaceEngine.cameraX(leaderProgress: leader)
        let leaderX = RaceEngine.screenX(progress: leader, leaderProgress: leader, cameraX: camera)
        let trailerX = RaceEngine.screenX(progress: 0.42, leaderProgress: leader, cameraX: camera)
        #expect(trailerX < leaderX)
    }
}
