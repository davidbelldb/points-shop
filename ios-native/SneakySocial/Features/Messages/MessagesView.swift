import SwiftUI

/// Messages: the whole messaging app now. Chat and crows share one thread, and
/// every bubble is parchment, so an arriving scroll reads as part of the
/// conversation rather than a notification from somewhere else.
struct MessagesView: View {
    @Environment(SessionStore.self) private var session
    @State private var model = MessagesViewModel()
    /// Open conversation, if any. Deliberately NOT a navigation push: a push
    /// puts a back chevron in the top-left, and the bar is the app icon's.
    @State private var openPartner: ChatPartner?
    @State private var showingPeople = false

    var body: some View {
        ZStack {
            if let openPartner {
                ThreadView(partner: openPartner) {
                    withAnimation(.snappy(duration: 0.28)) { self.openPartner = nil }
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
            } else {
                conversations
                    .transition(.move(edge: .leading).combined(with: .opacity))
            }
        }
        .appTopBar()
    }

    private var conversations: some View {
        List {
            HStack(alignment: .firstTextBaseline) {
                PageHeading(title: "Messages")
                Spacer(minLength: 8)
                peopleButton
            }
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listRowInsets(.init(top: 4, leading: 4, bottom: 8, trailing: 4))

            if model.partners.isEmpty && !model.isLoading {
                Section {
                    ContentUnavailableView("Nobody to write to",
                                           systemImage: "bubble.left.and.bubble.right",
                                           description: Text("Connect with someone first — tap People."))
                        .listRowBackground(Color.clear)
                }
            }

            ForEach(model.partners) { partner in
                Button {
                    Haptics.tap()
                    withAnimation(.snappy(duration: 0.28)) { openPartner = partner }
                } label: {
                    PartnerRow(partner: partner, meID: session.account?.id)
                }
                .buttonStyle(.plain)
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await model.loadPartners() }
        .sheet(isPresented: $showingPeople, onDismiss: {
            // Connections decide who's in the list, so it has to be re-read.
            Task { await model.loadPartners() }
        }) {
            FriendsSheet()
        }
        .task {
            model.meID = session.account?.id
            await model.loadPartners()
        }
    }

    /// The way in to connections — and where a request announces itself.
    private var peopleButton: some View {
        Button {
            Haptics.tap()
            showingPeople = true
        } label: {
            Image(systemName: "person.2.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.primary)
                .frame(width: 36, height: 36)
                .background(.quaternary, in: .circle)
                .overlay(alignment: .topTrailing) {
                    if model.friendRequests > 0 {
                        Text("\(model.friendRequests)")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Palette.basket, in: .capsule)
                            .offset(x: 4, y: -2)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.friendRequests > 0
                            ? "People, \(model.friendRequests) waiting"
                            : "People")
    }
}

/// One conversation in the list: who, what was last said, and how much is waiting.
private struct PartnerRow: View {
    let partner: ChatPartner
    let meID: String?

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: partner.photo, size: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(partner.displayName).font(.headline)
                if let preview = partner.preview {
                    Text(partner.lastSenderID == meID ? "You: \(preview)" : preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                if let lastAt = partner.lastAt {
                    Text(lastAt, format: .relative(presentation: .numeric, unitsStyle: .narrow))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if partner.unread > 0 {
                    Text("\(partner.unread)")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Palette.basket, in: .capsule)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - The thread

struct ThreadView: View {
    let partner: ChatPartner
    /// Back to the conversation list. The control lives in the thread's own
    /// heading, under the bar, so the top bar never changes shape.
    var onBack: () -> Void = {}

    @Environment(SessionStore.self) private var session
    @State private var model = MessagesViewModel()
    @State private var trackingScrollID: String?
    @State private var trackerDetent: PresentationDetent = .medium
    @FocusState private var composerFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            threadHeading
            thread
            flightBar
            composer
        }
        // Swipe in from the left edge, as a pushed screen would — without the
        // chevron that comes with one.
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { value in
                    guard value.startLocation.x < 40,
                          value.translation.width > 70,
                          abs(value.translation.height) < 60 else { return }
                    onBack()
                }
        )
        .sheet(item: Binding(
            get: { trackingScrollID.map(TrackedCrow.init) },
            set: { trackingScrollID = $0?.id }
        )) { tracked in
            CrowTrackerSheet(scrollID: tracked.id, detent: $trackerDetent)
        }
        .task {
            model.meID = session.account?.id
            model.open(partner)
            await location.load()
            await model.refresh(showSpinner: true)
            model.startPolling()
        }
        .onDisappear { model.stopPolling() }
    }

    /// `sheet(item:)` wants something Identifiable; the scroll's id alone is it.
    private struct TrackedCrow: Identifiable, Hashable {
        let id: String
    }

    /// Who you're talking to — under the bar, like every other page's name.
    private var threadHeading: some View {
        HStack(spacing: 10) {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 32, height: 32)
                    .background(.quaternary, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("All conversations")

            Avatar(url: partner.photo, size: 30)

            // Not a PageHeading: inside a conversation the other person's name
            // is a row label, not the name of the page.
            Text(partner.displayName)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    // MARK: Thread

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    if model.isLoading && model.entries.isEmpty {
                        ProgressView().padding(.top, 40)
                    }

                    if let error = model.error {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    ForEach(model.entries) { entry in
                        row(entry)
                            .id(entry.id)
                            .transition(.move(edge: .leading).combined(with: .opacity))
                    }

                    // Sent, airborne, not yet acknowledged by the server.
                    ForEach(model.inFlight) { outgoing in
                        aligned(true) {
                            CrowMessageBubble(
                                senderName: partner.displayName,
                                originLabel: nil,
                                text: outgoing.text,
                                startedAt: outgoing.startedAt,
                                arrivesAt: outgoing.arrivesAt,
                                isMine: true,
                                style: .message,
                                delivered: false
                            )
                        }
                        .transition(.move(edge: .leading).combined(with: .opacity))
                    }

                    // Something to scroll to that isn't the last bubble itself,
                    // so a tall bubble doesn't end up half off the screen.
                    Color.clear.frame(height: 1).id(bottomAnchor)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .scrollDismissesKeyboard(.interactively)
            .animation(.spring(response: 0.42, dampingFraction: 0.82), value: model.inFlight)
            .animation(.spring(response: 0.42, dampingFraction: 0.82), value: model.entries.count)
            .onChange(of: model.entries.count) { _, _ in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(bottomAnchor, anchor: .bottom) }
            }
            .onChange(of: model.inFlight.count) { _, _ in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(bottomAnchor, anchor: .bottom) }
            }
            .onAppear { proxy.scrollTo(bottomAnchor, anchor: .bottom) }
        }
    }

    private let bottomAnchor = "thread-bottom"

    @ViewBuilder
    private func row(_ entry: ThreadEntry) -> some View {
        switch entry {
        case .chat(let message):
            chatRow(message)
        case .scroll(let scroll):
            crowRow(scroll)
        }
    }

    @ViewBuilder
    private func chatRow(_ message: ChatMessage) -> some View {
        let mine = model.isMine(message.senderID)

        switch message.kind {
        case .system(let system):
            SystemLine(system: system, isMine: mine, senderName: partner.displayName)

        case .text(let text):
            aligned(mine) {
                // A message sent from this screen keeps flying where it landed
                // in the thread; everything else is already delivered.
                if let flight = model.flight(for: message.id) {
                    CrowMessageBubble(
                        senderName: partner.displayName,
                        originLabel: mine ? nil : message.originLabel,
                        // An inbound message in the air arrives without its
                        // body — there is deliberately nothing to reveal early.
                        text: text.isEmpty ? nil : text,
                        startedAt: flight.startedAt,
                        arrivesAt: flight.arrivesAt,
                        isMine: mine,
                        style: .message,
                        delivered: message.hasArrived,
                        onLanded: {
                            // The words are only released on arrival, so go and
                            // fetch them rather than waiting for the next poll.
                            if !mine { Task { await model.refresh() } }
                        }
                    )
                    .contextMenu { reactions(for: message) }
                } else {
                    ParchmentBubble(
                        text: text,
                        isMine: mine,
                        timestamp: message.createdAt,
                        reaction: message.reaction,
                        edited: message.editedAt != nil,
                        replyToName: message.replyToSenderName,
                        replyToBody: message.replyToBody
                    )
                    .contextMenu { reactions(for: message) }
                }
            }

        case .secret(let text, let revealed):
            aligned(mine) {
                SecretBubble(text: text, revealed: revealed, isMine: mine,
                             timestamp: message.createdAt) {
                    Task { await model.revealSecret(message) }
                }
            }

        case .poll(let poll):
            aligned(mine) { PollBubble(poll: poll, isMine: mine) }
        }
    }

    private func crowRow(_ scroll: ScrollMessage) -> some View {
        CrowMessageBubble(
            senderName: scroll.senderName ?? partner.displayName,
            originLabel: scroll.originLabel,
            text: scroll.body,
            startedAt: scroll.departedAt,
            arrivesAt: scroll.deliverAt,
            isMine: model.isMine(scroll.senderID),
            delivered: scroll.delivered,
            onTapFlight: {
                // Tapping the same crow again takes the sheet full height —
                // the "second tap" that a swipe would otherwise do.
                if trackingScrollID == scroll.id {
                    withAnimation { trackerDetent = .large }
                } else {
                    trackerDetent = .medium
                    trackingScrollID = scroll.id
                }
            },
            onLanded: {
                Task { await model.markScrollSeen(scroll) }
            }
        )
    }

    /// Mine to the right, theirs to the left, neither wider than most of the screen.
    private func aligned<Content: View>(_ mine: Bool, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            if mine { Spacer(minLength: 48) }
            content()
            if !mine { Spacer(minLength: 48) }
        }
    }

    @ViewBuilder
    private func reactions(for message: ChatMessage) -> some View {
        ForEach(["heart", "😂", "💜", "😲"], id: \.self) { key in
            Button(key == "heart" ? "❤️" : key) {
                Task { await model.react(to: message, with: message.reaction == key ? nil : key) }
            }
        }
    }

    // MARK: Composer

    /// How far the next crow has to fly — and, if nobody's said, a way to say.
    @ViewBuilder
    private var flightBar: some View {
        if let estimate = model.flightEstimate {
            HStack(spacing: 8) {
                Image(systemName: estimate.isGuess ? "location.slash" : "bird")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if estimate.isGuess && !location.place.isSet {
                    Text("Crows take \(estimate.spoken). Say where you are and they'll fly the real distance.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if estimate.isGuess {
                    Text("\(partner.displayName) hasn't said where they are — crows take \(estimate.spoken).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("\(estimate.spoken) from \(estimate.originLabel ?? "you") to \(estimate.destLabel ?? partner.displayName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 4)

                Button {
                    Task {
                        await location.useCurrentLocation()
                        await model.refresh()
                    }
                } label: {
                    if location.isWorking {
                        ProgressView().controlSize(.mini)
                    } else {
                        Label(location.place.isSet ? "Update" : "Set",
                              systemImage: "location.fill")
                            .font(.caption.weight(.medium))
                            .labelStyle(.titleAndIcon)
                    }
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
                .disabled(location.isWorking)
            }
            .lineLimit(2)
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }

        if let locationError = location.error {
            Text(locationError)
                .font(.caption)
                .foregroundStyle(.orange)
                .padding(.horizontal, 16)
                .padding(.top, 4)
        }
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Message \(partner.displayName)", text: $model.draft, axis: .vertical)
                .lineLimit(1...5)
                .textFieldStyle(.plain)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial, in: .capsule)
                .focused($composerFocused)
                .submitLabel(.send)

            Button {
                Task { await model.send() }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(model.canSend ? Palette.basket : Color.secondary.opacity(0.4), in: .circle)
            }
            .buttonStyle(.plain)
            .disabled(!model.canSend)
            .animation(.snappy, value: model.canSend)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }
}
