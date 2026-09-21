import SwiftUI

/// The home of the shop: hero copy from settings, then the product grid.
/// Which products arrive is the server's business — this account sees its own
/// audience's items plus anything marked for everyone.
struct ShopView: View {
    @Environment(SessionStore.self) private var session
    @Environment(BasketStore.self) private var basket
    @Environment(AppCopy.self) private var copy

    @State private var products: [Product] = []
    @State private var sort: SortOrder = .newest
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showingBasket = false
    @State private var showingAccount = false

    enum SortOrder: String, CaseIterable, Identifiable {
        case newest, cheapest, dearest, name

        var id: String { rawValue }
        var title: String {
            switch self {
            case .newest: "New first"
            case .cheapest: "Cheapest"
            case .dearest: "Dearest"
            case .name: "A–Z"
            }
        }
    }

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                hero

                if isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if let errorMessage {
                    ContentUnavailableView {
                        Label("Can't load the shop", systemImage: "wifi.slash")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else if products.isEmpty {
                    ContentUnavailableView(
                        "Nothing here yet",
                        systemImage: "bag",
                        description: Text("New things will turn up soon.")
                    )
                    .padding(.top, 30)
                } else {
                    productsSection
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
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
        .task {
            await load()
            await basket.refresh()
        }
        .refreshable {
            await load()
            await basket.refresh()
        }
    }

    private var hero: some View {
        VStack(spacing: 4) {
            Text(copy.heroTitle)
                .font(.title2.weight(.bold))
                .multilineTextAlignment(.center)
            if !copy.heroSubtitle.isEmpty {
                Text(copy.heroSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
    }

    private var productsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(copy.productsTitle).font(.title3.weight(.bold))
                Spacer()
                Picker("Sort", selection: $sort) {
                    ForEach(SortOrder.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.menu)
                .font(.caption)
            }

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(sorted) { product in
                    NavigationLink {
                        ProductDetailView(product: product)
                    } label: {
                        ProductCard(product: product)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var sorted: [Product] {
        switch sort {
        case .newest: products                       // the API already returns newest first
        case .cheapest: products.sorted { $0.pricePoints < $1.pricePoints }
        case .dearest: products.sorted { $0.pricePoints > $1.pricePoints }
        case .name: products.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            products = try await APIClient.shared.get("/products", as: [Product].self)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}

/// One tile in the grid.
struct ProductCard: View {
    let product: Product

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                Color.secondary.opacity(0.12)
                if let url = product.thumbnail {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image): image.resizable().scaledToFill()
                        case .empty: ProgressView()
                        default: Image(systemName: "photo").foregroundStyle(.tertiary)
                        }
                    }
                } else {
                    Image(systemName: "gift").font(.largeTitle).foregroundStyle(.tertiary)
                }

                if !product.inStock {
                    Color.black.opacity(0.45)
                    Text("Back soon")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                }
            }
            .frame(height: 140)
            .clipped()

            VStack(alignment: .leading, spacing: 3) {
                Text(product.name)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text("\(product.pricePoints) pts")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color(hex: "#059669"))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
        }
        .background(.background.secondary, in: .rect(cornerRadius: 14))
        .clipShape(.rect(cornerRadius: 14))
    }
}
