import SwiftUI

@main
struct SneakySocialApp: App {
    @State private var session = SessionStore()
    @State private var theme = ThemeStore()
    @State private var derbyConfig = DerbyConfigBroadcast()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(theme)
                .environment(derbyConfig)
                .preferredColorScheme(theme.colorScheme)
                .task { await session.bootstrap() }
        }
    }
}
