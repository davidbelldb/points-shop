import SwiftUI
import MapKit
#if canImport(GoogleMaps)
import GoogleMaps
#endif

/// The crow's route on a map — the Marauder's Map, as the web tracker draws it:
/// parchment land, oxblood route, cream roads, and the crow flapping along the
/// line between two points.
///
/// Google Maps when a key is configured, Apple Maps when it isn't. A missing
/// key is a setup step, not a crash, so the sheet still works either way.
struct CrowMapView: View {
    let flight: CrowFlight
    /// 0…1 along the route, recomputed by the sheet every second.
    let progress: Double

    var body: some View {
        #if canImport(GoogleMaps)
        if MapsKey.isConfigured {
            GoogleCrowMap(flight: flight, progress: progress)
        } else {
            AppleCrowMap(flight: flight, progress: progress)
        }
        #else
        AppleCrowMap(flight: flight, progress: progress)
        #endif
    }

    /// Straight-line interpolation, matching how the server describes the
    /// journey: as the crow flies, no roads.
    static func position(_ flight: CrowFlight, progress: Double) -> CLLocationCoordinate2D {
        guard !flight.arrived else {
            return .init(latitude: flight.destLat, longitude: flight.destLng)
        }
        let fraction = max(0, min(1, progress))
        return .init(
            latitude: flight.originLat + (flight.destLat - flight.originLat) * fraction,
            longitude: flight.originLng + (flight.destLng - flight.originLng) * fraction
        )
    }
}

