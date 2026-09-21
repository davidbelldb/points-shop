import Foundation
import Testing
@testable import SneakySocial

@Suite("API plumbing")
struct APIClientTests {

    @Test("Root-relative media paths are absolutized onto the production origin")
    func mediaPathsAbsolutize() {
        #expect(APIClient.mediaURL("/media/uploads/a.jpg")?.absoluteString
                == "https://sneakypoints.com/media/uploads/a.jpg")
        #expect(APIClient.mediaURL("https://cdn.example.com/b.png")?.absoluteString
                == "https://cdn.example.com/b.png")
        #expect(APIClient.mediaURL(nil) == nil)
        #expect(APIClient.mediaURL("") == nil)
    }

    @Test("Timestamps decode with and without fractional seconds")
    func decodesBothTimestampShapes() throws {
        struct Row: Decodable { let sentAt: Date }

        let withMillis = #"{"sentAt":"2026-09-21T12:34:12.518Z"}"#.data(using: .utf8)!
        let withoutMillis = #"{"sentAt":"2026-09-21T12:34:12Z"}"#.data(using: .utf8)!

        let a = try APIClient.decoder.decode(Row.self, from: withMillis)
        let b = try APIClient.decoder.decode(Row.self, from: withoutMillis)

        #expect(abs(a.sentAt.timeIntervalSince(b.sentAt) - 0.518) < 0.001)
    }

    @Test("A decoded account keeps the snake_case fields the backend sends")
    func decodesAccount() throws {
        let json = #"""
        {"id":"00000000-0000-0000-0000-000000000001","username":"katie","role":"user",
         "name":"Katie","email":"k@example.com","photo_url":"/media/katie.jpg",
         "points_balance":1250,"actual_id":"00000000-0000-0000-0000-000000000002",
         "actual_username":"david","actual_role":"admin","impersonating":true}
        """#.data(using: .utf8)!

        let account = try APIClient.decoder.decode(Account.self, from: json)

        #expect(account.displayName == "Katie")
        #expect(account.pointsBalance == 1250)
        #expect(account.isAdmin)
        #expect(account.impersonating)
        #expect(account.photo?.absoluteString == "https://sneakypoints.com/media/katie.jpg")
    }

    @Test("Missing optional fields fall back rather than failing the payload")
    func toleratesSparseAccount() throws {
        let json = #"{"id":"abc","username":"david"}"#.data(using: .utf8)!
        let account = try APIClient.decoder.decode(Account.self, from: json)

        #expect(account.displayName == "david")
        #expect(account.pointsBalance == 0)
        #expect(account.impersonating == false)
        #expect(account.isAdmin == false)
    }
}
