import SwiftUI

/// A round remote image with a sensible placeholder — profile photos, basket
/// thumbnails, anything small and circular.
struct Avatar: View {
    let url: URL?
    var size: CGFloat = 28
    var fallbackSymbol: String = "person.fill"
    /// Set when the avatar sits on a fixed-colour background rather than the
    /// page. `.secondary` follows the colour scheme, which is wrong on the
    /// points pill: in light mode it renders a dark glyph on dark teal and
    /// disappears.
    var onDarkBackground: Bool = false

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(.circle)
    }

    private var placeholder: some View {
        ZStack {
            (onDarkBackground ? Color.white.opacity(0.18) : Color.secondary.opacity(0.2))
            Image(systemName: fallbackSymbol)
                .font(.system(size: size * 0.5))
                .foregroundStyle(onDarkBackground ? AnyShapeStyle(Color.white.opacity(0.85))
                                                  : AnyShapeStyle(HierarchicalShapeStyle.secondary))
        }
    }
}

/// The app icon, top-left. Drop `app_icon.png` (or .webp/.jpg) into Resources
/// and it appears — same loader as the derby sprites, so no code change needed.
/// Until then it renders as a marked placeholder rather than an empty gap.
struct AppIconBadge: View {
    var body: some View {
        Group {
            if let icon = Sprites.image("app_icon") {
                icon.resizable().scaledToFill()
            } else {
                ZStack {
                    Palette.pill
                    Image(systemName: "app.dashed")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
        }
        // Matches the basket circle exactly, and the standard toolbar insets
        // mirror it to the same distance from the edge.
        .frame(width: PointsPill.height, height: PointsPill.height)
        .clipShape(.circle)
        .accessibilityHidden(true)
    }
}

/// The points pill: profile photo and balance, in the web app's dark teal.
struct PointsPill: View {
    @Environment(SessionStore.self) private var session

    static let height: CGFloat = 38

    /// Tapping the photo opens the account sheet.
    var onTapAvatar: (() -> Void)?

    var body: some View {
        HStack(spacing: 8) {
            Avatar(url: session.account?.photo, size: Self.height - 8,
                   onDarkBackground: true)
                .onTapGesture { onTapAvatar?() }
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel("Your account")

            // Monospaced digits stop the number twitching as it ticks.
            Text("\(session.pointsBalance.formatted()) pts")
                .font(.system(size: 15, weight: .semibold).monospacedDigit())
                .foregroundStyle(.white)
                .lineLimit(1)
                .contentTransition(.numericText())
                .animation(.snappy, value: session.pointsBalance)
        }
        .padding(.leading, 4)
        .padding(.trailing, 14)
        .frame(height: Self.height)
        .background(Palette.pill, in: .capsule)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(session.pointsBalance) points")
    }
}

/// The pink circle beside the pill — opens the basket, with a count badge.
struct BasketButton: View {
    @Environment(BasketStore.self) private var basket
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "basket.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: PointsPill.height, height: PointsPill.height)
                .background(Palette.basket, in: .circle)
                .overlay(alignment: .topTrailing) {
                    if basket.itemCount > 0 {
                        Text("\(min(basket.itemCount, 99))")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(Palette.basket)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(.white, in: .capsule)
                            .offset(x: 5, y: -4)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(basket.itemCount > 0
                            ? "Basket, \(basket.itemCount) item\(basket.itemCount == 1 ? "" : "s")"
                            : "Basket, empty")
        .animation(.snappy, value: basket.itemCount)
    }
}

/// Pill + cart, the pair that sits in the top-right of every shop screen.
struct ShopChrome: View {
    let openBasket: () -> Void
    var openAccount: (() -> Void)?

    var body: some View {
        // The circle sits apart from the pill, as it does on the web.
        HStack(spacing: 8) {
            PointsPill(onTapAvatar: openAccount)
            BasketButton(action: openBasket)
        }
    }
}
