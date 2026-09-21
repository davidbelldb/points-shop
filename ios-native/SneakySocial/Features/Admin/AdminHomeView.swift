import SwiftUI

/// The admin plane. This whole tab only exists for an admin account — the tab
/// itself is never built otherwise, and every endpoint behind it re-checks
/// `actual_role` server-side regardless.
struct AdminHomeView: View {
    @Environment(SessionStore.self) private var session
    @Environment(DerbyConfigBroadcast.self) private var derbyConfig
    @State private var showingAccount = false

    var body: some View {
        List {
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
        .sheet(isPresented: $showingAccount) { AccountSheet() }
        .navigationTitle("Admin")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { AppIconBadge() }
                .sharedBackgroundVisibility(.hidden)
            ToolbarItem(placement: .topBarTrailing) {
                PointsPill(onTapAvatar: { showingAccount = true })
            }
            .sharedBackgroundVisibility(.hidden)
        }
    }
}
