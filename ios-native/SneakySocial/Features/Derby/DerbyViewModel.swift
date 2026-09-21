import Foundation
import Observation
import SwiftUI
import UIKit

/// Drives one visit to the derby: fetch a lineup, take the bet, then hand the
/// view a fully-determined race to replay.
@MainActor
@Observable
final class DerbyViewModel {

    enum Phase: Equatable {
        case loading
        case betting
        case countdown
        case racing
        case result
        case failed(String)
    }

    private(set) var phase: Phase = .loading
    private(set) var config: DuckyConfig?
    private(set) var lineup: DuckyLineup?
    private(set) var form: [Int: DuckForm] = [:]
    private(set) var result: DuckyRaceResult?
    private(set) var balance = 0
    private(set) var isBusy = false

    var pickedOrd: Int?
    var stakeText = ""
    var errorMessage: String?

    /// Set the moment a phase that animates begins — everything visual is
    /// derived from `Date.now` minus one of these, so there are no timers
    /// keeping UI state in sync.
    private(set) var phaseStartedAt = Date()

    private(set) var photo: RaceEngine.PhotoFinish?
    private(set) var commentary: [RaceNarration.Line] = []
    private(set) var bubbles: [RaceNarration.Bubble] = []
    private(set) var introLines: [RaceNarration.Line] = []

    /// Per-race scenery. Generated once (it has random sizes and bob offsets),
    /// so it can't reshuffle itself on every frame.
    private(set) var furniture = CourseFurniture()
    private(set) var banners: [BannerPlacement] = []

    /// Set from the environment — when Reduce Motion is on we drop the confetti,
    /// the camera flash and the idle bob.
    var reduceMotion = false

    private let api: APIClient
    private var runTask: Task<Void, Never>?
    private var cueTask: Task<Void, Never>?
    private static let lastStakeKey = "derby.lastStake"

    init(api: APIClient = .shared) {
        self.api = api
    }

    // MARK: - Derived state

    var ducks: [Duck] { result?.ducks ?? lineup?.ducks ?? [] }

    var pickedDuck: Duck? {
        guard let pickedOrd else { return nil }
        return ducks.first { $0.ord == pickedOrd }
    }

    var stake: Int? {
        guard let value = Int(stakeText.trimmingCharacters(in: .whitespaces)) else { return nil }
        return value
    }

    var isStakeValid: Bool {
        guard let stake else { return false }
        return stake > 0 && stake <= balance
    }

    var canPlaceBet: Bool {
        pickedOrd != nil && isStakeValid && !isBusy && phase == .betting
    }

    var potentialReturn: Int {
        guard let pickedDuck, let stake, isStakeValid else { return 0 }
        return pickedDuck.potentialReturn(stake: stake)
    }

    /// Below two points there's nothing worth staking.
    var hasFunds: Bool { balance > 1 }

    var isRacing: Bool { phase == .racing }
    var isPreRace: Bool { phase == .betting || phase == .countdown }

    /// The fastest finish in the field — the bread lure paces off it.
    var fastestFinishMs: Double {
        result?.finishMs.values.min() ?? 0
    }

    // MARK: - Loading

