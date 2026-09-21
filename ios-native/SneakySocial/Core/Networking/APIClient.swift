import Foundation

/// Errors surfaced to the UI. `message` is already human-readable — the backend
/// returns `{ "error": "..." }` bodies that we unwrap here.
enum APIError: LocalizedError, Sendable {
    case http(status: Int, message: String)
    case network(String)
    case decoding(String)
    case notAuthenticated

    var errorDescription: String? {
        switch self {
        case .http(_, let message): return message
        case .network(let message): return message
        case .decoding(let message): return "Couldn't read the server's reply (\(message))"
        case .notAuthenticated: return "You need to sign in again."
        }
    }

    var isUnauthorised: Bool {
        if case .http(let status, _) = self { return status == 401 }
        if case .notAuthenticated = self { return true }
        return false
    }
}

/// Talks to the Fastify backend on the VPS.
///
/// Auth is the same `sneaky_session` httpOnly cookie the web app uses: we let
/// URLSession's shared cookie storage handle it, so a login persists across
/// launches exactly like it does in Safari (the cookie has a 30-day max-age).
///
/// Mirrors `frontend/src/lib/api.js`: reads are retried a couple of times on a
/// transient network blip or a 502/503/504, mutations are never retried.
final class APIClient: Sendable {
    static let shared = APIClient()

    /// Production origin of the Node/Postgres backend (behind Caddy).
    static let origin = URL(string: "https://sneakypoints.com")!