/// Whether a Maps SDK key was built in.
enum MapsKey {
    static var value: String {
        (Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    static var isConfigured: Bool { !value.isEmpty }

    /// Called once at launch. Silently does nothing without a key.
    static func start() {
        #if canImport(GoogleMaps)
        guard isConfigured else { return }
        GMSServices.provideAPIKey(value)
        #endif
    }
}

// MARK: - Google

#if canImport(GoogleMaps)
struct GoogleCrowMap: UIViewRepresentable {
    let flight: CrowFlight
    let progress: Double

    /// Oxblood route and destination node, as the web tracker uses.
    private static let route = UIColor(Palette.oxblood)

    func makeUIView(context: Context) -> GMSMapView {
        let options = GMSMapViewOptions()
        options.camera = GMSCameraPosition(latitude: flight.originLat,
                                           longitude: flight.originLng, zoom: 13)
        let map = GMSMapView(options: options)
        map.isBuildingsEnabled = false
        map.isIndoorEnabled = false
        map.settings.rotateGestures = false
        map.settings.tiltGestures = false
        // Painted under the tiles so there's no grey flash before they load.
        map.backgroundColor = UIColor(Palette.parchment)

        if let url = Bundle.main.url(forResource: "marauders-map", withExtension: "json"),
           let style = try? GMSMapStyle(contentsOfFileURL: url) {
            map.mapStyle = style
        }

        context.coordinator.build(on: map, flight: flight)
        context.coordinator.fit(map, flight: flight)
        return map
    }

    func updateUIView(_ map: GMSMapView, context: Context) {
        context.coordinator.moveCrow(on: map, flight: flight, progress: progress)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        private var crow: GMSMarker?
        private var frame = 0
        private var lastFlap = Date.distantPast

        func build(on map: GMSMapView, flight: CrowFlight) {
            let origin = CLLocationCoordinate2D(latitude: flight.originLat, longitude: flight.originLng)
            let dest = CLLocationCoordinate2D(latitude: flight.destLat, longitude: flight.destLng)

            let path = GMSMutablePath()
            path.add(origin)
            path.add(dest)
            let line = GMSPolyline(path: path)
            line.strokeColor = GoogleCrowMap.route.withAlphaComponent(0.95)
            line.strokeWidth = 6
            line.map = map

            let start = GMSMarker(position: origin)
            start.icon = dot(fill: UIColor(Palette.parchment), ring: GoogleCrowMap.route)
            start.groundAnchor = CGPoint(x: 0.5, y: 0.5)
            start.map = map

            let end = GMSMarker(position: dest)
            end.icon = dot(fill: GoogleCrowMap.route, ring: .white)
            end.groundAnchor = CGPoint(x: 0.5, y: 0.5)
            end.map = map

            let bird = GMSMarker(position: origin)
            bird.icon = sprite(flight.arrived ? "crow_land_10" : "crow_send_03")
            bird.groundAnchor = CGPoint(x: 0.5, y: 0.5)
            bird.zIndex = 10
            bird.map = map
            crow = bird
        }

        /// Moves the crow along the line, alternating the two wing poses so it
        /// reads as flying rather than sliding.
        func moveCrow(on map: GMSMapView, flight: CrowFlight, progress: Double) {
            guard let crow else { return }
            crow.position = CrowMapView.position(flight, progress: progress)

            guard !flight.arrived else {
                crow.icon = sprite("crow_land_10")
                return
            }
            if Date.now.timeIntervalSince(lastFlap) > 0.28 {
                lastFlap = .now
                frame = 1 - frame
                crow.icon = sprite(frame == 0 ? "crow_send_03" : "crow_send_04")
            }
        }

        /// Both ends on screen, with room around them.
        func fit(_ map: GMSMapView, flight: CrowFlight) {
            let bounds = GMSCoordinateBounds(
                coordinate: .init(latitude: flight.originLat, longitude: flight.originLng),
                coordinate: .init(latitude: flight.destLat, longitude: flight.destLng))
            map.moveCamera(GMSCameraUpdate.fit(bounds, withPadding: 60))
            // Two people in the same postcode would otherwise zoom to the roof.
            if map.camera.zoom > 16 {
                map.moveCamera(GMSCameraUpdate.zoom(to: 16))
            }
        }

        private func sprite(_ name: String) -> UIImage? {
            guard let image = UIImage(named: name) ?? bundled(name) else { return nil }
            let side: CGFloat = 38
            let size = CGSize(width: side, height: side * (image.size.height / max(image.size.width, 1)))
            return UIGraphicsImageRenderer(size: size).image { _ in
                image.draw(in: CGRect(origin: .zero, size: size))
            }
        }

        /// The crow art is loose files in the bundle, not asset-catalog entries.
        private func bundled(_ name: String) -> UIImage? {
            guard let url = Bundle.main.url(forResource: name, withExtension: "png"),
                  let data = try? Data(contentsOf: url) else { return nil }
            return UIImage(data: data)
        }

        private func dot(fill: UIColor, ring: UIColor) -> UIImage {
            let size = CGSize(width: 18, height: 18)
            return UIGraphicsImageRenderer(size: size).image { ctx in
                let rect = CGRect(origin: .zero, size: size).insetBy(dx: 2, dy: 2)
                ctx.cgContext.setFillColor(fill.cgColor)
                ctx.cgContext.fillEllipse(in: rect)
                ctx.cgContext.setStrokeColor(ring.cgColor)
                ctx.cgContext.setLineWidth(2.5)
                ctx.cgContext.strokeEllipse(in: rect)
            }
        }
    }
}
#endif

// MARK: - Apple, for when there's no key

struct AppleCrowMap: View {
    let flight: CrowFlight
    let progress: Double

    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $camera, interactionModes: [.pan, .zoom]) {
            MapPolyline(coordinates: [
                .init(latitude: flight.originLat, longitude: flight.originLng),
                .init(latitude: flight.destLat, longitude: flight.destLng),
            ])
            .stroke(Palette.oxblood, style: StrokeStyle(lineWidth: 5, lineCap: .round))

            Annotation(flight.originLabel ?? "Sent from",
                       coordinate: .init(latitude: flight.originLat, longitude: flight.originLng)) {
                Circle().fill(Palette.parchment).stroke(Palette.oxblood, lineWidth: 2)
                    .frame(width: 12, height: 12)
            }

            Annotation(flight.destLabel ?? "Heading for",
                       coordinate: .init(latitude: flight.destLat, longitude: flight.destLng)) {
                Image(systemName: "mappin.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Palette.oxblood)
                    .background(Circle().fill(Palette.parchment).padding(3))
            }

            Annotation("The crow", coordinate: CrowMapView.position(flight, progress: progress)) {
                CrowSprite(name: flight.arrived ? CrowArt.right : CrowArt.mover, size: 34)
                    .shadow(radius: 3)
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .onAppear(perform: fit)
    }

    private func fit() {
        let midLat = (flight.originLat + flight.destLat) / 2
        let midLng = (flight.originLng + flight.destLng) / 2
        camera = .region(MKCoordinateRegion(
            center: .init(latitude: midLat, longitude: midLng),
            span: MKCoordinateSpan(
                latitudeDelta: max(abs(flight.originLat - flight.destLat) * 1.8, 0.02),
                longitudeDelta: max(abs(flight.originLng - flight.destLng) * 1.8, 0.02))))
    }
}
