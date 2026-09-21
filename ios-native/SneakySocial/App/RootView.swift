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
    @Environment(FeatureStore.self) private var features
    @Environment(AppCopy.self) private var copy
    @Environment(LocationStore.self) private var location
    @Environment(LiveActivityStore.self) private var liveActivities
    @State private var selection: TabSelection = .home

    /// Deliberately not `Tab` or `Section` — both are SwiftUI types used below.
    enum TabSelection: Hashable {
        case home, games, messages, portals, admin
    }

    var body: some View {
        // Tabs follow what the account may actually reach. The backend is the
        // real boundary — this just avoids offering a tab that would 404.
        TabView(selection: $selection) {
            if features.has(.shop) {
                Tab("Home", systemImage: "house.fill", value: TabSelection.home) {
                    NavigationStack { ShopView() }
                }
            }
            // Games is its own hub now — the derby lives inside it, and
            // anything else playable joins it there.
            if features.has(.duckyDerby) || features.has(.shutTheBox) {
                Tab("Games", systemImage: "gamecontroller.fill", value: TabSelection.games) {
                    NavigationStack { GamesHubView() }
                }
            }
            if features.has(.messaging) {
                Tab("Messages", systemImage: "scroll.fill", value: TabSelection.messages) {
                    NavigationStack { MessagesView() }
                }
            }
            Tab("Portals", systemImage: "circle.hexagongrid.fill", value: TabSelection.portals) {
                NavigationStack { PortalsView() }
            }
            // Admin-only: for anyone else this tab is never built, and every
            // endpoint behind it re-checks the role server-side anyway.
            if session.account?.isAdmin == true {
                Tab("Admin", systemImage: "wrench.and.screwdriver", value: TabSelection.admin) {
                    NavigationStack { AdminHomeView() }
                }
            }
        }
        .task {
            await features.load()
            await copy.load()

            // Everything here travels by crow, and a crow needs somewhere to
            // leave from — so the location is asked for once, on opening,
            // rather than being something to discover later in a thread.
            // Already set means nothing happens; declined means the thread
            // still offers the button.
            // Registering the push-to-start token only means anything once
            // we're signed in, which by here we are.
            liveActivities.start()

            await location.load()
            if !location.place.isSet {
                await location.useCurrentLocation()
            }
        }
    }
}
