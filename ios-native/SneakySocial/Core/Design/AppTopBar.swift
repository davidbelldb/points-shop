import SwiftUI

/// The bar every screen wears: the app icon top-left, the shop's name in the
/// middle, the points pill and basket top-right.
///
/// It's deliberately the same everywhere — moving between the shop, the games
/// and the messages shouldn't change the furniture. A screen's own name lives
/// underneath it, in the content, via `PageHeading`.
struct AppTopBarModifier: ViewModifier {
    @Environment(AppCopy.self) private var copy

    @State private var showingBasket = false
    @State private var showingAccount = false

    func body(content: Content) -> some View {
        content
            .navigationTitle(copy.shopName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { AppIconBadge() }
                    .sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .topBarTrailing) {
                    ShopChrome(openBasket: { showingBasket = true },
                               openAccount: { showingAccount = true })
                }
                // No shared glass container around the items — the pill and the
                // basket carry their own backgrounds.
                .sharedBackgroundVisibility(.hidden)
            }
            .sheet(isPresented: $showingBasket) {
                NavigationStack { BasketView() }
            }
            .sheet(isPresented: $showingAccount) { AccountSheet() }
    }
}

extension View {
    /// App icon, shop name, points pill and basket — on every screen.
    func appTopBar() -> some View { modifier(AppTopBarModifier()) }
}

/// A screen's own name, sitting under the bar rather than in it.
struct PageHeading: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.largeTitle.bold())
                .lineLimit(2)
                .minimumScaleFactor(0.7)

            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}
