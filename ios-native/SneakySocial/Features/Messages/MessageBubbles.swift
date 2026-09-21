import SwiftUI

/// Parchment bubbles. The whole thread is scrolls — ordinary messages included —
/// so a crow arriving doesn't look like a different app.

/// An ordinary message, on parchment.
struct ParchmentBubble: View {
    let text: String
    let isMine: Bool
    var timestamp: Date?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(text)
                .font(CrowArt.font(size: 15))
                .foregroundStyle(.black)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if let timestamp {
                Text(timestamp, style: .time)
                    .font(CrowArt.font(size: 10))
                    .foregroundStyle(.black.opacity(0.5))
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background {
            Image(CrowArt.tile).resizable().scaledToFill()
        }
        .clipShape(.rect(cornerRadius: 16))
        .frame(maxWidth: 280, alignment: isMine ? .trailing : .leading)
    }
}

/// A crow-delivered scroll.
///
/// While it's flying, the bubble is just the trail with the crow gliding along
/// it. On arrival the crow settles at the right-hand end and the bubble drops
/// open beneath it to reveal the message.
struct CrowMessageBubble: View {
    let senderName: String
    let originLabel: String?
    let body_: String
    let startedAt: Date
    let arrivesAt: Date
    let phase: Int
    let isMine: Bool

    /// True once the scroll has been delivered, as far as the server knows.
    let delivered: Bool

    @State private var hasLanded = false
    @State private var revealed = false

    /// Landed if the server says so, or if the arrival time has simply passed
    /// while we've been watching.
    private var landed: Bool { delivered || hasLanded }

    private var title: String {
        landed ? "News from \(originLabel ?? senderName)." : "A scroll will shortly be arriving."
    }

    private var subtitle: String {
        landed
            ? "Delivered by crow"
            : "A crow has been dispatched\(originLabel.map { " from \($0)" } ?? "")"
    }

    var body: some View {
        VStack(spacing: 10) {
            Text(title)
                .font(CrowArt.font(size: 17))
                .foregroundStyle(.black)
                .multilineTextAlignment(.center)

            Text(subtitle)
                .font(CrowArt.font(size: 11))
                .foregroundStyle(.black.opacity(0.85))
                .lineLimit(1)

            HStack(spacing: 10) {
                Image(CrowArt.left).resizable().scaledToFit().frame(width: 28, height: 28)
                CrowTrail(startedAt: startedAt, arrivesAt: arrivesAt,
                          landed: landed, phase: phase)
                // The perched crow the glider settles into once it arrives.
                Image(CrowArt.right).resizable().scaledToFit().frame(width: 28, height: 28)
            }

            // The reveal: the bubble drops open to show the scroll.
            if revealed {
                VStack(spacing: 6) {
                    Rectangle()
                        .fill(.black.opacity(0.18))
                        .frame(height: 1)
                        .padding(.horizontal, 8)

                    Text(body_)
                        .font(CrowArt.font(size: 15))
                        .foregroundStyle(.black)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .top).combined(with: .opacity),
                    removal: .opacity
                ))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background { Image(CrowArt.tile).resizable().scaledToFill() }
        // Clipped so the revealed text slides out from under the trail rather
        // than appearing over the edge of the parchment.
        .clipShape(.rect(cornerRadius: 18))
        .task(id: arrivesAt) { await waitForLanding() }
        .onChange(of: landed) { _, isLanded in
            guard isLanded else { return }
            // Let the crow settle before the bubble opens.
            Task {
                try? await Task.sleep(for: .milliseconds(450))
                withAnimation(.spring(response: 0.55, dampingFraction: 0.72)) {
                    revealed = true
                }
                Haptics.tap()
            }
        }
        .onAppear {
            // Anything that landed before this view existed is simply open —
            // no animation for history.
            if landed { revealed = true }
        }
    }

    /// Sleeps until the crow is due, so a bubble watched through its landing
    /// flips over on its own without waiting for the next poll.
    private func waitForLanding() async {
        guard !landed else { return }
        let seconds = arrivesAt.timeIntervalSinceNow
        guard seconds > 0 else {
            hasLanded = true
            return
        }
        try? await Task.sleep(for: .seconds(seconds))
        guard !Task.isCancelled else { return }
        hasLanded = true
    }
}
