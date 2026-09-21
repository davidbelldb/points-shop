import Foundation
import Observation
import AVFoundation

/// Voice notes.
///
/// The web app records webm through MediaRecorder; here it's AAC in an m4a,
/// which is what the phone does natively and what the backend's audio
/// extensions already accept. The result is uploaded like any other file and
/// sent as a message whose body is the media URL.
@MainActor
@Observable
final class VoiceRecorder: NSObject, AVAudioRecorderDelegate {
    private(set) var isRecording = false
    private(set) var elapsed: TimeInterval = 0
    /// 0…1, for the little bars while you're talking.
    private(set) var level: Double = 0
    var error: String?

    private var recorder: AVAudioRecorder?
    private var ticker: Task<Void, Never>?
    private var fileURL: URL?

    /// Starts recording, asking for the microphone the first time.
    func start() async -> Bool {
        guard !isRecording else { return false }
        error = nil

        guard await requestMicrophone() else {
            error = "Microphone access is off. Settings → Sneaky Social → Microphone."
            return false
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            self.error = "Couldn't start recording just now."
            return false
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]

        do {
            let made = try AVAudioRecorder(url: url, settings: settings)
            made.delegate = self
            made.isMeteringEnabled = true
            made.record()
            recorder = made
            fileURL = url
            isRecording = true
            elapsed = 0
            startTicking()
            Haptics.tap()
            return true
        } catch {
            self.error = "Couldn't start recording just now."
            return false
        }
    }

    /// Stops and hands back the recording, or nil if it was too short to mean
    /// anything — a tap that was meant to open the tray, usually.
    func stop() -> Data? {
        guard isRecording, let recorder, let fileURL else { return nil }
        recorder.stop()
        ticker?.cancel()
        ticker = nil
        isRecording = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

        defer {
            try? FileManager.default.removeItem(at: fileURL)
            self.recorder = nil
            self.fileURL = nil
        }
        guard elapsed >= 0.6, let data = try? Data(contentsOf: fileURL) else { return nil }
        Haptics.tap()
        return data
    }

    func cancel() {
        guard isRecording else { return }
        _ = stop()
    }

    private func startTicking() {
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, let recorder = self.recorder, recorder.isRecording else { return }
                recorder.updateMeters()
                self.elapsed = recorder.currentTime
                // dB is roughly -60…0; squash it into something a bar can use.
                let db = Double(recorder.averagePower(forChannel: 0))
                self.level = max(0, min(1, (db + 55) / 55))
            }
        }
    }

    private func requestMicrophone() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    nonisolated func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        Task { @MainActor in
            self.error = "The recording failed."
            self.isRecording = false
        }
    }
}
