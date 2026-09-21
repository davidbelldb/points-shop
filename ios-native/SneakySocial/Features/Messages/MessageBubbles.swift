import SwiftUI

/// Parchment bubbles. The whole thread is scrolls — ordinary messages included
/// — so a crow arriving doesn't look like a different app.

// MARK: - Ordinary messages

/// An ordinary message, on parchment.
struct ParchmentBubble: View {
    let text: String
    let isMine: Bool
    var timestamp: Date?
    var reaction: String?
    var edited: Bool = false
    var replyToName: String?
    var replyToBody: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let replyToBody, !replyToBody.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text(replyToName ?? "Earlier")
                        .font(CrowArt.font(size: 10))
                        .foregroundStyle(.black.opacity(0.6))
                    Text(replyToBody)
                        .font(CrowArt.font(size: 12))
                        .foregroundStyle(.black.opacity(0.75))
                        .lineLimit(2)
                }
                .padding(.leading, 8)
                .overlay(alignment: .leading) {
                    Capsule().fill(.black.opacity(0.35)).frame(width: 2)
                }
            }

            Text(text)
                .font(CrowArt.font(size: 15))
                .foregroundStyle(.black)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if timestamp != nil || edited {
                HStack(spacing: 4) {
                    if edited { Text("edited").font(CrowArt.font(size: 10)) }
                    if let timestamp { Text(timestamp, style: .time).font(CrowArt.font(size: 10)) }
                }
                .foregroundStyle(.black.opacity(0.5))
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background { Parchment() }
        .clipShape(.rect(cornerRadius: 16))
        // The parchment is the same on both sides; a darker edge on your own
        // messages separates the two without inventing a second colour.
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(.black.opacity(isMine ? 0.38 : 0.12), lineWidth: 1)
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
    }
}

/// A secret: sealed until the person it's for opens it.
struct SecretBubble: View {
    let text: String
    let revealed: Bool
    let isMine: Bool
    var timestamp: Date?
    var onReveal: () -> Void

    var body: some View {
        if revealed || isMine {
            ParchmentBubble(text: text, isMine: isMine, timestamp: timestamp)
        } else {
            Button(action: onReveal) {
                HStack(spacing: 8) {
                    Image(systemName: "lock.fill")
                    Text("A secret — tap to open").font(CrowArt.font(size: 14))
                }
                .foregroundStyle(.black.opacity(0.8))
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background { Parchment() }
                .clipShape(.rect(cornerRadius: 16))
                .overlay {
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(.black.opacity(0.32), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                }
            }
            .buttonStyle(.plain)
        }
    }
}

/// A poll, shown as it was asked. Voting still lives on the web app.
struct PollBubble: View {
    let poll: ChatMessage.Poll
    let isMine: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(poll.question)
                .font(CrowArt.font(size: 15))
                .foregroundStyle(.black)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(poll.options.enumerated()), id: \.offset) { _, option in
                Text(option)
                    .font(CrowArt.font(size: 13))
                    .foregroundStyle(.black.opacity(0.85))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.black.opacity(0.08), in: .rect(cornerRadius: 8))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background { Parchment() }
        .clipShape(.rect(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(.black.opacity(isMine ? 0.38 : 0.12), lineWidth: 1)
        }
    }
}

/// A nudge or a shower — wordless, so it gets a line rather than a bubble.
struct SystemLine: View {
    let system: SystemMessage
    let isMine: Bool
    let senderName: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: system.symbol)
            Text("\(isMine ? "You" : senderName) sent \(system.line)")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }
}

// MARK: - Crows

/// A crow-delivered scroll.
///
/// While it's flying, the bubble is just the trail with the crow gliding along
/// it. On arrival the crow settles at the right-hand end and the bubble drops
/// open beneath it to reveal the message. Tapping the trail opens the tracker.
struct CrowMessageBubble: View {
    /// How much ceremony the bubble deserves.
    enum Style {
        /// A real scroll: where it came from, who sent it, and a tappable map.
        case scroll
        /// An ordinary message. Everything here travels by crow, but a chat
        /// message gets one line of flight rather than a dispatch notice.
        case message
    }

    let senderName: String
    let originLabel: String?
    let text: String?
    let startedAt: Date
    let arrivesAt: Date
    let isMine: Bool
    var style: Style = .scroll

    /// True once the scroll has been delivered, as far as the server knows.
    let delivered: Bool

    /// Tapping the flight line opens the map. Available the whole time — in
    /// flight it's a live tracker, afterwards it's the route the crow took.
    var onTapFlight: () -> Void = {}
    /// Called the first time this bubble opens in front of its recipient.
    var onLanded: () -> Void = {}

    @State private var hasLanded = false
    @State private var revealed = false
    /// 0…4, driven off the flight clock — the same five positions the Live
    /// Activity steps the crow through as the street subtitles arrive.
    @State private var phase = 0

    /// Landed if the server says so, or if the arrival time has simply passed
    /// while we've been watching.
    private var landed: Bool { delivered || hasLanded }

