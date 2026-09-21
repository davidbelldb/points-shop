import SwiftUI

/// Chat bubbles, in the web app's colours: teal for yours, pink for theirs,
/// each with a light and a dark pair. The parchment and the ImperialBlack face
/// are gone — a crow still carries every message, but it no longer has to look
/// like a medieval one.

/// The one tight corner on the sender's side, as the web app draws it.
private func bubbleShape(mine: Bool) -> UnevenRoundedRectangle {
    .rect(
        topLeadingRadius: 16,
        bottomLeadingRadius: mine ? 16 : 4,
        bottomTrailingRadius: mine ? 4 : 16,
        topTrailingRadius: 16
    )
}

// MARK: - Ordinary messages

struct ChatBubble: View {
    let text: String
    let isMine: Bool
    var timestamp: Date?
    var reaction: String?
    var edited: Bool = false
    var replyToName: String?
    var replyToBody: String?

    @Environment(\.colorScheme) private var colorScheme
    private var night: Bool { colorScheme == .dark }
    private var ink: Color { Palette.Bubble.foreground(mine: isMine, night: night) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let replyToBody, !replyToBody.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text(replyToName ?? "Earlier")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ink.opacity(0.7))
                    Text(replyToBody)
                        .font(.caption)
                        .foregroundStyle(ink.opacity(0.8))
                        .lineLimit(2)
                }
                .padding(.leading, 8)
                .overlay(alignment: .leading) {
                    Capsule().fill(ink.opacity(0.4)).frame(width: 2)
                }
            }

            // Time sits beside the last line rather than on its own row. A
            // trailing-aligned row wants infinite width, which is what was
            // stretching a two-word message across the whole thread.
            HStack(alignment: .bottom, spacing: 6) {
                Text(text)
                    .font(.body)
                    .foregroundStyle(ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                if timestamp != nil || edited {
                    HStack(spacing: 3) {
                        if edited { Text("edited") }
                        if let timestamp { Text(timestamp, style: .time) }
                    }
                    .font(.caption2)
                    .foregroundStyle(ink.opacity(0.6))
                    .padding(.bottom, 1)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Palette.Bubble.background(mine: isMine, night: night),
                    in: bubbleShape(mine: isMine))
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
            ChatBubble(text: text, isMine: isMine, timestamp: timestamp)
        } else {
            Button(action: onReveal) {
                HStack(spacing: 8) {
                    Image(systemName: "lock.fill")
                    Text("A secret — tap to open").font(.subheadline)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Palette.Bubble.sealed, in: bubbleShape(mine: isMine))
            }
            .buttonStyle(.plain)
        }
    }
}

/// A poll, shown as it was asked. Voting still lives on the web app.
struct PollBubble: View {
    let poll: ChatMessage.Poll
    let isMine: Bool
    var myID: String?
    var onVote: (Int) -> Void = { _ in }

    @Environment(\.colorScheme) private var colorScheme
    private var night: Bool { colorScheme == .dark }
    private var ink: Color { Palette.Bubble.foreground(mine: isMine, night: night) }

    private var myVote: Int? { myID.flatMap { poll.votes[$0] } }
    private var total: Int { poll.votes.count }

    private func share(_ index: Int) -> Double {
        guard total > 0 else { return 0 }
        return Double(poll.votes.values.filter { $0 == index }.count) / Double(total)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(poll.question)
                .font(.body.weight(.medium))
                .foregroundStyle(ink)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(poll.options.enumerated()), id: \.offset) { index, option in
                Button {
                    onVote(index)
                } label: {
                    HStack(spacing: 8) {
                        Text(option)
                            .font(.subheadline)
                            .foregroundStyle(ink.opacity(0.95))
                        Spacer(minLength: 4)
                        if myVote == index {
                            Image(systemName: "checkmark").font(.caption.weight(.bold))
                        }
                        if total > 0 {
                            Text("\(Int((share(index) * 100).rounded()))%")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(ink.opacity(0.7))
                        }
                    }
                    .foregroundStyle(ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(alignment: .leading) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 8).fill(ink.opacity(0.1))
                                // The bar is the result, drawn behind the label.
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(ink.opacity(myVote == index ? 0.3 : 0.18))
                                    .frame(width: geo.size.width * share(index))
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
            }

            if total > 0 {
                Text(total == 1 ? "1 vote" : "\(total) votes")
                    .font(.caption2)
                    .foregroundStyle(ink.opacity(0.6))
            }
        }
        .frame(maxWidth: 240)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Palette.Bubble.background(mine: isMine, night: night),
                    in: bubbleShape(mine: isMine))
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

