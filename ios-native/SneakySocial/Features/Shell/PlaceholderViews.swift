import SwiftUI

/// Phase-1 placeholders. Each one makes the real API call its feature will use,
/// so a fresh install proves the whole pipe — cookie session, TLS, decoding —
/// before any of the heavy UI lands.

struct DerbyPlaceholderView: View {
    var body: some View {
        FeatureProbeView(
            title: "Ducky Derby",
            subtitle: "Phase 2",
            probe: "GET /api/games/ducky/config"
        ) {
            let config = try await APIClient.shared.get("/games/ducky/config", as: DuckyConfigProbe.self)
            return "\(config.ducks.count) ducks configured, \(config.raceDuckCount ?? 10) race at a time"
        }
    }
}

struct CrowPlaceholderView: View {
    var body: some View {
        FeatureProbeView(
            title: "Crow Tracker",
            subtitle: "Phase 3",
            probe: "GET /api/scrolls/config"
        ) {
            let config = try await APIClient.shared.get("/scrolls/config", as: ScrollsConfigProbe.self)
            let enabled = config.settings?.enabled == true ? "enabled" : "disabled"
            return "Scrolls \(enabled) · \(config.send.count) send frames, \(config.land.count) land frames"
        }
    }
}

struct MessagesPlaceholderView: View {
    var body: some View {
        FeatureProbeView(
            title: "Messages",
            subtitle: "Phase 4",
            probe: "GET /api/messages"
        ) {
            let thread = try await APIClient.shared.get("/messages", as: MessagesProbe.self)
            let partner = thread.other?.name ?? thread.other?.username ?? "nobody"
            return "\(thread.messages.count) messages with \(partner)"
        }
    }
}

// MARK: - Shared probe scaffolding

private struct FeatureProbeView: View {
    @Environment(SessionStore.self) private var session

    let title: String
    let subtitle: String
    let probe: String
    let run: @Sendable () async throws -> String

    @State private var result: String?
    @State private var error: String?
    @State private var isLoading = false

    var body: some View {
        List {
            Section {
                LabeledContent("Signed in as", value: session.account?.displayName ?? "—")
                LabeledContent("Balance", value: "\(session.pointsBalance) pts")
                if session.account?.impersonating == true {
                    LabeledContent("Impersonating", value: session.account?.username ?? "—")
                }
            } header: {
                Text("Session")
            }

            Section {
                Text(probe)
                    .font(.footnote.monospaced())
                    .foregroundStyle(.secondary)

                if isLoading {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Calling…").foregroundStyle(.secondary)
                    }
                } else if let result {
                    Label(result, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                } else if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }

                Button("Run again", action: load)
                    .disabled(isLoading)
            } header: {
                Text("Connectivity check")
            } footer: {
                Text("\(title) lands in \(subtitle).")
            }

            Section {
                Button("Sign out", role: .destructive) {
                    Task { await session.logOut() }
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { PointsBadge() }
        }
        .task { load() }
    }

    private func load() {
        guard !isLoading else { return }
        isLoading = true
        result = nil
        error = nil
        Task {
            do {
                result = try await run()
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            isLoading = false
        }
    }
}

// MARK: - Throwaway probe models (replaced by the real ones in later phases)

private struct DuckyConfigProbe: Decodable, Sendable {
    struct Duck: Decodable, Sendable { let ord: Int }
    let ducks: [Duck]
    let raceDuckCount: Int?

    private enum CodingKeys: String, CodingKey {
        case ducks
        case raceDuckCount = "race_duck_count"
    }
}

private struct ScrollsConfigProbe: Decodable, Sendable {
    struct Settings: Decodable, Sendable { let enabled: Bool? }
    struct Frame: Decodable, Sendable { let layer: String? }
    let settings: Settings?
    let send: [Frame]
    let land: [Frame]
}

private struct MessagesProbe: Decodable, Sendable {
    struct Partner: Decodable, Sendable {
        let username: String?
        let name: String?
    }
    struct Message: Decodable, Sendable { let id: String }
    let other: Partner?
    let messages: [Message]
}
