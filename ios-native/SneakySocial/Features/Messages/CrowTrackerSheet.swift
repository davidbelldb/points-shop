import SwiftUI
import MapKit

/// The map that slides up from a crow bubble.
///
/// Half height to begin with — enough to see the crow, the line it's flying and
/// where it's headed — and full height on a swipe, or on tapping the header.
/// The flight comes from `GET /api/scrolls/:id/flight`, the same object the web
/// tracker and the Live Activity are built from, so all three narrate the crow's
/// journey with the same lines at the same points.
struct CrowTrackerSheet: View {
    let scrollID: String
    @Binding var detent: PresentationDetent

    @State private var flight: CrowFlight?
    @State private var error: String?
    @State private var camera: MapCameraPosition = .automatic
    @State private var poll: Task<Void, Never>?
    /// Ticked once a second so the crow keeps moving between polls.
    @State private var now: Date = .now

    var body: some View {
        VStack(spacing: 0) {
            header

            if let flight {
                map(flight)
            } else if let error {
                ContentUnavailableView("Can't follow this crow", systemImage: "bird", description: Text(error))
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color(hex: "#1f1f1e").opacity(0.001))
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        .appTheme()
        .task(id: scrollID) { await load() }
        .task { await tick() }
        .onDisappear { poll?.cancel(); poll = nil }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 6) {
            Text(flight?.line(at: liveProgress) ?? "Finding the crow…")
                .font(CrowArt.font(size: 16))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .fixedSize(horizontal: false, vertical: true)

            if let flight {
                HStack(spacing: 12) {
                    if flight.arrived {
                        Label("Landed", systemImage: "checkmark.circle.fill")
                    } else {
                        Label("\(flight.etaMinutes) min", systemImage: "clock")
                        Label(distance(flight), systemImage: "arrow.left.and.right")
                    }
                    if let dest = flight.destLabel, !dest.isEmpty {
                        Label(dest, systemImage: "mappin.and.ellipse").lineLimit(1)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity)
        // The "second tap" that takes the sheet full height, for anyone who
        // doesn't think to swipe it.
        .contentShape(.rect)
        .onTapGesture {
            withAnimation { detent = detent == .large ? .medium : .large }
            Haptics.tap()
        }
    }

    private func distance(_ flight: CrowFlight) -> String {
        flight.distanceKm >= 10
            ? "\(Int(flight.distanceKm.rounded())) km to go"
            : String(format: "%.1f km to go", flight.distanceKm)
    }

    // MARK: - Map

    private func map(_ flight: CrowFlight) -> some View {
        Group {
            let progress = liveProgress
            Map(position: $camera, interactionModes: [.pan, .zoom]) {
                MapPolyline(coordinates: [origin(flight), destination(flight)])
                    .stroke(Palette.oxblood, style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [6, 8]))

                Annotation(flight.originLabel ?? "Sent from", coordinate: origin(flight)) {
                    Circle()
                        .fill(Palette.parchment)
                        .stroke(Palette.oxblood, lineWidth: 2)
                        .frame(width: 12, height: 12)
                }

                Annotation(flight.destLabel ?? "Heading for", coordinate: destination(flight)) {
                    Image(systemName: "mappin.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Palette.oxblood)
                        .background(Circle().fill(Palette.parchment).padding(3))
                }

                Annotation("The crow", coordinate: position(flight, progress: progress)) {
                    CrowSprite(name: CrowArt.mover, size: 36)
                        .shadow(radius: 3)
                }
            }
            .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        }
        .onAppear { frame(flight) }
    }

    private func origin(_ flight: CrowFlight) -> CLLocationCoordinate2D {
        .init(latitude: flight.originLat, longitude: flight.originLng)
    }

    private func destination(_ flight: CrowFlight) -> CLLocationCoordinate2D {
        .init(latitude: flight.destLat, longitude: flight.destLng)
    }

    /// Straight-line interpolation, matching how the server describes the
    /// journey: as the crow flies, no roads.
    private func position(_ flight: CrowFlight, progress: Double) -> CLLocationCoordinate2D {
        guard !flight.arrived else { return destination(flight) }
        let fraction = max(0, min(1, progress))
        return .init(
            latitude: flight.originLat + (flight.destLat - flight.originLat) * fraction,
            longitude: flight.originLng + (flight.destLng - flight.originLng) * fraction
        )
    }

    /// Progress from the flight's own clock rather than the server's snapshot,
    /// so the crow keeps moving between polls.
    private var liveProgress: Double {
        guard let flight else { return 0 }
        if flight.arrived { return 1 }
        let total = flight.arrivesAt.timeIntervalSince(flight.startedAt)
        guard total > 0 else { return 1 }
        return max(0, min(1, now.timeIntervalSince(flight.startedAt) / total))
    }

    /// A second hand for the crow's position and the narration line. Stops as
    /// soon as it lands — there's nothing left to move.
    private func tick() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            now = .now
            if flight?.arrived == true { return }
        }
    }

    /// Fit both ends of the journey, with room around them.
    private func frame(_ flight: CrowFlight) {
        let midLat = (flight.originLat + flight.destLat) / 2
        let midLng = (flight.originLng + flight.destLng) / 2
        let spanLat = max(abs(flight.originLat - flight.destLat) * 1.8, 0.02)
        let spanLng = max(abs(flight.originLng - flight.destLng) * 1.8, 0.02)
        camera = .region(MKCoordinateRegion(
            center: .init(latitude: midLat, longitude: midLng),
            span: MKCoordinateSpan(latitudeDelta: spanLat, longitudeDelta: spanLng)
        ))
    }

    // MARK: - Loading

    private func load() async {
        do {
            let response = try await APIClient.shared.get("/scrolls/\(scrollID)/flight", as: CrowFlightResponse.self)
            flight = response.flight
            error = nil
            frame(response.flight)
            startPolling()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// The narration lines come from the server, so an in-flight crow is worth
    /// re-asking about; a landed one isn't going anywhere.
    private func startPolling() {
        poll?.cancel()
        guard flight?.arrived == false else { return }
        poll = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(6))
                guard !Task.isCancelled else { return }
                let updated = try? await APIClient.shared.get("/scrolls/\(scrollID)/flight", as: CrowFlightResponse.self)
                guard let updated else { continue }
                flight = updated.flight
                if updated.flight.arrived { return }
            }
        }
    }
}
