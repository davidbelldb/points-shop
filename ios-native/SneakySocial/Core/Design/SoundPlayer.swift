import AVFoundation
import Observation

/// One-shot sound effects, mirroring frontend/src/lib/sounds.js.
///
/// Best-effort by design: a missing file is a no-op rather than an error, so
/// dropping `quack.mp3` into Resources is all it takes to give the derby a
/// voice. Playback is ducked into the ambient category, so it never interrupts
/// whatever the person is already listening to.
@MainActor
@Observable
final class SoundPlayer {
    static let shared = SoundPlayer()

    private static let muteKey = "sound.muted"
    private var players: [String: AVAudioPlayer] = [:]
    private var sessionConfigured = false

    var isMuted: Bool {
        didSet {
            guard isMuted != oldValue else { return }
            UserDefaults.standard.set(isMuted, forKey: Self.muteKey)
        }
    }

    init() {
        isMuted = UserDefaults.standard.bool(forKey: Self.muteKey)
    }

    func play(_ name: String, volume: Float = 1) {
        guard !isMuted, let player = player(for: name) else { return }
        configureSessionIfNeeded()
        player.volume = volume
        player.currentTime = 0
        player.play()
    }

    /// Warm the decoder for sounds a screen is about to need.
    func preload(_ names: [String]) {
        for name in names { _ = player(for: name) }
    }

    private func player(for name: String) -> AVAudioPlayer? {
        if let cached = players[name] { return cached }

        for ext in ["mp3", "caf", "m4a", "wav"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: ext),
                  let player = try? AVAudioPlayer(contentsOf: url) else { continue }
            player.prepareToPlay()
            players[name] = player
            return player
        }
        return nil
    }

    private func configureSessionIfNeeded() {
        guard !sessionConfigured else { return }
        sessionConfigured = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}

/// Effect names the app asks for. Any without a file in Resources simply stay silent.
enum Sound {
    static let caw = "caw"
    static let raceStart = "race_start"
    static let quack = "quack"
    static let splash = "splash"
    static let cheer = "cheer"
    static let groan = "groan"
}
