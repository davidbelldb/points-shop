import SwiftUI

/// The admin plane. This whole tab only exists for an admin account — the tab
/// itself is never built otherwise, and every endpoint behind it re-checks
/// `actual_role` server-side regardless.
struct AdminHomeView: View {
    @Environment(SessionStore.self) private var session
    @Environment(DerbyConfigBroadcast.self) private var derbyConfig

    var body: some View {
        List {
            PageHeading(title: "Admin")
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(.init(top: 4, leading: 4, bottom: 8, trailing: 4))

            Section {
                LabeledContent("Signed in as", value: session.account?.displayName ?? "—")
                LabeledContent("Username", value: session.account?.actualUsername ?? session.account?.username ?? "—")
                if session.account?.impersonating == true {
                    LabeledContent("Viewing as", value: session.account?.username ?? "—")
                        .foregroundStyle(.orange)
                }
            } header: {
                Text("Account")
            }

            Section {
                NavigationLink {
                    DerbyAdminView(config: derbyConfig.config) { updated in
                        derbyConfig.config = updated
                    }
                } label: {
                    Label("Ducky Derby", systemImage: "flag.checkered")
                }
            } header: {
                Text("Games")
            } footer: {
                Text("Colours, odds, the field, banners and every line of commentary.")
            }

            Section {
                NavigationLink {
                    FriendApprovalsView()
                } label: {
                    Label("Connections", systemImage: "person.2.badge.key")
                }
            } header: {
                Text("People")
            } footer: {
                Text("A connection involving a child's account needs your say-so before either of them can message the other.")
            }

            Section {
                Label("Crow & scrolls", systemImage: "bird")
                    .foregroundStyle(.tertiary)
                Label("Messages", systemImage: "bubble.left.and.bubble.right")
                    .foregroundStyle(.tertiary)
            } header: {
                Text("Not ported yet")
            } footer: {
                Text("These arrive with phases 3 and 4. Use the web admin for them in the meantime.")
            }

        }
        .appTopBar()
    }
}