    func load() async {
        guard !isBusy else { return }
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        // Fetched together — the lineup is the only one that must succeed.
        let existingConfig = config
        async let lineupTask = api.post("/games/ducky/lineup", as: DuckyLineup.self)
        async let configTask = Self.loadConfig(api: api, existing: existingConfig)
        async let formTask = Self.loadForm(api: api)

        do {
            let (loadedLineup, loadedConfig, loadedForm) = try await (lineupTask, configTask, formTask)

            if let loadedConfig { config = loadedConfig }
            banners = BannerPlacement.layout(config?.banners ?? [])
            lineup = loadedLineup
            balance = loadedLineup.balance
            form = loadedForm

            resetForNewRace()
            restoreLastStake()
            phase = .betting
            phaseStartedAt = .now
            introLines = RaceNarration.introLines(
                from: config?.intro(night: isNight) ?? [],
                ducks: loadedLineup.ducks
            )
        } catch {
            phase = .failed((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// Config rarely changes within a session, so it's fetched once and kept.
    private nonisolated static func loadConfig(api: APIClient, existing: DuckyConfig?) async -> DuckyConfig? {
        if let existing { return existing }
        return try? await api.get("/games/ducky/config\(DuckyVariant.app.query)", as: DuckyConfig.self)
    }

    /// The form guide is nice-to-have — a failure here shouldn't stop a race.
    private nonisolated static func loadForm(api: APIClient) async -> [Int: DuckForm] {
        guard let raw = try? await api.get("/games/ducky/form", as: [String: DuckForm].self) else { return [:] }
        return Dictionary(uniqueKeysWithValues: raw.compactMap { key, value in
            Int(key).map { ($0, value) }
        })
    }

    /// Adopt settings just changed in the admin plane, so the track repaints
    /// without waiting for the next lineup.
    func apply(_ newConfig: DuckyConfig) {
        config = newConfig
        banners = BannerPlacement.layout(newConfig.banners)
    }

    /// Called when the view goes away mid-race.
    func cancel() {
        runTask?.cancel()
        runTask = nil
    }

    /// Prefill with last race's stake, trimmed to what's affordable now.
    private func restoreLastStake() {
        let remembered = UserDefaults.standard.integer(forKey: Self.lastStakeKey)
        guard remembered > 0, balance > 0 else { return }
        stakeText = "\(min(remembered, balance))"
    }

    /// Stake presets, dropping any the balance can't cover.
    var stakePresets: [Int] {
        [10, 50, 100, 250].filter { $0 <= balance }
    }

    func setStake(_ value: Int) {
        Haptics.tap(intensity: 0.7)
        stakeText = "\(max(1, min(value, balance)))"
    }

    private func resetForNewRace() {
        result = nil
        photo = nil
        furniture = CourseFurniture()
        commentary = []
        bubbles = []
        introLines = []
        pickedOrd = nil
        stakeText = ""
        errorMessage = nil
        runTask?.cancel()
        runTask = nil
        cueTask?.cancel()
        cueTask = nil
    }

    // MARK: - Betting

    /// Dark mode decides which sprite set and which text pool the race uses.
    var isNight = false

    func pick(_ ord: Int) {
        guard phase == .betting else { return }
        Haptics.tap()
        pickedOrd = ord
    }

    func placeBet() {
        guard canPlaceBet, let lineup, let pickedOrd, let stake else { return }
        isBusy = true
        errorMessage = nil

        runTask = Task { [weak self] in
            guard let self else { return }
            do {
                let raceResult = try await api.post(
                    "/games/ducky/race",
                    body: DuckyBetRequest(lineupID: lineup.lineupID, pickedOrd: pickedOrd, stake: stake),
                    as: DuckyRaceResult.self
                )
                guard !Task.isCancelled else { return }
                await self.begin(raceResult)
            } catch {
                self.errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
                self.isBusy = false
            }
        }
    }

    /// 3-2-1-GO, then the replay, then the result card.
    ///
    /// The timings here just *drive* the transitions — `reconcile()` can work
    /// them out from the clock alone, so a suspended app or a cancelled task
    /// can never strand the race mid-countdown.
    private func begin(_ raceResult: DuckyRaceResult) async {
        let photoFinish = RaceEngine.PhotoFinish(finishMs: raceResult.finishMs, sink: raceResult.sink)

        result = raceResult
        photo = photoFinish
        furniture = CourseFurniture(
            result: raceResult,
            config: config,
            layout: TrackLayout(duckCount: raceResult.ducks.count),
            night: isNight
        )
        commentary = RaceNarration.commentary(
            for: raceResult,
            photo: photoFinish,
            fillers: config?.commentary(night: isNight) ?? [],
            night: isNight
        )
        bubbles = RaceNarration.bubbles(
            for: raceResult,
            phrases: config?.phrases(night: isNight) ?? []
        )
        isBusy = false

        UserDefaults.standard.set(raceResult.stake, forKey: Self.lastStakeKey)

        enter(.countdown)
        Haptics.prepare()
        await runCountdownBeats()
        guard !Task.isCancelled, phase == .countdown else { return }

        enter(.racing)
        SoundPlayer.shared.play(Sound.raceStart)
        startCues(RaceCues.schedule(for: raceResult, photo: photoFinish, commentary: commentary))
        try? await Task.sleep(for: .milliseconds(Int(photoFinish.realEndMs)))
        guard !Task.isCancelled, phase == .racing else { return }

        finishRace()
    }

    private func enter(_ next: Phase) {
        phase = next
        phaseStartedAt = .now
    }

    private func finishRace() {
        guard let result else { return }
        cueTask?.cancel()
        cueTask = nil
        balance = result.balance
        phase = .result
    }

    /// A tick on each of 3-2-1 and a thump on GO.
    private func runCountdownBeats() async {
        for step in 0..<Self.countdownSteps.count {
            if step == Self.countdownSteps.count - 1 {
                Haptics.knock()
            } else {
                Haptics.tap(intensity: 0.6)
            }
            try? await Task.sleep(for: .milliseconds(Int(Self.countdownStepMs)))
            if Task.isCancelled { return }
        }
    }

    private func startCues(_ cues: [ScheduledCue]) {
        cueTask?.cancel()
        cueTask = Task { [weak self] in
            var elapsed: Double = 0
            for scheduled in cues {
                let wait = scheduled.realTimeMs - elapsed
                if wait > 0 {
                    try? await Task.sleep(for: .milliseconds(Int(wait)))
                }
                guard !Task.isCancelled else { return }
                elapsed = max(elapsed, scheduled.realTimeMs)
                self?.perform(scheduled.cue)
            }
        }
    }

    private func perform(_ cue: RaceCue) {
        switch cue {
        case .bump:
            Haptics.knock()
            SoundPlayer.shared.play(Sound.quack, volume: 0.6)
        case .sink:
            Haptics.nudge()
            SoundPlayer.shared.play(Sound.splash, volume: 0.8)
        case .shutter:
            guard !reduceMotion else { return }
            Haptics.shutter()
        case .won:
            Haptics.success()
            SoundPlayer.shared.play(Sound.cheer)
        case .lost:
            Haptics.failure()
            SoundPlayer.shared.play(Sound.groan, volume: 0.7)
        case .announce(let text):
            // Only worth the interruption when VoiceOver is actually on — the
            // ticker is already on screen for everyone else.
            guard UIAccessibility.isVoiceOverRunning else { return }
            AccessibilityNotification.Announcement(text).post()
        }
    }

    /// Bring the phase back in line with the wall clock.
    ///
    /// Switching tabs tears the view down but not this model, and a backgrounded
    /// app can have its sleeps stretched, so on every reappearance we ask "given
    /// the time, where should this race actually be?" rather than trusting that
    /// the driving task survived.
    func reconcile() {
        guard let photo else { return }
        let elapsedMs = max(0, Date.now.timeIntervalSince(phaseStartedAt) * 1000)

        switch phase {
        case .countdown where elapsedMs >= Self.countdownDurationMs:
            // Roll straight into the race, starting from when the countdown ended.
            phase = .racing
            phaseStartedAt = phaseStartedAt.addingTimeInterval(Self.countdownDurationMs / 1000)
            reconcile()
        case .racing where elapsedMs >= photo.realEndMs:
            finishRace()
        default:
            break
        }
    }

    // MARK: - Countdown

    static let countdownStepMs: Double = 800
    static let countdownSteps = ["3", "2", "1", "GO!"]
    static var countdownDurationMs: Double { countdownStepMs * Double(countdownSteps.count) }

    func countdownText(at elapsedMs: Double) -> String {
        let index = min(Self.countdownSteps.count - 1, max(0, Int(elapsedMs / Self.countdownStepMs)))
        return Self.countdownSteps[index]
    }

    // MARK: - Replay helpers

    /// Every duck's position `realElapsedMs` into the replay.
    struct Runner: Identifiable {
        let duck: Duck
        let lane: Int
        let state: RaceEngine.DuckState
        let isSinking: Bool
        let sinkProgress: Double

        var id: Int { duck.ord }
    }

    func runners(atRealElapsed realElapsedMs: Double) -> [Runner] {
        guard let result, let photo else { return [] }
        let raceElapsed = photo.raceTime(fromReal: realElapsedMs)

        return result.ducks.enumerated().map { lane, duck in
            var state = RaceEngine.state(
                elapsed: raceElapsed,
                finishMs: result.finish(for: duck.ord),
                obstacles: result.obstacles(for: duck.ord)
            )

            var isSinking = false
            var sinkProgress: Double = 0
            if let sink = result.sink, sink.ord == duck.ord, state.progress >= sink.at {
                // A sinking duck stops dead at the point it goes under.
                state.progress = sink.at
                isSinking = true
                let sinkStartedAt = photo.realTime(
                    fromRace: RaceEngine.time(
                        toProgress: sink.at,
                        finishMs: result.finish(for: duck.ord),
                        obstacles: result.obstacles(for: duck.ord)
                    )
                )
                sinkProgress = min(1, max(0, (realElapsedMs - sinkStartedAt) / 1100))
            }

            return Runner(duck: duck, lane: lane, state: state,
                          isSinking: isSinking, sinkProgress: sinkProgress)
        }
    }

    func leaderProgress(among runners: [Runner]) -> Double {
        runners.map(\.state.progress).max() ?? 0
    }

    /// The two most recent ticker lines at this point in the race.
    func visibleCommentary(atRealElapsed realElapsedMs: Double) -> [RaceNarration.Line] {
        guard let photo else { return [] }
        let raceElapsed = photo.raceTime(fromReal: realElapsedMs)
        return Array(commentary.filter { $0.raceTimeMs <= raceElapsed }.suffix(2))
    }

    func visibleIntro(atElapsed elapsedMs: Double) -> [RaceNarration.Line] {
        Array(introLines.filter { $0.raceTimeMs <= elapsedMs }.suffix(2))
    }

    func visibleBubbles(atRealElapsed realElapsedMs: Double) -> [Int: String] {
        guard let photo else { return [:] }
        let raceElapsed = photo.raceTime(fromReal: realElapsedMs)
        var visible: [Int: String] = [:]
        for bubble in bubbles where bubble.showAtMs <= raceElapsed && raceElapsed < bubble.hideAtMs {
            visible[bubble.ord] = bubble.text
        }
        return visible
    }

    /// Confetti starts as the winner crosses the line.
    func showsConfetti(atRealElapsed realElapsedMs: Double) -> Bool {
        guard !reduceMotion, let photo else { return false }
        return realElapsedMs >= photo.realTime(fromRace: photo.winMs)
    }

    /// The camera flash only fires during a photo finish's slow-mo window.
    func photoFlashOpacity(atRealElapsed realElapsedMs: Double) -> Double {
        guard !reduceMotion else { return 0 }
        guard let photo, photo.isPhoto,
              realElapsedMs >= photo.slowFrom, realElapsedMs <= photo.realSlowTo else { return 0 }
        // Two quick pops, matching the web app's ddflash keyframes.
        let t = (realElapsedMs - photo.slowFrom) / 1500
        switch t {
        case ..<0.07: return t / 0.07 * 0.92
        case ..<0.17: return 0.92 * (1 - (t - 0.07) / 0.10)
        case ..<0.30: return (t - 0.17) / 0.13 * 0.72
        case ..<0.42: return 0.72 * (1 - (t - 0.30) / 0.12)
        default: return 0
        }
    }

    // MARK: - Result copy

    var resultHeadline: String {
        guard let result else { return "" }
        return result.won ? "You won!" : "Bad luck"
    }

    var resultAmount: String {
        guard let result else { return "" }
        return result.won ? "+\(result.payout) POINTS" : "-\(result.stake) POINTS"
    }

    var resultDetail: String {
        guard let result else { return "" }
        let winner = result.duck(result.winnerOrd)?.name ?? "The winner"
        let mine = result.duck(result.pickedOrd)?.name ?? "your duck"

        if result.won { return "\(winner) romped home — and that was your duck!" }
        if result.sink?.ord == result.pickedOrd {
            return "\(winner) won it. \(mine) drowned, which is a shame."
        }
        return "\(winner) won it. Your duck \(mine) just didn't have the legs."
    }
}
