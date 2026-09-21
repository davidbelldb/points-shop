import Observation

/// Carries a freshly-saved derby config from the admin tab back to the race
/// screen, so changing the water colour repaints the river without either
/// screen knowing the other exists.
@MainActor
@Observable
final class DerbyConfigBroadcast {
    var config: DuckyConfig?
}
