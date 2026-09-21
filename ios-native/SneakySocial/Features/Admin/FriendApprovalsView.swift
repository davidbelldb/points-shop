import SwiftUI

/// Friendships involving a child's account, waiting on a grown-up.
///
/// NOT CURRENTLY REACHABLE. Admin sign-off is switched off
/// (`KIDS_FRIENDSHIPS_NEED_ADMIN` in `backend/src/modules/friends/friends.repo.js`),
/// so nothing ever reaches `awaiting_approval` and this screen would always be
/// empty. It is kept wired to its endpoints so switching the constant back on
/// only needs a link adding to AdminHomeView.
///
/// The other person has already said yes; this is the second signature. Until
/// it's given, the two accounts can't message each other at all — the backend
/// treats them as strangers.
struct FriendApprovalsView: View {
    @State private var approvals: [FriendApproval] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }

            if approvals.isEmpty && !isLoading {
                ContentUnavailableView("Nothing waiting",
                                       systemImage: "checkmark.seal",
                                       description: Text("No connections need signing off."))
            }

            ForEach(approvals) { approval in
                VStack(alignment: .leading, spacing: 8) {
                    Text(approval.pairDescription).font(.body.weight(.medium))

                    if let requestedAt = approval.requestedAt {
                        Text(requestedAt, format: .relative(presentation: .named))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 10) {
                        Button("Allow") { Task { await decide(approval, approve: true) } }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                        Button("Refuse") { Task { await decide(approval, approve: false) } }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Connections")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { if isLoading && approvals.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            approvals = try await APIClient.shared
                .get("/friends/approvals", as: FriendApprovalsResponse.self).approvals
            error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func decide(_ approval: FriendApproval, approve: Bool) async {
        struct Body: Encodable, Sendable { let approve: Bool }
        struct Blank: Decodable, Sendable { init(from decoder: Decoder) throws {} }
        do {
            _ = try await APIClient.shared.post("/friends/approvals/\(approval.id)",
                                                body: Body(approve: approve), as: Blank.self)
            Haptics.tap()
            await load()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failure()
        }
    }
}
