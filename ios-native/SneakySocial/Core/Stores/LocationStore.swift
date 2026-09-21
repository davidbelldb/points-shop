import Foundation
import Observation
import CoreLocation
import MapKit

/// Where you're sending from.
///
/// A message's crow has to fly the distance between two people, so it needs to
/// know where they both are. This asks the device once, turns the coordinates
/// into a place name, and tells the server — after which it holds until you
/// move somewhere else and set it again.
@MainActor
@Observable
final class LocationStore: NSObject, CLLocationManagerDelegate {
    struct Place: Codable, Sendable, Equatable {
        var lat: Double?
        var lng: Double?
        var label: String?
        var setAt: Date?

        var isSet: Bool { lat != nil && lng != nil }
        var name: String { label ?? "Somewhere" }

        private enum CodingKeys: String, CodingKey {
            case lat, lng, label
            case setAt = "set_at"
        }
    }

    private(set) var place = Place()
    private(set) var isWorking = false
    var error: String?

    private let api: APIClient
    private let manager = CLLocationManager()
    /// Resumed once CoreLocation answers — the delegate callbacks are the only
    /// way it will talk to us.
    private var waiting: CheckedContinuation<CLLocation, Error>?
    /// Separate, because the permission answer and the fix are two different
    /// conversations and the first has to finish before the second starts.
    private var waitingOnPermission: CheckedContinuation<CLAuthorizationStatus, Never>?
    /// `locationUnknown` means "not yet", not "no" — worth one more ask.
    private var hasRetried = false

    init(api: APIClient = .shared) {
        self.api = api
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// What the server currently has for us.
    func load() async {
        place = (try? await api.get("/account/location", as: Place.self)) ?? Place()
    }

    /// The one-tap path: ask the device, name the spot, save it.
    func useCurrentLocation() async {
        guard !isWorking else { return }
        isWorking = true
        error = nil
        defer { isWorking = false }

        do {
            let fix = try await currentFix()
            let label = await placeName(for: fix)
            try await save(lat: fix.coordinate.latitude,
                           lng: fix.coordinate.longitude,
                           label: label)
            Haptics.success()
        } catch let locationError as LocationError {
            error = locationError.message
            Haptics.failure()
            return
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            Haptics.failure()
        }
    }

    func forget() async {
        struct Body: Encodable, Sendable { let lat: Double?; let lng: Double? }
        place = (try? await api.put("/account/location",
                                    body: Body(lat: nil, lng: nil),
                                    as: Place.self)) ?? Place()
    }

    private func save(lat: Double, lng: Double, label: String?) async throws {
        struct Body: Encodable, Sendable {
            let lat: Double
            let lng: Double
            let label: String?
        }
        place = try await api.put("/account/location",
                                  body: Body(lat: lat, lng: lng, label: label),
                                  as: Place.self)
    }

    // MARK: - CoreLocation

    enum LocationError: Error {
        case denied
        case dismissed
        case unavailable

        var message: String {
            switch self {
            case .denied:
                "Location is turned off for this app. Settings → Sneaky Social → Location."
            case .dismissed:
                "Tap Set again and allow location so crows know how far to fly."
            case .unavailable:
                "Couldn't get a fix just now — try again in a moment."
            }
        }
    }

    private func currentFix() async throws -> CLLocation {
        // Asking for a fix while the permission sheet is still on screen fails
        // immediately — the answer has to come back first.
        var status = manager.authorizationStatus
        if status == .notDetermined {
            status = await withCheckedContinuation { continuation in
                waitingOnPermission = continuation
                manager.requestWhenInUseAuthorization()
            }
        }

        switch status {
        case .denied, .restricted: throw LocationError.denied
        case .notDetermined: throw LocationError.dismissed
        default: break
        }

        hasRetried = false
        return try await withCheckedThrowingContinuation { continuation in
            waiting = continuation
            manager.requestLocation()
        }
    }

    /// A coordinate is no use to a person; "Cambridge" is.
    ///
    /// MapKit rather than CLGeocoder — the latter is gone as of iOS 26. A
    /// failed lookup is not a failed save: the location is still worth storing
    /// without a name, since the distance is what the crow actually needs.
    private func placeName(for location: CLLocation) async -> String? {
        guard let request = MKReverseGeocodingRequest(location: location) else { return nil }
        let items = try? await request.mapItems
        return items?.first?.name
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let fix = locations.last else { return }
        Task { @MainActor in
            waiting?.resume(returning: fix)
            waiting = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let isTransient = (error as? CLError)?.code == .locationUnknown
        Task { @MainActor in
            // "Location unknown" is the device saying it hasn't got one YET.
            if isTransient, !hasRetried, waiting != nil {
                hasRetried = true
                self.manager.requestLocation()
                return
            }
            waiting?.resume(throwing: LocationError.unavailable)
            waiting = nil
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            // The answer to the permission sheet, if that's what we're waiting on.
            if let pending = waitingOnPermission {
                waitingOnPermission = nil
                pending.resume(returning: status)
                return
            }
            // Otherwise: permission pulled out from under an in-flight request.
            guard status == .denied || status == .restricted else { return }
            waiting?.resume(throwing: LocationError.denied)
            waiting = nil
        }
    }
}
