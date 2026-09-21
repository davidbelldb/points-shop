import SwiftUI

@main
struct SneakySocialApp: App {
    @State private var session = SessionStore()
    @State private var theme = ThemeStore()
    @State private var derbyConfig = DerbyConfigBroadcast()
    @State private var features = FeatureStore()
    @State private var copy = AppCopy()
    @State private var basket = BasketStore()
    @State private var location = LocationStore()
    @State private var liveActivities = LiveActivityStore()

    init() {
        // Google Maps, if a key was built in. Without one the crow tracker
        // falls back to Apple Maps rather than failing.
        MapsKey.start()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(theme)
                .environment(derbyConfig)
                .environment(features)
                .environment(copy)
                .environment(basket)
                .environment(location)
                .environment(liveActivities)
                .preferredColorScheme(theme.colorScheme)
                .task { await session.bootstrap() }
        }
    }
}
