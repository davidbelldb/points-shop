import Foundation
import Observation

/// Who's signed in, and the points balance every screen shows in its header.
///
/// The session itself lives in the shared cookie jar (`sneaky_session`, 30-day
/// max-age), so "am I signed in?" is answered by asking the server rather than
/// by anything we persist ourselves.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(Account)
    }

    private(set) var state: State = .loading
    private(set) var isWorking = false
    var loginError: String?

    private let api: APIClient

    init(api: APIClient = .shared) {
        self.api = api
    }

    var account: Account? {
        if case .signedIn(let account) = state { return account }
        return nil
    }

    var pointsBalance: Int { account?.pointsBalance ?? 0 }

    /// Called once at launch. A 401 simply means "show the login screen".
    func bootstrap() async {
        do {
            state = .signedIn(try await api.get("/auth/me", as: Account.self))
        } catch {
            state = .signedOut
        }
    }

    func logIn(username: String, password: String) async {
        guard !isWorking else { return }
        isWorking = true
        loginError = nil
        defer { isWorking = false }

        do {
            let account = try await api.post(
                "/auth/login",
                body: LoginRequest(username: username, password: password),
                as: Account.self
            )
            state = .signedIn(account)
        } catch {
            loginError = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func logOut() async {
        await api.fireAndForget("/auth/logout")
        HTTPCookieStorage.shared.cookies?
            .filter { $0.name == "sneaky_session" }
            .forEach(HTTPCookieStorage.shared.deleteCookie)
        state = .signedOut
    }

    /// Cheap refresh after anything that moves points.
    func refresh() async {
        guard case .signedIn = state else { return }
        if let account = try? await api.get("/auth/me", as: Account.self) {
            state = .signedIn(account)
        }
    }

    /// The derby returns the new balance with its result, so the header can
    /// update without a round trip.
    func applyBalance(_ newBalance: Int) {
        guard case .signedIn(var account) = state else { return }
        account.pointsBalance = newBalance
        state = .signedIn(account)
    }
}
