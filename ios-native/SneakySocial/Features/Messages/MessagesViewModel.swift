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
    }

    /// One pass: chat and scrolls together, merged and sorted.
    func refresh(showSpinner: Bool = false) async {
        guard let partnerID = partner?.id else { return }
        if showSpinner { isLoading = true }
        defer { if showSpinner { isLoading = false } }

        do {
            async let chat = api.get("/messages?with=\(partnerID)", as: ChatThreadResponse.self)
            async let scrolls = api.get("/scrolls/thread?with=\(partnerID)", as: ScrollThreadResponse.self)
            let (chatThread, scrollThread) = try await (chat, scrolls)

            // The conversation may have been closed between the call going out
            // and the reply landing — don't paint someone else's thread.
            guard partner?.id == partnerID else { return }

            var merged: [ThreadEntry] = chatThread.messages.map(ThreadEntry.chat)
            merged.append(contentsOf: scrollThread.scrolls.map(ThreadEntry.scroll))
            merged.sort { $0.sortDate < $1.sortDate }
            entries = merged

            error = nil
            await markChatRead(partnerID)
        } catch let apiError as APIError where apiError.isUnauthorised {
            // As above — nothing useful to say here.
        } catch {
            report(error)
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

        draft = ""
        do {
            _ = try await api.post(
                "/messages",
                body: SendMessageRequest(body: text, recipient_id: partnerID),
                as: Ignored.self
            )
            await refresh()
            Haptics.tap()
        } catch {
            // Hand the text back rather than swallowing it.
            draft = text
            report(error)
            Haptics.failure()
        }
    }

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
