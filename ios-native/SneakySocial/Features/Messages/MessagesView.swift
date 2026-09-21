import SwiftUI
import PhotosUI

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
        ScrollView {
            LazyVStack(spacing: 0) {
                // The heading sits with the list rather than floating above a
                // card: an inset-grouped List put a third of the screen between
                // the title and the first name.
                HStack(alignment: .firstTextBaseline) {
                    PageHeading(title: "Messages")
                    Spacer(minLength: 8)
                    peopleButton
                }
                .padding(.horizontal, 16)
                .padding(.top, 4)
                .padding(.bottom, 10)

                if model.partners.isEmpty && !model.isLoading {
                    ContentUnavailableView("Nobody to write to",
                                           systemImage: "scroll.fill",
                                           description: Text("Connect with someone first — tap People."))
                        .padding(.top, 40)
                }

                ForEach(Array(model.partners.enumerated()), id: \.element.id) { index, partner in
                    Button {
                        Haptics.tap()
                        withAnimation(.snappy(duration: 0.28)) { openPartner = partner }
                    } label: {
                        PartnerRow(partner: partner, meID: session.account?.id)
                    }
                    .buttonStyle(RowPressStyle())

                    // Hairline starting where the text does, as every list on
                    // the phone draws it — not floating in from both edges.
                    if index < model.partners.count - 1 {
                        Rectangle()
                            .fill(.separator)
                            .frame(height: 0.5)
                            .padding(.leading, 76)
                    }
                }
            }
        }
        .scrollBounceBehavior(.basedOnSize)
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
            Avatar(url: partner.photo, size: 52)

            VStack(alignment: .leading, spacing: 3) {
                Text(partner.displayName)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                // A name on its own reads as a broken row, so a conversation
                // with nothing in it says so.
                Group {
                    if let preview = partner.preview {
                        Text(partner.lastSenderID == meID ? "You: \(preview)" : preview)
                    } else {
                        Text("No messages yet").italic()
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 6) {
                if let lastAt = partner.lastAt {
                    Text(lastAt, format: .relative(presentation: .numeric, unitsStyle: .narrow))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if partner.unread > 0 {
                    Text("\(partner.unread)")
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Palette.basket, in: .capsule)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(.rect)
    }
}

/// A row that dims while held, the way a list row does — `.plain` gives no
/// feedback at all, which makes a tappable row feel dead.
private struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.primary.opacity(0.08) : .clear)
    }
}

// MARK: - The thread

struct ThreadView: View {
    let partner: ChatPartner
    /// Back to the conversation list. The control lives in the thread's own
    /// heading, under the bar, so the top bar never changes shape.
    var onBack: () -> Void = {}

