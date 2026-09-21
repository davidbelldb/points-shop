import Foundation
import Observation
import CoreLocation

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
        case unavailable

        var message: String {
            switch self {
            case .denied:
                "Location is turned off for this app. Settings → Sneaky Social → Location."
            case .unavailable:
                "Couldn't work out where you are just now."
            }
        }
    }

    private func currentFix() async throws -> CLLocation {
        switch manager.authorizationStatus {
        case .denied, .restricted:
            throw LocationError.denied
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        default:
            break
        }

        return try await withCheckedThrowingContinuation { continuation in
            waiting = continuation
            manager.requestLocation()
        }
    }

    /// A coordinate is no use to a person; "Cambridge" is.
    private func placeName(for location: CLLocation) async -> String? {
        let marks = try? await CLGeocoder().reverseGeocodeLocation(location)
        guard let mark = marks?.first else { return nil }
        return mark.locality
            ?? mark.subLocality
            ?? mark.name
            ?? mark.administrativeArea
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let fix = locations.last else { return }
        Task { @MainActor in
            waiting?.resume(returning: fix)
            waiting = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            waiting?.resume(throwing: LocationError.unavailable)
            waiting = nil
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        guard status == .denied || status == .restricted else { return }
        Task { @MainActor in
            waiting?.resume(throwing: LocationError.denied)
            waiting = nil
        }
    }
}
