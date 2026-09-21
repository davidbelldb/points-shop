import SwiftUI
import Observation

/// Who you're connected to, who's asked, and who's left to ask.
///
/// Being an account no longer makes you reachable — the backend only lets you
/// message someone you're connected to, and a connection involving a child's
/// account needs a grown-up to agree as well.
@MainActor
@Observable
final class FriendsViewModel {
    private(set) var friends: [FriendEntry] = []
    private(set) var incoming: [FriendEntry] = []
    private(set) var outgoing: [FriendEntry] = []
    private(set) var suggestions: [FriendEntry] = []
    private(set) var isLoading = false
    var error: String?

    private let api: APIClient

    init(api: APIClient = .shared) { self.api = api }

    var requestCount: Int { incoming.count }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await api.get("/friends", as: FriendsResponse.self)
            friends = response.friends
            incoming = response.incoming
            outgoing = response.outgoing
            suggestions = response.suggestions
            error = nil
        } catch let apiError as APIError where apiError.isUnauthorised {
            // The session store handles signing out.
        } catch {
            report(error)
        }
    }

    func ask(_ person: FriendEntry) async {
        struct Body: Encodable, Sendable { let account_id: String }
        await call { try await self.api.post("/friends/requests", body: Body(account_id: person.id), as: Blank.self) }
    }

    func respond(to request: FriendEntry, accept: Bool) async {
        struct Body: Encodable, Sendable { let accept: Bool }
        guard let friendshipID = request.friendshipID else { return }
        await call {
            try await self.api.post("/friends/requests/\(friendshipID)/respond",
                                    body: Body(accept: accept), as: Blank.self)
        }
    }

    func remove(_ friend: FriendEntry) async {
        guard let friendshipID = friend.friendshipID else { return }
        await call { try await self.api.delete("/friends/\(friendshipID)", as: Blank.self) }
    }

    /// Every mutation ends the same way: do it, reload, buzz — or say why not.
    private func call(_ work: () async throws -> Blank) async {
        do {
            _ = try await work()
            await load()
            Haptics.tap()
        } catch {
            report(error)
            Haptics.failure()
        }
    }

    private func report(_ error: Error) {
        self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
    }

    /// These endpoints answer with varying shapes; none of them is read.
    struct Blank: Decodable, Sendable {
        init(from decoder: Decoder) throws {}
    }
}

// MARK: - The sheet

struct FriendsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var model = FriendsViewModel()

    var body: some View {
        NavigationStack {
            List {
                if let error = model.error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }

                if !model.incoming.isEmpty {
                    Section("Asked to connect") {
                        ForEach(model.incoming) { request in
                            PersonRow(person: request) {
                                Button("Yes") { Task { await model.respond(to: request, accept: true) } }
                                    .buttonStyle(.borderedProminent)
                                    .controlSize(.small)
                                Button("No") { Task { await model.respond(to: request, accept: false) } }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                            }
                        }
                    }
                }

                Section("Your people") {
                    if model.friends.isEmpty {
                        Text("Nobody yet.").foregroundStyle(.secondary)
                    }
                    ForEach(model.friends) { friend in
                        PersonRow(person: friend) { EmptyView() }
                            .swipeActions {
                                Button("Remove", role: .destructive) {
                                    Task { await model.remove(friend) }
                                }
                            }
                    }
                }

                if !model.outgoing.isEmpty {
                    Section("Waiting") {
                        ForEach(model.outgoing) { pending in
                            PersonRow(person: pending) {
                                Text(pending.waitingOnAnAdult ? "With a grown-up" : "Asked")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !model.suggestions.isEmpty {
                    Section {
                        ForEach(model.suggestions) { person in
                            PersonRow(person: person) {
                                Button("Ask") { Task { await model.ask(person) } }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)
                            }
                        }
                    } header: {
                        Text("Someone else")
                    } footer: {
                        Text("They have to say yes before either of you can send anything.")
                    }
                }
            }
            .navigationTitle("People")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .overlay {
                if model.isLoading && model.friends.isEmpty { ProgressView() }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .appTheme()
        .task { await model.load() }
    }
}

/// One person, with whatever action belongs beside them.
private struct PersonRow<Trailing: View>: View {
    let person: FriendEntry
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: person.photo, size: 36)

            VStack(alignment: .leading, spacing: 1) {
                Text(person.displayName).font(.body.weight(.medium))
                if let username = person.username, username != person.displayName {
                    Text("@\(username)").font(.caption).foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 8)
            trailing()
        }
        .padding(.vertical, 2)
    }
}
