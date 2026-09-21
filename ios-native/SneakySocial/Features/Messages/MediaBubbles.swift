import SwiftUI
import AVFoundation

/// Photos, GIFs and voice notes.
///
/// All three arrive as a URL in the message body, so the only difference is
/// what's drawn around them.

struct PhotoBubble: View {
    let media: ChatMessage.Media
    let isMine: Bool
    var timestamp: Date?
    var reaction: String?
    var onOpen: () -> Void = {}

    var body: some View {
        AsyncImage(url: media.url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFit()
            case .failure:
                placeholder(systemImage: "photo")
            default:
                placeholder(systemImage: "photo", spinning: true)
            }
        }
        .frame(maxWidth: 220)
        .clipShape(.rect(cornerRadius: 16))
        .overlay(alignment: .bottomTrailing) {
            if let timestamp {
                Text(timestamp, style: .time)
                    .font(.caption2)
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
                    .padding(6)
            }
        }
        .overlay(alignment: isMine ? .bottomLeading : .bottomTrailing) {
            if let reaction, !reaction.isEmpty {
                Text(reaction == "heart" ? "❤️" : reaction)
                    .font(.system(size: 14))
                    .padding(5)
                    .background(.black.opacity(0.78), in: .circle)
                    .offset(x: isMine ? -10 : 10, y: 10)
            }
        }
        .contentShape(.rect)
        .onTapGesture(perform: onOpen)
        .accessibilityLabel(media.shape == .gif ? "GIF" : "Photo")
    }

    private func placeholder(systemImage: String, spinning: Bool = false) -> some View {
        ZStack {
            Color.secondary.opacity(0.18)
            if spinning {
                ProgressView()
            } else {
                Image(systemName: systemImage).foregroundStyle(.secondary)
            }
        }
        .frame(width: 220, height: 160)
    }
}

/// A voice note, with a play button and a bar that fills as it goes.
struct AudioBubble: View {
    let media: ChatMessage.Media
    let isMine: Bool
    var timestamp: Date?

    @Environment(\.colorScheme) private var colorScheme
    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var progress: Double = 0
    @State private var duration: Double = 0
    @State private var observer: Any?

    private var night: Bool { colorScheme == .dark }
    private var ink: Color { Palette.Bubble.foreground(mine: isMine, night: night) }

    var body: some View {
        HStack(spacing: 10) {
            Button(action: toggle) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(ink)
                    .frame(width: 32, height: 32)
                    .background(ink.opacity(0.15), in: .circle)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 4) {
                // A plain bar rather than a fake waveform — drawing peaks we
                // never measured would be a lie about the recording.
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(ink.opacity(0.22))
                        Capsule().fill(ink).frame(width: geo.size.width * progress)
                    }
                }
                .frame(height: 4)

                HStack(spacing: 6) {
                    Text(clock(duration > 0 ? duration * (1 - progress) : 0))
                    if let timestamp {
                        Text("·")
                        Text(timestamp, style: .time)
                    }
                }
                .font(.caption2)
                .foregroundStyle(ink.opacity(0.65))
            }
        }
        .frame(width: 190)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Palette.Bubble.background(mine: isMine, night: night),
                    in: .rect(cornerRadius: 16))
        .onDisappear(perform: teardown)
    }

    private func clock(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "0:00" }
        return String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60)
    }

    private func toggle() {
        Haptics.tap()
        if isPlaying {
            player?.pause()
            isPlaying = false
            return
        }

        if player == nil {
            let made = AVPlayer(url: media.url)
            player = made
            observer = made.addPeriodicTimeObserver(
                forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main
            ) { time in
                let total = made.currentItem?.duration.seconds ?? 0
                if total.isFinite, total > 0 {
                    duration = total
                    progress = min(1, time.seconds / total)
                    if progress >= 0.999 { finish() }
                }
            }
        }

        // Voice notes should come out of the speaker, not the earpiece.
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)

        if progress >= 0.999 { player?.seek(to: .zero); progress = 0 }
        player?.play()
        isPlaying = true
    }

    private func finish() {
        player?.pause()
        player?.seek(to: .zero)
        isPlaying = false
        progress = 0
    }

    private func teardown() {
        if let observer { player?.removeTimeObserver(observer) }
        observer = nil
        player?.pause()
        player = nil
        isPlaying = false
    }
}
