import SwiftUI

/// The Games tab — everything playable this account can reach.
///
/// Entries are driven by the server's feature list, so a kids account sees only
/// the games switched on for it and nothing has to be hardcoded per audience.
struct GamesHubView: View {
    @Environment(FeatureStore.self) private var features

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                PageHeading(title: "Games", subtitle: "Everything you can play.")
                    .padding(.bottom, 2)

                if features.has(.duckyDerby) {
                    NavigationLink {
                        DerbyView()
                    } label: {
                        GameCard(
                            title: "Ducky Derby",
                            subtitle: "Pick a duck, place your points, watch them race.",
                            symbol: "flag.checkered",
                            tint: Color(hex: "#4aa3c7")
                        )
                    }
                    .buttonStyle(.plain)
                }

                if features.has(.shutTheBox) {
                    GameCard(
                        title: "Shut the Box",
                        subtitle: "Coming to the app soon.",
                        symbol: "dice.fill",
                        tint: Color(hex: "#15b8a6"),
                        isComingSoon: true
                    )
                }

                if !features.has(.duckyDerby) && !features.has(.shutTheBox) {
                    ContentUnavailableView(
                        "No games yet",
                        systemImage: "gamecontroller",
                        description: Text("Check back soon.")
                    )
                    .padding(.top, 40)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .appTopBar()
    }
}

struct GameCard: View {
    let title: String
    let subtitle: String
    let symbol: String
    let tint: Color
    var isComingSoon: Bool = false

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                tint.opacity(0.22)
                Image(systemName: symbol)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(tint)
            }
            .frame(width: 58, height: 58)
            .clipShape(.rect(cornerRadius: 14))

            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
            }

            Spacer(minLength: 0)

            if !isComingSoon {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: .rect(cornerRadius: 16))
        .opacity(isComingSoon ? 0.55 : 1)
    }
}
