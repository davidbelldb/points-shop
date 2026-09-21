import Foundation
import Observation

/// Loads one conversation: chat messages and crow scrolls, merged into a single
/// timeline and polled while the thread is on screen.
///
/// Two calls rather than one, because the two live in different tables with
/// different delivery rules — the merge is cheap, and it keeps the backend
/// honest about which is which.
@MainActor
@Observable
final class MessagesViewModel {
    private(set) var partners: [ChatPartner] = []
    private(set) var entries: [ThreadEntry] = []
    private(set) var partner: ChatPartner?
    private(set) var isLoading = false
    private(set) var isSending = false
    /// People waiting on an answer from you — the dot on the People button.
    private(set) var friendRequests = 0

    /// Messages that have left but aren't in the thread yet — they exist only
    /// here, for the moment between hitting send and the server answering.
    private(set) var inFlight: [OutgoingMessage] = []
    /// How long the next message will take, and whether both people have said
    /// where they are.
    private(set) var flightEstimate: FlightEstimate?

    /// Flight windows for messages that HAVE landed in the thread, keyed by id.
    /// Kept for the life of the screen so a bubble that has already played its
    /// journey doesn't play it again on the next poll.
    private(set) var flights: [String: FlightWindow] = [:]

    /// Fallback journey, for the moment before the server has told us what the
    /// real one is. It matches the backend's own default.
    static let messageFlight: TimeInterval = 240

    struct FlightWindow: Sendable, Equatable {
        let startedAt: Date
        let arrivesAt: Date
    }

    /// A message drawn from nothing but the draft, so the crow leaves the
    /// instant you hit send rather than when the network gets round to it.
    struct OutgoingMessage: Sendable, Identifiable, Equatable {
        let id: String
        let text: String
        let startedAt: Date
        let arrivesAt: Date
    }
    var error: String?
    var draft = ""

    /// Who we are, so the thread knows which side each bubble belongs on.
    var meID: String?

    private let api: APIClient
    private var pollTask: Task<Void, Never>?
    /// Scrolls already reported as seen, so a poll doesn't re-POST every cycle.
    private var seenScrolls = Set<String>()

    init(api: APIClient = .shared) {
        self.api = api
    }

