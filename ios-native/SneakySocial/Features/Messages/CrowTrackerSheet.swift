import SwiftUI

/// The map that slides up from a crow bubble.
///
/// Half height to begin with — enough to see the crow, the line it's flying and
/// where it's headed — and full height on a swipe, or on tapping the header.
/// The flight comes from `GET /api/scrolls/:id/flight`, the same object the web
/// tracker and the Live Activity are built from, so all three narrate the crow's
/// journey with the same lines at the same points.
struct CrowTrackerSheet: View {
    /// The API path this journey lives at. A scroll and a chat message describe
    /// their flights identically, so the sheet doesn't need to know which it's
    /// looking at.
    let flightPath: String
    @Binding var detent: PresentationDetent

    @State private var flight: CrowFlight?
    @State private var error: String?
    /// A journey that was never recorded — a gesture, or a message sent before
    /// anyone had set a location. Not a failure, just nothing to draw.
    @State private var noRoute = false
    @State private var poll: Task<Void, Never>?
    /// Ticked once a second so the crow keeps moving between polls.
    @State private var now: Date = .now

    var body: some View {
        VStack(spacing: 0) {
            header

            if let flight {
                map(flight)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if noRoute {
                ContentUnavailableView(
                    "No route for this one",
                    systemImage: "bird",
                    description: Text("It was sent before anyone had said where they were, so there's no journey to follow.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                ContentUnavailableView("Can't follow this crow", systemImage: "bird", description: Text(error))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color(hex: "#1f1f1e").opacity(0.001))
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        // Deliberately NOT presentationBackgroundInteraction: with the thread
        // live behind the sheet, the tap that dismissed it landed on a bubble
        // and opened the thing straight back up.
        .appTheme()
        .task(id: flightPath) { await load() }
        .task { await tick() }
        .onDisappear { poll?.cancel(); poll = nil }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 6) {
            Text(headline)
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
        .accessibilityAddTraits(.isButton)
    }

    private var headline: String {
        if let flight { return flight.line(at: liveProgress) }
        if noRoute { return "No crow to follow" }
        if error != nil { return "Lost the trail" }
        return "Finding the crow…"
    }

    private func distance(_ flight: CrowFlight) -> String {
        flight.distanceKm >= 10
            ? "\(Int(flight.distanceKm.rounded())) km to go"
            : String(format: "%.1f km to go", flight.distanceKm)
    }

    // MARK: - Map

    private func map(_ flight: CrowFlight) -> some View {
        CrowMapView(flight: flight, progress: liveProgress)
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

    // MARK: - Loading

    private func load() async {
        noRoute = false
        do {
            let response = try await APIClient.shared.get(flightPath, as: CrowFlightResponse.self)
            flight = response.flight
            error = nil
            startPolling()
        } catch APIError.http(let status, let message) where status == 404 {
            // Fastify's own 404 says "Not Found"; ours names itself. Treating
            // both as "no route recorded" hid an undeployed endpoint behind a
            // reassuring message, which cost an evening.
            if message.localizedCaseInsensitiveContains("no route")
                || message.localizedCaseInsensitiveContains("no such crow") {
                noRoute = true
            } else {
                error = "This endpoint isn't on the server yet (\(message))."
            }
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
                let updated = try? await APIClient.shared.get(flightPath, as: CrowFlightResponse.self)
                guard let updated else { continue }
                flight = updated.flight
                if updated.flight.arrived { return }
            }
        }
    }
}
