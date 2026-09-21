import SwiftUI

@main
struct SneakySocialApp: App {
    @State private var session = SessionStore()
    @State private var theme = ThemeStore()
    @State private var derbyConfig = DerbyConfigBroadcast()
    @State private var features = FeatureStore()
    @State private var copy = AppCopy()
    @State private var basket = BasketStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(theme)
                .environment(derbyConfig)
                .environment(features)
                .environment(copy)
                .environment(basket)
                .preferredColorScheme(theme.colorScheme)
                .task { await session.bootstrap() }
        }
    }
}
