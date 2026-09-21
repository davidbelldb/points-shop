import SwiftUI

struct ProductDetailView: View {
    let product: Product

    @Environment(SessionStore.self) private var session
    @Environment(BasketStore.self) private var basket
    @Environment(AppCopy.self) private var copy

    @State private var detail: Product?
    @State private var qty = 1
    @State private var justAdded = false

    private var shown: Product { detail ?? product }
    private var affordable: Bool { session.pointsBalance >= shown.pricePoints }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                gallery

                VStack(alignment: .leading, spacing: 8) {
                    PageHeading(title: shown.name)

                    HStack(spacing: 10) {
                        Text("\(shown.pricePoints) pts")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(Color(hex: "#059669"))

                        Text(shown.availability)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                (shown.inStock ? Color.green : Color.orange).opacity(0.16),
                                in: .capsule
                            )
                            .foregroundStyle(shown.inStock ? Color.green : Color.orange)
                    }

                    if let description = shown.description, !description.isEmpty {
                        Text(description)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .padding(.top, 4)
                    }

                    if !affordable && shown.inStock {
                        Label(
                            "That's \(shown.pricePoints - session.pointsBalance) points more than you have.",
                            systemImage: "info.circle"
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.top, 6)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .appTopBar()
        .safeAreaInset(edge: .bottom) { addBar }
        .task {
            // The grid's payload has no media; fetch the full record.
            detail = try? await APIClient.shared.get("/products/\(product.id)", as: Product.self)
        }
    }

    private var gallery: some View {
        TabView {
            ForEach(images, id: \.self) { url in
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().scaledToFit()
                    case .empty: ProgressView()
                    default: Image(systemName: "photo").font(.largeTitle).foregroundStyle(.tertiary)
                    }
                }
            }
        }
        .tabViewStyle(.page)
        .frame(height: 300)
        .background(.background.secondary, in: .rect(cornerRadius: 16))
    }

    /// Thumbnail first, then any image media. Videos are listed in the API but
    /// need a player — they're skipped here rather than shown broken.
    private var images: [URL] {
        var urls: [URL] = []
        if let thumb = shown.thumbnail { urls.append(thumb) }
        for item in shown.media.sorted(by: { $0.sortOrder < $1.sortOrder }) where !item.isVideo {
            if let url = item.url, !urls.contains(url) { urls.append(url) }
        }
        return urls
    }

    private var addBar: some View {
        VStack(spacing: 10) {
            if let error = basket.errorMessage {
                Text(error).font(.footnote).foregroundStyle(.red)
            }

            HStack(spacing: 12) {
                Stepper(value: $qty, in: 1...max(1, shown.stockQty)) {
                    Text("Qty \(qty)").font(.subheadline.weight(.medium))
                }
                .fixedSize()
                .disabled(!shown.inStock)

                Button {
                    Task {
                        await basket.add(shown, qty: qty)
                        justAdded = true
                        try? await Task.sleep(for: .seconds(2))
                        justAdded = false
                    }
                } label: {
                    Text(justAdded ? "Added" : copy.basketAddLabel)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color(hex: "#451a03"))
                        .frame(maxWidth: .infinity)
                        .frame(height: 46)
                        .background(
                            Color(hex: "#fbbf24").opacity(shown.inStock ? 1 : 0.35),
                            in: .rect(cornerRadius: 12)
                        )
                }
                .buttonStyle(.plain)
                .disabled(!shown.inStock || basket.isWorking)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(.bar)
        .animation(.snappy, value: justAdded)
    }
}