    @Environment(SessionStore.self) private var session
    @Environment(LocationStore.self) private var location
    @State private var model = MessagesViewModel()
    @State private var trackingFlight: TrackedFlight?
    /// The entry to draw attention to after coming back from the map.
    @State private var pulsing: String?
    /// Set to scroll the thread to a particular entry.
    @State private var scrollTarget: String?
    @State private var showingTray = false
    @State private var showingGifs = false
    @State private var showingPoll = false
    @State private var photoItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var raining: RainKind?
    @State private var shake = 0
    @State private var recorder = VoiceRecorder()
    @State private var showingPhotos = false
    @State private var trackerDetent: PresentationDetent = .medium
    @FocusState private var composerFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            threadHeading
            thread
            if location.place.isSet {
                if recorder.isRecording {
                    recordingBar
                } else if showingTray {
                    MediaTray(
                        partnerName: partner.displayName,
                        isBusy: model.isSending,
                        onGif: { closeTray(); showingGifs = true },
                        onPhoto: { closeTray(); showingPhotos = true },
                        onCamera: { closeTray(); showingCamera = true },
                        onVoice: { closeTray(); Task { _ = await recorder.start() } },
                        onPoll: { closeTray(); showingPoll = true },
                        onNudge: { closeTray(); Task { await model.sendNudge() } },
                        onRain: { kind in
                            closeTray()
                            // The sender sees it straight away rather than
                            // waiting for their own message to come back.
                            raining = kind
                            Task { await model.sendRain(kind) }
                        }
                    )
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                composer
            } else {
                locationGate
            }
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
        .sheet(item: $trackingFlight, onDismiss: {
            // Next crow opens at half height, whatever this one ended up at.
            trackerDetent = .medium
        }) { tracked in
            CrowTrackerSheet(flightPath: tracked.path, detent: $trackerDetent) {
                // Tapping the landed crow: shut the map and point at what it
                // brought, rather than leaving you to find it yourself.
                let entryID = tracked.kind == "messages" ? "chat-\(tracked.id)" : "scroll-\(tracked.id)"
                trackingFlight = nil
                pulse(entryID)
            }
        }
        .sheet(isPresented: $showingGifs) {
            GifPicker { url in Task { await model.sendRaw(url) } }
        }
        .sheet(isPresented: $showingPoll) {
            PollComposer { question, options in
                Task { await model.sendPoll(question: question, options: options) }
            }
        }
        .sheet(isPresented: $showingCamera) {
            CameraPicker { data in
                Task { await model.sendUpload(data, filename: "photo.jpg", mimeType: "image/jpeg") }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $showingPhotos, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                defer { photoItem = nil }
                guard let data = try? await item.loadTransferable(type: Data.self) else { return }
                await model.sendUpload(data, filename: "photo.jpg", mimeType: "image/jpeg")
            }
        }
        // A nudge shakes the thread; a shower rains over it. Either way the
        // model hands it over once and we clear it.
        .onChange(of: model.arrived) { _, gesture in
            guard let gesture else { return }
            switch gesture {
            case .nudge:
                Haptics.nudge()
                withAnimation(.default) { shake += 1 }
            case .twirl: raining = .twirl
            case .popcorn: raining = .popcorn
            case .duck: raining = .duck
            }
            model.arrived = nil
        }
        .overlay {
            if let raining {
                ChatRainView(kind: raining) { self.raining = nil }
            }
        }
        .modifier(ShakeEffect(travel: CGFloat(shake)))
        .task {
            model.meID = session.account?.id
            model.open(partner)
            await location.load()
            model.hasLocation = location.place.isSet
            await model.refresh(showSpinner: true)
            model.startPolling()
        }
        .onDisappear { model.stopPolling() }
    }

    /// The journey the tracker is showing. A scroll and a message describe
    /// their flights the same way, so only the path differs.
    private struct TrackedFlight: Identifiable, Hashable {
        let id: String
        var path: String { "/\(kind)/\(id)/flight" }
        let kind: String

        static func scroll(_ id: String) -> TrackedFlight { .init(id: id, kind: "scrolls") }
        static func message(_ id: String) -> TrackedFlight { .init(id: id, kind: "messages") }
    }

    /// Brings a bubble back into view and makes it announce itself.
    private func pulse(_ entryID: String) {
        pulsing = entryID
        Task {
            // Let the sheet finish closing before moving the thread underneath.
            try? await Task.sleep(for: .milliseconds(320))
            withAnimation(.easeOut(duration: 0.3)) { scrollTarget = entryID }
            Haptics.tap()
            try? await Task.sleep(for: .seconds(1.2))
            pulsing = nil
        }
    }

