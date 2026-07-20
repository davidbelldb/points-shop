import AppIntents
import Foundation
import CoreLocation

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
struct OmwDestinationQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [OmwDestinationEntity] {
        Self.loadAll().filter { identifiers.contains($0.id) }
    }
    func suggestedEntities() async throws -> [OmwDestinationEntity] { Self.loadAll() }

    // Fuzzy match on what Siri heard, so "Blinco" resolves "Blinco Grove"
    // (substring, or any word of the label starting with the spoken text).
    func entities(matching string: String) async throws -> [OmwDestinationEntity] {
        let q = string.lowercased().trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return Self.loadAll() }
        return Self.loadAll().filter { e in
            let l = e.label.lowercased()
            return l.contains(q) || l.split(separator: " ").contains { $0.hasPrefix(q) }
        }
    }

    static func loadAll() -> [OmwDestinationEntity] {
        let defaults = UserDefaults(suiteName: omwAppGroup)
        guard let raw = defaults?.array(forKey: "omw.destinations") as? [[String: String]] else { return [] }
        return raw.compactMap { d in
            guard let id = d["id"], let label = d["label"] else { return nil }
            return OmwDestinationEntity(id: id, label: label)
        }
    }
}

// Streams background location straight to the backend for a hands-free (Siri)
// trip — no webview involved. Keeping location updates active keeps the app
// alive in the background after the intent returns, so the bar advances without
// the app opening. Stops itself on arrival or once the trip is no longer active.
@available(iOS 16.0, *)
final class OmwNativeTracker: NSObject, CLLocationManagerDelegate {
    static let shared = OmwNativeTracker()
    private let manager = CLLocationManager()
    private var tripId: String?
    private var token: String?
    private var apiBase = "https://sneakypoints.com"
    private var lastPing = Date.distantPast

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 20
        manager.activityType = .otherNavigation
        manager.pausesLocationUpdatesAutomatically = false
    }

    func start(tripId: String, token: String, apiBase: String) {
        self.tripId = tripId; self.token = token; self.apiBase = apiBase
        self.lastPing = .distantPast
        if manager.authorizationStatus == .authorizedAlways {
            manager.allowsBackgroundLocationUpdates = true
        }
        manager.startUpdatingLocation()
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        tripId = nil
    }

    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last, let tripId = tripId, let token = token else { return }
        if Date().timeIntervalSince(lastPing) < 4 { return }   // throttle ~once/4s
        lastPing = Date()
        guard let url = URL(string: apiBase + "/api/omw/trips/\(tripId)/ping") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "lat": loc.coordinate.latitude, "lng": loc.coordinate.longitude,
        ])
        URLSession.shared.dataTask(with: req) { data, _, _ in
            guard let data = data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            let arrived = obj["arrived"] as? Bool ?? false
            let ok = obj["ok"] as? Bool ?? true
            if arrived || ok == false { DispatchQueue.main.async { self.stop() } }
        }.resume()
    }

    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}
}

// One-shot location fetch for use inside an App Intent (no app UI). Requires the
// app's location authorisation (Always, so it works with the app closed).
@available(iOS 16.0, *)
final class OmwOneShotLocation: NSObject, CLLocationManagerDelegate {
    private var manager: CLLocationManager?
    private var cont: CheckedContinuation<CLLocationCoordinate2D, Error>?

    func current() async throws -> CLLocationCoordinate2D {
        try await withCheckedThrowingContinuation { c in
            self.cont = c
            let m = CLLocationManager()
            m.delegate = self
            m.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
            self.manager = m
            m.requestLocation()
        }
    }
    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let c = cont else { return }
        cont = nil
        if let loc = locs.last { c.resume(returning: loc.coordinate) }
        else { c.resume(throwing: CLError(.locationUnknown)) }
    }
    func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        cont?.resume(throwing: error); cont = nil
    }
}

// Shared hands-free trip start. destId nil = the traveller's default (slot 1)
// destination, resolved server-side. Returns the phrase Siri should speak.
@available(iOS 16.0, *)
func startOmwJourney(destId: String?) async -> String {
    let defaults = UserDefaults(suiteName: omwAppGroup)
    guard let token = defaults?.string(forKey: "widgetToken") else {
        return "Open Sneaky Stuff and sign in first."
    }
    let apiBase = defaults?.string(forKey: "apiBase") ?? "https://sneakypoints.com"

    let coord: CLLocationCoordinate2D
    do { coord = try await OmwOneShotLocation().current() }
    catch { return "I couldn't get your location." }

    guard let url = URL(string: apiBase + "/api/omw/trips") else {
        return "Something went wrong starting your journey."
    }
    var body: [String: Any] = ["origin": ["lat": coord.latitude, "lng": coord.longitude]]
    if let destId = destId { body["destId"] = destId }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)

    do {
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            return "Couldn't start the journey just now."
        }
        var label: String?
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            label = obj["dest_label"] as? String
            if let tripId = obj["id"] as? String {
                await MainActor.run { OmwNativeTracker.shared.start(tripId: tripId, token: token, apiBase: apiBase) }
            }
        }
        return label.map { "On your way to \($0)." } ?? "On your way."
    } catch {
        return "Couldn't reach Sneaky Stuff."
    }
}

// "On My Way to <destination>" — pick a specific saved destination.
@available(iOS 16.0, *)
struct StartOnMyWayIntent: AppIntent {
    static var title: LocalizedStringResource = "Start On My Way"
    static var description = IntentDescription("Start an On My Way journey to a saved destination.")
    static var openAppWhenRun = false

    @Parameter(title: "Destination")
    var destination: OmwDestinationEntity

    init() {}
    init(destination: OmwDestinationEntity) { self.destination = destination }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let msg = await startOmwJourney(destId: destination.id)
        return .result(dialog: "\(msg)")
    }
}

// "On My Way" — no destination; fires the default (slot 1). This is Katie's
// one-liner ("Hey Siri, on my way" → Bishops Court), and David's default too.
@available(iOS 16.0, *)
struct StartDefaultOnMyWayIntent: AppIntent {
    static var title: LocalizedStringResource = "On My Way"
    static var description = IntentDescription("Start an On My Way journey to your default destination.")
    static var openAppWhenRun = false

    init() {}

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let msg = await startOmwJourney(destId: nil)
        return .result(dialog: "\(msg)")
    }
}

@available(iOS 16.0, *)
struct OmwShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartDefaultOnMyWayIntent(),
            phrases: [
                "On My Way with \(.applicationName)",
                "I'm on my way with \(.applicationName)",
                "\(.applicationName) on my way"
            ],
            shortTitle: "On My Way",
            systemImageName: "figure.outdoor.cycle"
        )
        AppShortcut(
            intent: StartOnMyWayIntent(),
            phrases: [
                "On My Way to \(\.$destination) with \(.applicationName)",
                "\(.applicationName) I'm on my way to \(\.$destination)"
            ],
            shortTitle: "On My Way",
            systemImageName: "figure.outdoor.cycle"
        )
    }
}
