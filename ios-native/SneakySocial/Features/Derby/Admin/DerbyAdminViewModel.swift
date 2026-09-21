import Foundation
import Observation

/// The Ducky Derby admin plane. Every endpoint returns the whole config back,
/// so a save doubles as a refresh and the screens never drift from the server.
@MainActor
@Observable
final class DerbyAdminViewModel {
    private(set) var config: DuckyConfig?
    private(set) var isSaving = false

    /// Which content set is being edited. Defaults to the one this app plays.
    var variant: DuckyVariant = .app
    var errorMessage: String?
    var lastSavedAt: Date?

    private let api: APIClient
    private static let basePath = "/admin/games/ducky"

    init(config: DuckyConfig? = nil, api: APIClient = .shared) {
        self.config = config
        self.api = api
    }

    var ducks: [Duck] { config?.ducks ?? [] }

    func load() async {
        do {
            config = try await api.get(Self.basePath + variant.query, as: DuckyConfig.self)
        } catch {
            errorMessage = message(for: error)
        }
    }

    /// Switch variants and pull that set's content.
    func select(_ newVariant: DuckyVariant) async {
        guard newVariant != variant else { return }
        variant = newVariant
        config = nil
        await load()
    }

    // MARK: - Saves

    func saveRaceSettings(_ patch: DuckyConfigPatch) async {
        let path = Self.basePath + variant.query
        await save { try await self.api.patch(path, body: patch, as: DuckyConfig.self) }
    }

    /// Ducks are shared by both variants — editing one edits both.
    func saveDuck(ord: Int, _ patch: DuckPatch) async {
        let path = "\(Self.basePath)/ducks/\(ord)\(variant.query)"
        await save { try await self.api.patch(path, body: patch, as: DuckyConfig.self) }
    }

    func saveRow(_ list: DuckyTextList, ord: Int, _ patch: TextRowPatch) async {
        let path = "\(Self.basePath)/\(list.path)/\(ord)\(variant.query)"
        await save { try await self.api.patch(path, body: patch, as: DuckyConfig.self) }
    }

    func toggleActive(_ list: DuckyTextList, row: DuckyTextRow) async {
        await saveRow(list, ord: row.ord, TextRowPatch(active: !row.active))
    }

    func toggleRacing(_ duck: Duck) async {
        await saveDuck(ord: duck.ord, DuckPatch(active: !duck.active))
    }

    private func save(_ work: @escaping () async throws -> DuckyConfig) async {
        guard !isSaving else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            config = try await work()
            lastSavedAt = .now
            Haptics.success()
        } catch {
            errorMessage = message(for: error)
            Haptics.warning()
        }
    }

    private func message(for error: Error) -> String {
        (error as? APIError)?.errorDescription ?? error.localizedDescription
    }

    // MARK: - Validation, mirroring the backend's own checks

    static func validateRaceSettings(
        water: String, grass: String, mud: String, buoy: String
    ) -> String? {
        let fields = [("Water", water), ("Grass", grass), ("Mud", mud), ("Buoy", buoy)]
        for (label, value) in fields where !HexColour.isValid(value) {
            return "\(label) colour must be a hex like #4aa3c7"
        }
        return nil
    }

    static func validateDuck(duckColour: String, billColour: String, oddsNum: Int?, oddsDen: Int?) -> String? {
        if !HexColour.isValid(duckColour) { return "Body colour must be a hex like #ffd23f" }
        if !HexColour.isValid(billColour) { return "Bill colour must be a hex like #e8912d" }
        guard let oddsNum, (1...999).contains(oddsNum) else { return "Odds numerator must be 1–999" }
        guard let oddsDen, (1...999).contains(oddsDen) else { return "Odds denominator must be 1–999" }
        return nil
    }
}