    /// Opening a journey. Always at half height — full height is a swipe up or
    /// a tap on the sheet's own header.
    ///
    /// It used to expand when you tapped the same crow twice, which only worked
    /// while the thread behind the sheet was tappable. That in turn meant the
    /// tap that dismissed the sheet landed on a bubble and reopened it, so it
    /// bounced straight back at full height. Both are gone.
    private func track(_ flight: TrackedFlight) {
        // The map comes up from the bottom, which is where the keyboard already
        // is. Let go of the composer first so the two don't fight over it.
        composerFocused = false
        trackerDetent = .medium
        trackingFlight = flight
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

            Spacer(minLength: 8)

            // How long the next crow takes, opposite the name it's going to.
            //
            // A guessed time and a measured one look the same otherwise, and
            // that matters: a guess means nobody's location was used, so the
            // message won't have a route to show on the map afterwards.
            if let estimate = model.flightEstimate, location.place.isSet {
                HStack(spacing: 5) {
                    Image(systemName: estimate.isGuess ? "location.slash" : "bird")
                    Text(estimate.spoken.capitalisedFirst)
                }
                .font(.caption)
                .foregroundStyle(estimate.isGuess ? Color.orange : Color.secondary)
                .lineLimit(1)
                .help(estimate.isGuess
                      ? "\(partner.displayName) hasn't said where they are"
                      : "Measured from where you both are")
            }
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
                            .pulse(pulsing == entry.id)
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
            .onChange(of: scrollTarget) { _, target in
                guard let target else { return }
                withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo(target, anchor: .center) }
                scrollTarget = nil
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
                        narration: message.narration,
                        delivered: message.hasArrived,
                        onTapFlight: { track(.message(message.id)) },
                        onLanded: {
                            // The words are only released on arrival, so go and
                            // fetch them rather than waiting for the next poll.
                            if !mine { Task { await model.refresh() } }
                        }
                    )
                    .contextMenu { reactions(for: message) }
                } else {
                    ChatBubble(
                        text: text,
                        isMine: mine,
                        timestamp: message.createdAt,
                        reaction: message.reaction,
                        edited: message.editedAt != nil,
                        replyToName: message.replyToSenderName,
                        replyToBody: message.replyToBody
                    )
                    // Every bubble opens its route. One sent before anyone had
                    // a location has none to show, and the sheet says so rather
                    // than drawing a map of nowhere.
                    .contentShape(.rect)
                    .onTapGesture { track(.message(message.id)) }
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
            aligned(mine) {
                PollBubble(poll: poll, isMine: mine, myID: model.meID) { option in
                    Task { await model.vote(message, option: option) }
                }
            }

        case .media(let media):
            aligned(mine) {
                switch media.shape {
                case .audio:
                    AudioBubble(media: media, isMine: mine, timestamp: message.createdAt)
                        .contextMenu { reactions(for: message) }
                case .photo, .gif:
                    PhotoBubble(media: media, isMine: mine,
                                timestamp: message.createdAt, reaction: message.reaction)
                        .contextMenu { reactions(for: message) }
                }
            }
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
            narration: scroll.narration,
            delivered: scroll.delivered,
            onTapFlight: { track(.scroll(scroll.id)) },
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

    private func closeTray() {
        withAnimation(.snappy(duration: 0.2)) { showingTray = false }
    }

    /// While a voice note is being recorded, the composer is the recorder.
    private var recordingBar: some View {
        HStack(spacing: 12) {
            Button {
                recorder.cancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 38, height: 38)
                    .background(.quaternary, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Discard recording")

            // A live level, so it's obvious the microphone is hearing you.
            Capsule()
                .fill(Palette.basket)
                .frame(width: 10, height: 10)
                .scaleEffect(1 + recorder.level)
                .animation(.easeOut(duration: 0.12), value: recorder.level)

            Text(String(format: "%d:%02d", Int(recorder.elapsed) / 60, Int(recorder.elapsed) % 60))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)

            Spacer(minLength: 0)

            Button {
                guard let data = recorder.stop() else { return }
                Task { await model.sendUpload(data, filename: "voice.m4a", mimeType: "audio/m4a") }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(Palette.basket, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Send voice note")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    /// Nothing can be sent until you've said where from. Rather than a disabled
    /// field and an explanation, the way out replaces the composer entirely.
    private var locationGate: some View {
        VStack(spacing: 10) {
            Text("Where are you sending from?")
                .font(.subheadline.weight(.semibold))

            Text("A crow flies the real distance, so it needs somewhere to leave from.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let locationError = location.error {
                Text(locationError)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task {
                    await location.useCurrentLocation()
                    model.hasLocation = location.place.isSet
                    await model.refresh()
                }
            } label: {
                if location.isWorking {
                    ProgressView().controlSize(.small)
                } else {
                    Label("Set location", systemImage: "location.fill")
                        .font(.subheadline.weight(.medium))
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(location.isWorking)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(.bar)
    }

    private var composer: some View {
        HStack(spacing: 10) {
            Button {
                Haptics.tap()
                composerFocused = false
                withAnimation(.snappy(duration: 0.22)) { showingTray.toggle() }
            } label: {
                Image(systemName: showingTray ? "xmark" : "plus")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 38, height: 38)
                    .background(.quaternary, in: .circle)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(showingTray ? "Close" : "Add")

            TextField("Say something…", text: $model.draft, axis: .vertical)
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
