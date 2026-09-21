import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        switch session.state {
        case .loading:
            LaunchView()
        case .signedOut:
            LoginView()
        case .signedIn:
            MainTabView()
        }
    }
}

private struct LaunchView: View {
    var body: some View {
        ZStack {
            Color(hex: "#1f1f1e").ignoresSafeArea()
            ProgressView()
                .controlSize(.large)
                .tint(.white)
        }
    }
}

struct MainTabView: View {
    @Environment(SessionStore.self) private var session
    @State private var selection: TabSelection = .messages

    /// Deliberately not `Tab` or `Section` — both are SwiftUI types used below.
    enum TabSelection: Hashable {
        case derby, crow, messages, admin
    }

    var body: some View {
        TabView(selection: $selection) {
            Tab("Derby", systemImage: "flag.checkered", value: TabSelection.derby) {
                NavigationStack { DerbyView() }
            }
            Tab("Crow", systemImage: "map", value: TabSelection.crow) {
                NavigationStack { CrowPlaceholderView() }
            }
            Tab("Messages", systemImage: "bubble.left.and.bubble.right", value: TabSelection.messages) {
                NavigationStack { MessagesPlaceholderView() }
            }
            // Admin-only: for anyone else this tab is never built, and every
            // endpoint behind it re-checks the role server-side anyway.
            if session.account?.isAdmin == true {
                Tab("Admin", systemImage: "wrench.and.screwdriver", value: TabSelection.admin) {
                    NavigationStack { AdminHomeView() }
                }
            }
        }
    }
}

/// The points figure that sits in every feature's navigation bar.
struct PointsBadge: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        Text("\(session.pointsBalance) pts")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.points)
            .contentTransition(.numericText())
            .animation(.snappy, value: session.pointsBalance)
    }
}
