import AppIntents
import Foundation

/// Siri / Shortcuts support for "On My Way".
///
/// The traveller's saved destinations are mirrored into the shared App Group by
/// OmwActivityPlugin (key "omw.destinations"). This intent lets Siri start a
/// journey to one of them; each destination becomes a spoken option, and the
/// user can also assign their own custom phrase per destination in the Shortcuts
/// app. Running the intent opens the app and hands the chosen destination to the
/// web layer via the App Group ("omw.pendingTrigger"), which fires the journey
/// (see omwActivity.js → consumeOmwPendingTrigger).
///
/// IMPORTANT: add this file to the **App** target only. No capability/entitlement
/// is needed — Xcode extracts the App Intents metadata automatically at build.

private let omwAppGroup = "group.com.david.sneakystuff"

// A saved OMW destination, surfaced to Siri / Shortcuts.
@available(iOS 16.0, *)
struct OmwDestinationEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "On My Way Destination")
    static var defaultQuery = OmwDestinationQuery()

    var id: String
    var label: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(label)") }
}

@available(iOS 16.0, *)
struct OmwDestinationQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [OmwDestinationEntity] {
        Self.loadAll().filter { identifiers.contains($0.id) }
    }
    func suggestedEntities() async throws -> [OmwDestinationEntity] { Self.loadAll() }

    static func loadAll() -> [OmwDestinationEntity] {
        let defaults = UserDefaults(suiteName: omwAppGroup)
        guard let raw = defaults?.array(forKey: "omw.destinations") as? [[String: String]] else { return [] }
        return raw.compactMap { d in
            guard let id = d["id"], let label = d["label"] else { return nil }
            return OmwDestinationEntity(id: id, label: label)
        }
    }
}

@available(iOS 16.0, *)
struct StartOnMyWayIntent: AppIntent {
    static var title: LocalizedStringResource = "Start On My Way"
    static var description = IntentDescription("Start an On My Way journey to a saved destination.")
    // Journeys need the app foreground (location + live activity), so open it.
    static var openAppWhenRun = true

    @Parameter(title: "Destination")
    var destination: OmwDestinationEntity

    init() {}
    init(destination: OmwDestinationEntity) { self.destination = destination }

    @MainActor
    func perform() async throws -> some IntentResult {
        // Hand the choice to the web layer; the app fires it once foregrounded.
        UserDefaults(suiteName: omwAppGroup)?.set(destination.id, forKey: "omw.pendingTrigger")
        return .result()
    }
}

@available(iOS 16.0, *)
struct OmwShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartOnMyWayIntent(),
            phrases: [
                "On My Way with \(.applicationName)",
                "Start On My Way in \(.applicationName)",
                "\(.applicationName) I'm on my way to \(\.$destination)",
                "On My Way to \(\.$destination) with \(.applicationName)"
            ],
            shortTitle: "On My Way",
            systemImageName: "figure.outdoor.cycle"
        )
    }
}