    var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && partner != nil
            && !isSending
    }

    /// Total waiting across every conversation — the tab badge.
    var totalUnread: Int { partners.reduce(0) { $0 + $1.unread } }

    func isMine(_ senderID: String) -> Bool { senderID == meID }

    // MARK: - Loading

    func loadPartners() async {
        // A request count is cheap and belongs on the same screen refresh; a
        // failure here must not cost us the conversation list.
        if let count = try? await api.get("/friends/requests/count", as: FriendRequestCount.self) {
            friendRequests = count.count
        }
        do {
            let response = try await api.get("/messages/partners", as: PartnersResponse.self)
            partners = response.partners
            // Keep an open conversation's header in step with the list.
            if let partner, let fresh = response.partners.first(where: { $0.id == partner.id }) {
                self.partner = fresh
            }
        } catch let apiError as APIError where apiError.isUnauthorised {
            // The session store handles signing out.
        } catch {
            report(error)
        }
    }

    func open(_ partner: ChatPartner) {
        guard partner.id != self.partner?.id else { return }
        self.partner = partner
        entries = []
        seenScrolls = []
        inFlight = []
        flights = [:]
        flightEstimate = nil
    }

    /// One pass: chat and scrolls together, merged and sorted.
    func refresh(showSpinner: Bool = false) async {
        guard let partnerID = partner?.id else { return }
        if showSpinner { isLoading = true }
        defer { if showSpinner { isLoading = false } }

        // The two halves are fetched together but fail apart. Crows are the
        // newer endpoint, so a backend that hasn't caught up must not be able
        // to blank out the chat — the thread degrades to messages only.
        // Captured locally so the two child tasks touch the client, not this
        // main-actor object.
        let api = self.api
        async let chatResult = Self.attempt { try await api.get("/messages?with=\(partnerID)&crows=1", as: ChatThreadResponse.self) }
        async let scrollResult = Self.attempt { try await api.get("/scrolls/thread?with=\(partnerID)", as: ScrollThreadResponse.self) }
        let (chatThread, scrollThread) = await (chatResult, scrollResult)

        // The conversation may have been closed between the calls going out and
        // the replies landing — don't paint someone else's thread.
        guard partner?.id == partnerID else { return }

        switch (chatThread, scrollThread) {
        case (.failure(let failure), _) where failure.isUnauthorised:
            return                              // the session store signs us out
        case (.failure(let failure), _):
            report(failure)                     // no chat is a real failure
            return
        case (.success(let chat), let scrolls):
            if let estimate = chat.flight { flightEstimate = estimate }
            var merged: [ThreadEntry] = chat.messages.map(ThreadEntry.chat)
            if case .success(let crows) = scrolls {
                merged.append(contentsOf: crows.scrolls.map(ThreadEntry.scroll))
            } else {
                // No crows and unreachable crows look the same to the person
                // reading: an empty sky. Keep whatever we last had and say
                // nothing — there's no action for them to take.
                merged.append(contentsOf: entries.compactMap {
                    if case .scroll(let scroll) = $0 { return ThreadEntry.scroll(scroll) }
                    return nil
                })
            }
            error = nil
            merged.sort { $0.sortDate < $1.sortDate }

            // Anything still in the air gets a flight window the moment we see
            // it, and keeps it afterwards — so a bubble watched through its
            // landing stays a crow rather than snapping back to plain
            // parchment on the next poll.
            for case .chat(let message) in merged
            where message.hasFlight && !message.hasArrived && flights[message.id] == nil {
                flights[message.id] = FlightWindow(startedAt: message.departedAt,
                                                   arrivesAt: message.arrivesAt)
            }

            entries = merged
            await markChatRead(partnerID)
        }
    }

    /// Runs a call and hands back its outcome rather than throwing, so two
    /// concurrent fetches can succeed and fail independently.
    nonisolated private static func attempt<T: Sendable>(
        _ work: @Sendable () async throws -> T
    ) async -> Result<T, APIError> {
        do {
            return .success(try await work())
        } catch let apiError as APIError {
            return .failure(apiError)
        } catch {
            return .failure(.network(error.localizedDescription))
        }
    }

    // MARK: - Polling

    /// Polls while the thread is visible. Deliberately gentle: in-flight crows
    /// land on their own clock inside the bubble, so this only has to catch what
    /// the other end sends.
    func startPolling(every seconds: Double = 4) {
        stopPolling()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(seconds))
                guard !Task.isCancelled else { return }
                await self?.refresh()
                await self?.loadPartners()
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: - Sending

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let partnerID = partner?.id, !isSending else { return }
        isSending = true
        defer { isSending = false }

        // The crow leaves on the tap, not on the round trip. The bubble is in
        // the thread and already flying before the request has been answered.
        let departure = Date.now
        // The server decides the real journey; this is the same sum, so the
        // bubble starts flying for the right length of time straight away and
        // the answer only corrects it if we were out.
        let estimated = Double(flightEstimate?.seconds ?? Int(Self.messageFlight))
        let arrival = departure.addingTimeInterval(estimated)
        let outgoing = OutgoingMessage(id: UUID().uuidString, text: text,
                                       startedAt: departure, arrivesAt: arrival)
        draft = ""
        inFlight.append(outgoing)
        Haptics.tap()

        do {
            let created = try await api.post(
                "/messages",
                body: SendMessageRequest(body: text, recipient_id: partnerID),
                as: ChatMessage.self
            )
            // Hand the flight over to the real message and swap them in one
            // update, so the bubble never blinks out between the two.
            // Take the server's word for the arrival — it owns deliver_at.
            flights[created.id] = FlightWindow(startedAt: created.departedAt,
                                               arrivesAt: created.arrivesAt)
            if !entries.contains(where: { $0.id == "chat-\(created.id)" }) {
                entries.append(.chat(created))
            }
            inFlight.removeAll { $0.id == outgoing.id }
        } catch {
            // Hand the text back rather than swallowing it.
            inFlight.removeAll { $0.id == outgoing.id }
            draft = text
            report(error)
            Haptics.failure()
        }
    }

    /// The journey a message in the thread should show, if it has one. Only
    /// messages sent from this screen do — history is history.
    func flight(for messageID: String) -> FlightWindow? { flights[messageID] }

    func react(to message: ChatMessage, with reaction: String?) async {
        struct Body: Encodable, Sendable { let reaction: String? }
        do {
            _ = try await api.put("/messages/\(message.id)/reaction",
                                  body: Body(reaction: reaction),
                                  as: Ignored.self)
            await refresh()
            Haptics.tap()
        } catch {
            report(error)
        }
    }

    func revealSecret(_ message: ChatMessage) async {
        do {
            _ = try await api.put("/messages/\(message.id)/reveal",
                                  body: Ignored(),
                                  as: Ignored.self)
            await refresh()
            Haptics.tap()
        } catch {
            report(error)
        }
    }

    /// A scroll counts as seen once you've watched it land.
    ///
    /// Deliberately NOT `/read`: that is the web app's reading ceremony, and it
    /// deletes the scroll. Here the scroll is a bubble in a conversation and has
    /// to stay put, so `/seen` clears the badge and leaves the row alone.
    func markScrollSeen(_ scroll: ScrollMessage) async {
        guard scroll.readAt == nil, scroll.recipientID == meID, scroll.hasArrived else { return }
        guard seenScrolls.insert(scroll.id).inserted else { return }
        await api.fireAndForget("/scrolls/\(scroll.id)/seen")
    }

    private func markChatRead(_ partnerID: String) async {
        struct Body: Encodable, Sendable { let partner_id: String }
        _ = try? await api.post("/messages/mark-read",
                                body: Body(partner_id: partnerID),
                                as: Ignored.self)
        if let index = partners.firstIndex(where: { $0.id == partnerID }) {
            partners[index].unread = 0
        }
        partner?.unread = 0
    }

    private func report(_ error: Error) {
        self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }

    struct FriendRequestCount: Decodable, Sendable { let count: Int }

    /// For calls whose reply we don't read. The endpoints answer with varying
    /// shapes (an updated row here, `{ok:true}` there) and a strict decode would
    /// turn a successful call into a visible error.
    private struct Ignored: Codable, Sendable {
        init() {}
        init(from decoder: Decoder) throws {}
        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: Key.self)
            _ = container
        }
        private enum Key: CodingKey {}
    }
}
