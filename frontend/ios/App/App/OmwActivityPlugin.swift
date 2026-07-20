import Foundation
import UIKit
import Capacitor
import ActivityKit
import CoreLocation

/// Bridges the "On My Way" Live Activity + background location to the web layer.
///
/// JS usage (see frontend/src/lib/omwActivity.js):
///   OmwActivity.enablePush()                               // ship push tokens
///   OmwActivity.startTracking({ tripId, destLat, destLng }) // begin bg location
///   OmwActivity.stopTracking()                             // stop location
///
/// The activity itself is push-to-STARTED by the server (works app-closed); this
/// plugin's jobs are (1) forward the ActivityKit push tokens, and (2) stream the
/// device's location so the server can advance progress. Location updates are
/// emitted as `omwPing` events; the web layer POSTs them to the trip.
///
/// Auto-registered by Capacitor via CAPBridgedPlugin.
@objc(OmwActivityPlugin)
public class OmwActivityPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "OmwActivityPlugin"
    public let jsName = "OmwActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enablePush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setShortcuts", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Home-screen quick actions (one per destination)

    /// Replace the app's dynamic Home-screen shortcut items with one per OMW
    /// destination ("On My Way → {label}"). Each routes to /omw/go?dest=<id>,
    /// which the web layer fires as a journey (see App.jsx / omwActivity.js).
    /// call: OmwActivity.setShortcuts({ items: [{ id, label }] })
    @objc func setShortcuts(_ call: CAPPluginCall) {
        let items = call.getArray("items", [String: Any].self) ?? []
        let shortcuts: [UIApplicationShortcutItem] = items.compactMap { item in
            guard let id = item["id"] as? String,
                  let label = item["label"] as? String else { return nil }
            return UIApplicationShortcutItem(
                type: "com.david.sneakystuff.omw.go",
                localizedTitle: "On My Way",
                localizedSubtitle: label,
                icon: UIApplicationShortcutIcon(type: .location),
                userInfo: ["url": "/omw/go?dest=\(id)" as NSString])
        }
        DispatchQueue.main.async {
            UIApplication.shared.shortcutItems = shortcuts
            call.resolve()
        }
    }

    private lazy var locationManager: CLLocationManager = {
        let m = CLLocationManager()
        m.delegate = self
        m.desiredAccuracy = kCLLocationAccuracyBest
        m.activityType = .fitness            // cycling / walking journeys
        m.distanceFilter = 15                // metres between updates — enough for the bar
        m.pausesLocationUpdatesAutomatically = false
        return m
    }()

    private var tracking = false

    // MARK: - Push tokens

    @objc func enablePush(_ call: CAPPluginCall) {
        if #available(iOS 17.2, *) {
            Task {
                for await data in Activity<OmwActivityAttributes>.pushToStartTokenUpdates {
                    let hex = data.map { String(format: "%02x", $0) }.joined()
                    self.notifyListeners("omwPtsToken", data: ["token": hex])
                }
            }
        }
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<OmwActivityAttributes>.activities {
                    self.trackUpdateToken(activity)
                }
                for await activity in Activity<OmwActivityAttributes>.activityUpdates {
                    self.trackUpdateToken(activity)
                }
            }
        }
        call.resolve()
    }

    @available(iOS 16.2, *)
    private func trackUpdateToken(_ activity: Activity<OmwActivityAttributes>) {
        let tripId = activity.attributes.tripId
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                self.notifyListeners("omwUpdateToken", data: ["tripId": tripId, "token": hex])
            }
        }
    }

    // MARK: - Location tracking

    @objc func startTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let mgr = self.locationManager
            // Always-authorization is what allows updates while the app is
            // backgrounded/closed. Request it lazily on first trip.
            let status = CLLocationManager().authorizationStatus
            if status == .notDetermined {
                mgr.requestAlwaysAuthorization()
            }
            // Only legal to set once we (may) have the always grant.
            if status == .authorizedAlways {
                mgr.allowsBackgroundLocationUpdates = true
            }
            mgr.startUpdatingLocation()
            self.tracking = true
            call.resolve()
        }
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.locationManager.stopUpdatingLocation()
            self.locationManager.allowsBackgroundLocationUpdates = false
            self.tracking = false
            call.resolve()
        }
    }

    // Once the user upgrades to "Always", enable background updates so the trip
    // keeps advancing with the app closed.
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedAlways && tracking {
            manager.allowsBackgroundLocationUpdates = true
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard tracking, let loc = locations.last else { return }
        notifyListeners("omwPing", data: [
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
        ])
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Non-fatal — the foreground watchPosition fallback still drives progress.
    }
}