/// A message still in the air.
///
/// While it's flying, the bubble is just the trail with the crow gliding along
/// it. On arrival the crow settles at the right-hand end and the bubble drops
/// open beneath it to reveal the message. Tapping it opens the route.
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

    /// Tapping opens the route. Available the whole time — in flight it's a
    /// live tracker, afterwards it's the way the crow came.
    var onTapFlight: () -> Void = {}
    /// Called the first time this bubble opens in front of its recipient.
    var onLanded: () -> Void = {}

    @Environment(\.colorScheme) private var colorScheme
    @State private var hasLanded = false
    @State private var revealed = false
    /// 0…4, driven off the flight clock — the same five positions the Live
    /// Activity steps the crow through as the street subtitles arrive.
    @State private var phase = 0

    private var night: Bool { colorScheme == .dark }
    private var ink: Color { Palette.Bubble.foreground(mine: isMine, night: night) }

    /// Landed if the server says so, or if the arrival time has simply passed
    /// while we've been watching.
    private var landed: Bool { delivered || hasLanded }

    private var title: String {
        if landed {
            return isMine ? "Delivered to \(senderName)." : "News from \(originLabel ?? senderName)."
        }
        return isMine ? "Your crow is on its way." : "A scroll will shortly be arriving."
    }

    /// The little line under a sent message saying where its crow has got to.
    private var progressNote: String {
        landed ? "Delivered" : "On its way"
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
                    .font(.headline)
                    .foregroundStyle(ink)
                    .multilineTextAlignment(.center)

                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(ink.opacity(0.85))
                    .lineLimit(1)
            }

            // Your own message reads first and carries its flight underneath;
            // theirs is the other way round, because the arrival is the event.
            if isMine, style == .message {
                messageText
                flightLine
                Text(progressNote)
                    .font(.caption2)
                    .foregroundStyle(ink.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .trailing)
            } else {
                flightLine

                // The reveal: the bubble drops open to show the message.
                if revealed, text?.isEmpty == false {
                    VStack(spacing: 6) {
                        Rectangle()
                            .fill(ink.opacity(0.25))
                            .frame(height: 1)
                            .padding(.horizontal, 8)

                        messageText
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .opacity
                    ))
                }
            }
        }
        .padding(.horizontal, style == .scroll ? 16 : 12)
        .padding(.vertical, style == .scroll ? 14 : 10)
        // A scroll takes the width of the thread; a message is only as wide as
        // it needs to be, starting at the width of its own flight line.
        .frame(maxWidth: style == .scroll ? .infinity : 240,
               alignment: style == .scroll ? .center : .leading)
        .background(Palette.Bubble.background(mine: isMine, night: night),
                    in: bubbleShape(mine: isMine))
        // Clipped so the revealed text slides out from under the trail rather
        // than appearing over the edge of the bubble.
        .clipShape(bubbleShape(mine: isMine))
        // Tapping anywhere on the bubble opens its route, not just the thin
        // trail — on a message bubble that line is only 12pt tall.
        .contentShape(.rect)
        .onTapGesture {
            Haptics.tap()
            onTapFlight()
        }
        .task(id: arrivesAt) { await flyTheCrow() }
        .onChange(of: landed) { _, isLanded in
            guard isLanded else { return }
            open()
        }
        .onAppear {
            // Your own message is open from the moment you send it. You wrote
            // it; the wait belongs to the person it's flying to. The trail
            // still runs above it, so you can see how far off it is.
            if isMine { revealed = true }
            // Anything that landed before this view existed is simply open —
            // no animation for history.
            if landed {
                revealed = true
                phase = 4
            }
        }
    }

    @ViewBuilder
    private var messageText: some View {
        if let text, !text.isEmpty {
            Text(text)
                .font(.body)
                .foregroundStyle(ink)
                .multilineTextAlignment(style == .scroll ? .center : .leading)
                .frame(maxWidth: .infinity, alignment: style == .scroll ? .center : .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Crow, dashed line, crow. The whole bubble in flight.
    private var flightLine: some View {
        let sprite: CGFloat = style == .scroll ? 28 : 22

        return HStack(spacing: style == .scroll ? 10 : 8) {
            CrowSprite(name: CrowArt.left, size: sprite)
            CrowTrail(startedAt: startedAt, arrivesAt: arrivesAt,
                      landed: landed, phase: phase, tint: ink)
                .frame(minWidth: style == .scroll ? nil : 120)
            // The perched crow the glider settles into once it arrives.
            CrowSprite(name: CrowArt.right, size: sprite)
        }
        .padding(.vertical, style == .scroll ? 8 : 4)
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