    private let session: URLSession

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.httpCookieStorage = .shared
            config.httpCookieAcceptPolicy = .always
            config.httpShouldSetCookies = true
            config.timeoutIntervalForRequest = 20
            config.waitsForConnectivity = true
            self.session = URLSession(configuration: config)
        }
    }

    // MARK: - Public surface

    func get<T: Decodable & Sendable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send(path, method: "GET", body: Optional<NoBody>.none, as: type)
    }

    func post<T: Decodable & Sendable>(_ path: String, as type: T.Type = T.self) async throws -> T {
        try await send(path, method: "POST", body: Optional<NoBody>.none, as: type)
    }

    func post<B: Encodable & Sendable, T: Decodable & Sendable>(
        _ path: String, body: B, as type: T.Type = T.self
    ) async throws -> T {
        try await send(path, method: "POST", body: body, as: type)
    }

    func put<B: Encodable & Sendable, T: Decodable & Sendable>(
        _ path: String, body: B, as type: T.Type = T.self
    ) async throws -> T {
        try await send(path, method: "PUT", body: body, as: type)
    }

    func patch<B: Encodable & Sendable, T: Decodable & Sendable>(
        _ path: String, body: B, as type: T.Type = T.self
    ) async throws -> T {
        try await send(path, method: "PATCH", body: body, as: type)
    }

    @discardableResult
    func delete(_ path: String) async throws -> OKResponse {
        try await send(path, method: "DELETE", body: Optional<NoBody>.none, as: OKResponse.self)
    }

    /// Some deletes answer with the updated resource rather than `{ ok: true }`
    /// — removing a basket line returns the whole basket, for instance.
    func delete<T: Decodable & Sendable>(_ path: String, as type: T.Type) async throws -> T {
        try await send(path, method: "DELETE", body: Optional<NoBody>.none, as: type)
    }

    /// Fire-and-forget calls whose reply we don't care about (typing pings, reads).
    func fireAndForget(_ path: String, method: String = "POST") async {
        _ = try? await send(path, method: method, body: Optional<NoBody>.none, as: OKResponse.self)
    }

    func fireAndForget<B: Encodable & Sendable>(_ path: String, method: String = "POST", body: B) async {
        _ = try? await send(path, method: method, body: body, as: OKResponse.self)
    }

    // MARK: - Uploads

    /// Sends a file to `POST /api/upload` as multipart/form-data — photos, GIFs
    /// saved from the picker, and voice notes all come back as a `/media/...`
    /// URL, which is what a media message's body actually is.
    func upload(_ data: Data, filename: String, mimeType: String) async throws -> UploadResponse {
        guard let url = URL(string: "/api/upload", relativeTo: Self.origin)?.absoluteURL else {
            throw APIError.network("Bad upload path")
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        // Uploads can be slow on a phone; the default 20s is not enough.
        request.timeoutInterval = 120

        var body = Data()
        func append(_ text: String) { body.append(Data(text.utf8)) }
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        append("\r\n--\(boundary)--\r\n")
        request.httpBody = body

        do {
            let (responseData, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.network("No response from the server")
            }
            if http.statusCode == 401 { throw APIError.notAuthenticated }
            guard (200..<300).contains(http.statusCode) else {
                throw APIError.http(status: http.statusCode,
                                    message: Self.errorMessage(from: responseData, status: http.statusCode))
            }
            return try Self.decoder.decode(UploadResponse.self, from: responseData)
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(error.localizedDescription)
        }
    }

    // MARK: - Media

    /// Backend payloads embed uploads as root-relative paths ("/media/..."), which
    /// would resolve against the app bundle. Absolutize them, as api.js does.
    static func mediaURL(_ value: String?) -> URL? {
        guard let value, !value.isEmpty else { return nil }
        if value.hasPrefix("/") { return URL(string: value, relativeTo: origin)?.absoluteURL }
        return URL(string: value)
    }

    // MARK: - Plumbing

    /// Placeholder body type for requests that send nothing.
    private struct NoBody: Encodable, Sendable {}

    private func send<B: Encodable & Sendable, T: Decodable & Sendable>(
        _ path: String, method: String, body: B?, as type: T.Type
    ) async throws -> T {
        guard let url = URL(string: "/api" + path, relativeTo: Self.origin)?.absoluteURL else {
            throw APIError.network("Bad path \(path)")
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                throw APIError.decoding(error.localizedDescription)
            }
        }

        let canRetry = (method == "GET" || method == "HEAD")
        let maxAttempts = canRetry ? 3 : 1
        let backoff: [UInt64] = [250_000_000, 600_000_000]

        var lastError: APIError = .network("Request failed")

        for attempt in 0..<maxAttempts {
            do {
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    throw APIError.network("No response from the server")
                }

                if http.statusCode == 401 { throw APIError.notAuthenticated }

                guard (200..<300).contains(http.statusCode) else {
                    if canRetry, [502, 503, 504].contains(http.statusCode), attempt < maxAttempts - 1 {
                        try? await Task.sleep(nanoseconds: backoff[min(attempt, backoff.count - 1)])
                        lastError = .http(status: http.statusCode, message: "Server busy")
                        continue
                    }
                    throw APIError.http(status: http.statusCode, message: Self.errorMessage(from: data, status: http.statusCode))
                }

                if T.self == OKResponse.self, data.isEmpty {
                    return OKResponse(ok: true) as! T
                }

                do {
                    return try Self.decoder.decode(T.self, from: data)
                } catch {
                    throw APIError.decoding(String(describing: error))
                }
            } catch let error as APIError {
                // The retryable statuses `continue` above, so an APIError here is final.
                throw error
            } catch {
                lastError = .network(error.localizedDescription)
                if canRetry, attempt < maxAttempts - 1 {
                    try? await Task.sleep(nanoseconds: backoff[min(attempt, backoff.count - 1)])
                    continue
                }
                throw lastError
            }
        }

        throw lastError
    }

    private static func errorMessage(from data: Data, status: Int) -> String {
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = object["error"] as? String, !message.isEmpty {
            return message
        }
        return HTTPURLResponse.localizedString(forStatusCode: status).capitalized
    }

    /// Postgres timestamps arrive as ISO-8601, sometimes with fractional seconds
    /// and sometimes without — accept both rather than failing a whole payload.
    ///
    /// Built per use: `JSONDecoder` is a reference type, so a shared static one
    /// would be mutable state across tasks.
    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = try? fractionalISO8601.parse(raw) { return date }
            if let date = try? plainISO8601.parse(raw) { return date }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Unrecognised date \(raw)")
            )
        }
        return decoder
    }

    // Format styles are value types, so these are safe to share.
    private static let fractionalISO8601 = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let plainISO8601 = Date.ISO8601FormatStyle()
}

/// What `/api/upload` answers with.
struct UploadResponse: Decodable, Sendable {
    let url: String
    var thumbnailURL: String?

    private enum CodingKeys: String, CodingKey {
        case url
        case thumbnailURL = "thumbnail_url"
    }
}

/// The `{ ok: true }` shape a handful of endpoints return.
struct OKResponse: Codable, Sendable {
    let ok: Bool

    init(ok: Bool = true) { self.ok = ok }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.ok = (try? container.decode(Bool.self, forKey: .ok)) ?? true
    }

    private enum CodingKeys: String, CodingKey { case ok }
}