    private var title: String {
        if landed {
            return isMine ? "Delivered to \(senderName)." : "News from \(originLabel ?? senderName)."
        }
        return isMine ? "Your crow is on its way." : "A scroll will shortly be arriving."
    }

    private var subtitle: String {
        if landed { return "Delivered by crow" }
        let from = originLabel.map { " from \($0)" } ?? ""
        return isMine ? "A crow left\(from)" : "A crow has been dispatched\(from)"
    }

    var body: some View {
        VStack(spacing: style == .scroll ? 10 : 8) {
            if style == .scroll {
                Text(title)
                    .font(CrowArt.font(size: 17))
                    .foregroundStyle(.black)
                    .multilineTextAlignment(.center)

                Text(subtitle)
                    .font(CrowArt.font(size: 11))
                    .foregroundStyle(.black.opacity(0.85))
                    .lineLimit(1)
            }

            flightLine

            // The reveal: the bubble drops open to show the message.
            if revealed, let text, !text.isEmpty {
                VStack(spacing: 6) {
                    Rectangle()
                        .fill(.black.opacity(0.18))
                        .frame(height: 1)
                        .padding(.horizontal, 8)

                    Text(text)
                        .font(CrowArt.font(size: 15))
                        .foregroundStyle(.black)
                        .multilineTextAlignment(style == .scroll ? .center : .leading)
                        .frame(maxWidth: .infinity, alignment: style == .scroll ? .center : .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .top).combined(with: .opacity),
                    removal: .opacity
                ))
            }
        }
        .padding(.horizontal, style == .scroll ? 16 : 14)
        .padding(.vertical, style == .scroll ? 14 : 10)
        // A scroll takes the width of the thread; a message is only as wide as
        // it needs to be, starting at the width of its own flight line.
        .frame(maxWidth: style == .scroll ? .infinity : 270,
               alignment: style == .scroll ? .center : .leading)
        .background { Parchment() }
        // Clipped so the revealed text slides out from under the trail rather
        // than appearing over the edge of the parchment.
        .clipShape(.rect(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18).stroke(.black.opacity(0.2), lineWidth: 1)
        }
        .task(id: arrivesAt) { await flyTheCrow() }
        .onChange(of: landed) { _, isLanded in
            guard isLanded else { return }
            open()
        }
        .onAppear {
            // Anything that landed before this view existed is simply open —
            // no animation for history.
            if landed {
                revealed = true
                phase = 4
            }
        }
    }

    /// Crow, dashed line, crow. The whole bubble in flight.
    private var flightLine: some View {
        let sprite: CGFloat = style == .scroll ? 28 : 22

        return HStack(spacing: style == .scroll ? 10 : 8) {
            CrowSprite(name: CrowArt.left, size: sprite)
            CrowTrail(startedAt: startedAt, arrivesAt: arrivesAt,
                      landed: landed, phase: phase)
                .frame(minWidth: style == .scroll ? nil : 120)
            // The perched crow the glider settles into once it arrives.
            CrowSprite(name: CrowArt.right, size: sprite)
        }
        // A generous target: the trail itself is 12pt tall, which is no use as
        // a tap area.
        .padding(.vertical, style == .scroll ? 8 : 4)
        .contentShape(.rect)
        .onTapGesture {
            // Only a real scroll has a journey worth watching on a map.
            guard style == .scroll else { return }
            Haptics.tap()
            onTapFlight()
        }
        .accessibilityAddTraits(style == .scroll ? [.isButton] : [])
        .accessibilityLabel(style == .scroll ? "Track this crow" : "In flight")
    }

    private func open() {
        guard !revealed else { return }
        // Let the crow settle before the bubble drops open.
        Task {
            try? await Task.sleep(for: .milliseconds(450))
            withAnimation(.spring(response: 0.55, dampingFraction: 0.72)) {
                revealed = true
            }
            Haptics.tap()
            onLanded()
        }
    }

    /// Walks the crow through its five positions on the flight's own clock, then
    /// lands it — so a bubble watched through its arrival flips over on its own
    /// without waiting for the next poll.
    private func flyTheCrow() async {
        guard !landed else { return }
        let total = arrivesAt.timeIntervalSince(startedAt)
        guard total > 0 else {
            hasLanded = true
            return
        }

        // Positions 1–4 sit at the quarter marks; 0 is the moment it left.
        for step in 0...4 {
            let due = startedAt.addingTimeInterval(total * Double(step) / 4)
            let wait = due.timeIntervalSinceNow
            if wait > 0 {
                try? await Task.sleep(for: .seconds(wait))
                guard !Task.isCancelled else { return }
            }
            withAnimation(.easeInOut(duration: 0.8)) { phase = step }
        }

        let remaining = arrivesAt.timeIntervalSinceNow
        if remaining > 0 {
            try? await Task.sleep(for: .seconds(remaining))
            guard !Task.isCancelled else { return }
        }
        hasLanded = true
    }
}
