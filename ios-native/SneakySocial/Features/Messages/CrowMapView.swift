import SwiftUI
import MapKit
#if canImport(GoogleMaps)
import GoogleMaps
import QuartzCore
#endif

/// The crow's route on a map, in the same dark styling the On My Way map uses:
/// near-black land, dim roads, no points of interest, and the crow flapping
/// along the line between two points.
///
/// Google Maps when a key is configured, Apple Maps when it isn't. A missing
/// key is a setup step, not a crash, so the sheet still works either way.
struct CrowMapView: View {
    let flight: CrowFlight
    /// 0…1 along the route, recomputed by the sheet every second.
    let progress: Double
    /// Tapping a crow that has landed takes you back to what it delivered.
    var onTapCrow: () -> Void = {}

    var body: some View {
        #if canImport(GoogleMaps)
        if MapsKey.isConfigured {
            GoogleCrowMap(flight: flight, progress: progress, onTapCrow: onTapCrow)
        } else {
            AppleCrowMap(flight: flight, progress: progress, onTapCrow: onTapCrow)
        }
        #else
        AppleCrowMap(flight: flight, progress: progress, onTapCrow: onTapCrow)
        #endif
    }

    /// Where the crow is right now, from the flight's own clock. Used to place
    /// the marker correctly the instant it's created.
    static func liveProgress(_ flight: CrowFlight) -> Double {
        guard !flight.arrived else { return 1 }
        let total = flight.arrivesAt.timeIntervalSince(flight.startedAt)
        guard total > 0 else { return 1 }
        return max(0, min(1, Date.now.timeIntervalSince(flight.startedAt) / total))
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

/// Holds the map and reports its size the moment the size is real.
///
/// `UIViewRepresentable` gives no resize callback — `updateUIView` fires when
/// SwiftUI's state changes, which is not the same thing as the view having been
/// laid out. The drawer animates from nothing to half height to full, and a
/// camera fitted against any of the in-between frames is a camera on nowhere.
/// A plain container makes `layoutSubviews` the trigger instead, which is the
/// one callback that only ever runs with a real size.
final class CrowMapContainer: UIView {
    let map: GMSMapView
    /// Called on each genuine size change, never for the same size twice.
    var onLayout: (@MainActor (CGSize) -> Void)?
    private var lastSize: CGSize = .zero

    init(map: GMSMapView) {
        self.map = map
        super.init(frame: .zero)
        addSubview(map)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        map.frame = bounds
        guard bounds.size != lastSize else { return }
        lastSize = bounds.size
        let size = bounds.size
        // One turn later, so the map has taken the new frame before it's asked
        // to fit a route into it. If another layout beat us to it the size has
        // already moved on and that pass will do the framing instead.
        Task { @MainActor [weak self] in
            guard let self, self.bounds.size == size else { return }
            self.onLayout?(size)
        }
    }
}

struct GoogleCrowMap: UIViewRepresentable {
    let flight: CrowFlight
    let progress: Double
    var onTapCrow: () -> Void = {}


    func makeUIView(context: Context) -> CrowMapContainer {
        let options = GMSMapViewOptions()
        options.camera = GMSCameraPosition(latitude: flight.originLat,
                                           longitude: flight.originLng, zoom: 13)
        let map = GMSMapView(options: options)
        map.delegate = context.coordinator
        map.isBuildingsEnabled = false
        map.isIndoorEnabled = false
        map.settings.rotateGestures = false
        map.settings.tiltGestures = false
        // Painted under the tiles so there's no grey flash before they load.
        map.backgroundColor = UIColor(Palette.mapBackground)

        if let url = Bundle.main.url(forResource: "omw-dark-map", withExtension: "json"),
           let style = try? GMSMapStyle(contentsOfFileURL: url) {
            map.mapStyle = style
        }

        context.coordinator.build(on: map, flight: flight)

        // The framing is driven by layout, not by SwiftUI's update cycle. A
        // landed crow's progress never changes, so `updateUIView` stops being
        // called; and while the drawer is animating open the map is a few
        // points tall, where `fit` has less room than its own padding and
        // returns a camera on nothing. Only `layoutSubviews` knows the size is
        // real — and it fires again when the drawer goes half → full, which is
        // exactly when the route wants re-framing anyway.
        let container = CrowMapContainer(map: map)
        let coordinator = context.coordinator
        let flight = self.flight
        container.onLayout = { [weak map] size in
            guard let map else { return }
            // Read the clock here rather than closing over `progress`: by the
            // time a layout lands, the value captured at build time is stale.
            coordinator.frameRoute(map, flight: flight,
                                   progress: CrowMapView.liveProgress(flight),
                                   size: size)
        }
        return container
    }

    func updateUIView(_ container: CrowMapContainer, context: Context) {
        let map = container.map
        context.coordinator.frameRoute(map, flight: flight, progress: progress,
                                       size: container.bounds.size)
        context.coordinator.moveCrow(on: map, flight: flight, progress: progress)
    }

    func makeCoordinator() -> Coordinator { Coordinator(onTapCrow: onTapCrow) }

    /// The flap task outlives the view otherwise, holding the marker alive and
    /// redrawing a crow nobody is looking at.
    static func dismantleUIView(_ container: CrowMapContainer, coordinator: Coordinator) {
        coordinator.stopFlapping()
    }

    /// Explicitly main-actor: subclassing NSObject to become a delegate loses
    /// the isolation a plain coordinator would have inferred, and everything in
    /// here touches UIKit. GMSMapViewDelegate is an Objective-C protocol whose
    /// callbacks arrive on the main thread, so `@preconcurrency` is accurate
    /// rather than a silencer.
    @MainActor
    final class Coordinator: NSObject, @preconcurrency GMSMapViewDelegate {
        private var crow: GMSMarker?
        private var line: GMSPolyline?
        private var start: GMSMarker?
        private var frame = 0
        /// Wing beats run on their own clock. The sheet only republishes this
        /// view once a second, so driving the flap from `moveCrow` capped the
        /// crow at one beat a second no matter what interval it asked for.
        private var flapTask: Task<Void, Never>?
        /// Decided once per flight from its bearing — see `sprite(_:flipped:)`.
        private var facesLeft = false
        /// True once the person has panned or zoomed. After that the camera is
        /// theirs and we stop moving it under them.
        private var userMoved = false
        /// The view size the camera was last framed against, so a resize
        /// re-frames and a redraw at the same size doesn't.
        private var fittedSize: CGSize = .zero
        private var landed = false
        private var placed = false
        private let onTapCrow: () -> Void

        init(onTapCrow: @escaping () -> Void) {
            self.onTapCrow = onTapCrow
        }

        /// Only a crow that has arrived is worth tapping — it's standing on the
        /// thing it delivered.
        func mapView(_ mapView: GMSMapView, didTap marker: GMSMarker) -> Bool {
            guard marker === crow, landed else { return false }
            Haptics.tap()
            onTapCrow()
            return true
        }

        func mapView(_ mapView: GMSMapView, willMove gesture: Bool) {
            if gesture { userMoved = true }
        }

        /// Frames what's left of the journey, until the person takes over.
        ///
        /// While the crow is flying this is CROW → DESTINATION, not the whole
        /// original route: the remaining distance is what matters, so the view
        /// tightens as the bird closes in. A landed crow shows the whole route,
        /// re-framed whenever the drawer changes size and not otherwise.
        ///
        /// `size` is passed in rather than read off the map because this is
        /// called from inside a layout pass, where the map's own bounds may not
        /// have caught up yet.
        func frameRoute(_ map: GMSMapView, flight: CrowFlight, progress: Double, size: CGSize) {
            guard !userMoved else { return }
            // `fit` reserves its padding out of the viewport, so anything this
            // small has nothing left to fit into and hands back a camera
            // pointing at nowhere in particular. That is the half-open drawer,
            // and framing against it is what left the route off the screen.
            guard size.width >= Self.minFitSide, size.height >= Self.minFitSide else { return }

            if flight.arrived {
                // Nothing moves on a finished journey, so re-frame only when
                // the drawer itself changes size (opening, half → full).
                guard size != fittedSize else { return }
                fittedSize = size
                fitLanded(map, flight: flight, size: size)
                return
            }

            fittedSize = size
            let here = CrowMapView.position(flight, progress: progress)
            let remaining = GMSCoordinateBounds(
                coordinate: here,
                coordinate: .init(latitude: flight.destLat, longitude: flight.destLng))
            let inset = padding(for: size)
            guard let cruise = map.camera(for: remaining, insets: UIEdgeInsets(
                top: inset, left: inset, bottom: inset, right: inset)) else { return }

            // Takeoff.
            //
            // Fitting the remaining route alone starts a long journey at its
            // widest and tightens all the way in, so the only moment with any
            // movement in it is the landing. Starting at the SAME zoom the
            // landing ends on and climbing out of it over the first stretch
            // gives the departure its own beat — the ground dropping away as
            // the crow gains height — and leaves the arrival something to
            // tighten back into.
            //
            // A map opened on a crow already halfway there gets `climb` = 1 and
            // no invented takeoff: the bird is long since up.
            let climb = min(1, max(0, progress / Self.climbFraction))
            let eased = climb * climb * (3 - 2 * climb)     // smoothstep
            let cruiseZoom = Double(min(cruise.zoom, Float(Self.perchZoom)))
            let zoom = Self.perchZoom + (cruiseZoom - Self.perchZoom) * eased

            // The camera pans out from over the bird to the framing of the
            // route on the same curve, so the climb doesn't also lurch.
            let target = CLLocationCoordinate2D(
                latitude: here.latitude + (cruise.target.latitude - here.latitude) * eased,
                longitude: here.longitude + (cruise.target.longitude - here.longitude) * eased)

            // Animated rather than moved, so this reads as the camera following
            // the crow rather than jumping every second.
            map.animate(with: GMSCameraUpdate.setCamera(
                GMSCameraPosition(target: target, zoom: Float(zoom))))
        }

        /// Where the last seconds of a flight end up: the crow over a street.
        /// The first seconds start here too, and climb out of it.
        private static let perchZoom: Double = 17
        /// How much of the journey the crow spends gaining height.
        private static let climbFraction: Double = 0.2

        /// Below this a fit is meaningless — see `frameRoute`.
        private static let minFitSide: CGFloat = 180

        /// Padding scaled to the view, so the route is inset rather than
        /// squeezed when the drawer is at half height.
        private func padding(for size: CGSize) -> CGFloat {
            max(24, min(64, min(size.width, size.height) * 0.12))
        }

        func build(on map: GMSMapView, flight: CrowFlight) {
            let origin = CLLocationCoordinate2D(latitude: flight.originLat, longitude: flight.originLng)
            let dest = CLLocationCoordinate2D(latitude: flight.destLat, longitude: flight.destLng)

            let path = GMSMutablePath()
            path.add(origin)
            path.add(dest)
            let route = GMSPolyline(path: path)
            route.strokeColor = UIColor(Palette.mapRoute).withAlphaComponent(0.95)
            route.strokeWidth = 6
            route.map = map
            line = route

            let from = GMSMarker(position: origin)
            from.icon = dot(fill: UIColor(Palette.mapBackground), ring: UIColor(Palette.mapRoute))
            from.groundAnchor = CGPoint(x: 0.5, y: 0.5)
            // While the crow is flying the line starts at the bird, so an origin
            // dot would sit on its own with nothing joining it.
            from.map = flight.arrived ? map : nil
            start = from

            let end = GMSMarker(position: dest)
            end.icon = dot(fill: UIColor(Palette.mapRoute), ring: .white)
            end.groundAnchor = CGPoint(x: 0.5, y: 0.5)
            end.map = map

            // Placed where it actually is, not at the origin. Creating it at
            // the origin and correcting it a frame later meant the correction
            // rode the sheet's presentation animation — so every time the map
            // opened, the crow slid down the route to where it belonged.
            let bird = GMSMarker(position: CrowMapView.position(
                flight, progress: CrowMapView.liveProgress(flight)))
            facesLeft = flight.destLng < flight.originLng
            bird.icon = flight.arrived ? sprite("crow_land_10")
                                       : sprite("crow_send_03", flipped: facesLeft)
            bird.groundAnchor = CGPoint(x: 0.5, y: 0.5)
            bird.zIndex = 10
            bird.map = map
            crow = bird
            landed = flight.arrived
            if !flight.arrived { startFlapping() }
        }

        /// Alternates the two wing poses at roughly seven beats a second,
        /// independently of how often SwiftUI gets round to updating the map.
        func startFlapping() {
            flapTask?.cancel()
            flapTask = Task { @MainActor [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(140))
                    guard let self, !Task.isCancelled else { return }
                    guard let crow = self.crow, !self.landed else { return }
                    self.frame = 1 - self.frame
                    crow.icon = self.sprite(self.frame == 0 ? "crow_send_03" : "crow_send_04",
                                            flipped: self.facesLeft)
                }
            }
        }

        func stopFlapping() {
            flapTask?.cancel()
            flapTask = nil
        }

        /// Moves the crow along the line, alternating the two wing poses so it
        /// reads as flying rather than sliding.
        func moveCrow(on map: GMSMapView, flight: CrowFlight, progress: Double) {
            guard let crow else { return }
            let here = CrowMapView.position(flight, progress: progress)
            // The first placement must not animate; later ones may, because
            // that's what makes the crow glide rather than hop each second.
            if placed {
                crow.position = here
            } else {
                placed = true
                CATransaction.begin()
                CATransaction.setDisableActions(true)
                crow.position = here
                CATransaction.commit()
            }

            // The line is what's LEFT of the journey: crow to destination. The
            // part already flown isn't drawn — it would trail off the edge of a
            // view that's framed on the remaining distance.
            let path = GMSMutablePath()
            path.add(flight.arrived
                     ? CLLocationCoordinate2D(latitude: flight.originLat, longitude: flight.originLng)
                     : here)
            path.add(.init(latitude: flight.destLat, longitude: flight.destLng))
            line?.path = path
            start?.map = flight.arrived ? map : nil

            landed = flight.arrived
            guard !flight.arrived else {
                stopFlapping()
                crow.icon = sprite("crow_land_10")
                return
            }
            // The wings are the flap task's job; this only moves the bird.
            if flapTask == nil { startFlapping() }
        }

        /// Where a finished journey sits: the whole route, both ends on screen.
        ///
        /// No zoom offset — a landed crow shows the WHOLE journey. Zooming in
        /// past the fit crops the route and leaves you looking at one end
        /// wondering where the rest of it went.
        func fitLanded(_ map: GMSMapView, flight: CrowFlight, size: CGSize) {
            let bounds = GMSCoordinateBounds(
                coordinate: .init(latitude: flight.originLat, longitude: flight.originLng),
                coordinate: .init(latitude: flight.destLat, longitude: flight.destLng))
            map.moveCamera(GMSCameraUpdate.fit(bounds, withPadding: padding(for: size)))
            // Two people in the same postcode would otherwise zoom to the roof.
            if map.camera.zoom > 16 {
                map.moveCamera(GMSCameraUpdate.zoom(to: 16))
            }
        }

        /// The art is drawn facing east. `flipped` mirrors it for a westward
        /// journey, so the crow faces where it's going rather than flying
        /// backwards down its own route.
        private func sprite(_ name: String, flipped: Bool = false) -> UIImage? {
            guard let image = UIImage(named: name) ?? bundled(name) else { return nil }
            // 38 read as a dot, 76 as a cartoon; 57 is the middle of the two.
            let side: CGFloat = 57
            let size = CGSize(width: side, height: side * (image.size.height / max(image.size.width, 1)))
            return UIGraphicsImageRenderer(size: size).image { context in
                if flipped {
                    context.cgContext.translateBy(x: size.width, y: 0)
                    context.cgContext.scaleBy(x: -1, y: 1)
                }
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
    var onTapCrow: () -> Void = {}

    @State private var camera: MapCameraPosition = .automatic

    var body: some View {
        Map(position: $camera, interactionModes: [.pan, .zoom]) {
            MapPolyline(coordinates: [
                .init(latitude: flight.originLat, longitude: flight.originLng),
                .init(latitude: flight.destLat, longitude: flight.destLng),
            ])
            .stroke(Palette.mapRoute, style: StrokeStyle(lineWidth: 5, lineCap: .round))

            Annotation(flight.originLabel ?? "Sent from",
                       coordinate: .init(latitude: flight.originLat, longitude: flight.originLng)) {
                Circle().fill(Palette.mapBackground).stroke(Palette.mapRoute, lineWidth: 2)
                    .frame(width: 12, height: 12)
            }

            Annotation(flight.destLabel ?? "Heading for",
                       coordinate: .init(latitude: flight.destLat, longitude: flight.destLng)) {
                Image(systemName: "mappin.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Palette.mapRoute)
                    .background(Circle().fill(Palette.mapBackground).padding(3))
            }

            Annotation("The crow", coordinate: CrowMapView.position(flight, progress: progress)) {
                Group {
                    if flight.arrived {
                        CrowSprite(name: CrowArt.right, size: 51)
                    } else {
                        FlappingCrow(size: 51)
                    }
                }
                    // Drawn facing east; a westward journey mirrors it so the
                    // crow faces its direction of travel.
                    .scaleEffect(x: flight.destLng < flight.originLng ? -1 : 1, y: 1)
                    .shadow(radius: 3)
                    .contentShape(.rect)
                    .onTapGesture {
                        guard flight.arrived else { return }
                        Haptics.tap()
                        onTapCrow()
                    }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .onAppear(perform: fit)
        .onChange(of: progress) { _, _ in
            guard !flight.arrived else { return }
            withAnimation(.easeInOut(duration: 0.9)) { fit() }
        }
    }

    /// In flight, frames crow → destination so the view tightens as it closes
    /// in; landed, frames the whole journey a level out.
    private func fit() {
        let crow = CrowMapView.position(flight, progress: progress)
        let from = flight.arrived
            ? CLLocationCoordinate2D(latitude: flight.originLat, longitude: flight.originLng)
            : crow
        let to = CLLocationCoordinate2D(latitude: flight.destLat, longitude: flight.destLng)
        // No offset either way — the fit is the frame.
        let out: Double = 1
        camera = .region(MKCoordinateRegion(
            center: .init(latitude: (from.latitude + to.latitude) / 2,
                          longitude: (from.longitude + to.longitude) / 2),
            span: MKCoordinateSpan(
                latitudeDelta: max(abs(from.latitude - to.latitude) * 1.8, 0.004) * out,
                longitudeDelta: max(abs(from.longitude - to.longitude) * 1.8, 0.004) * out)))
    }
}
