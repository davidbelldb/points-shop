import SwiftUI

struct BasketView: View {
    @Environment(SessionStore.self) private var session
    @Environment(BasketStore.self) private var basket
    @Environment(AppCopy.self) private var copy
    @Environment(\.dismiss) private var dismiss

    @State private var notes = ""
    @State private var placedOrder: Order?

    private var affordable: Bool { session.pointsBalance >= basket.basket.totalPoints }

    var body: some View {
        Group {
            if let placedOrder {
                OrderConfirmationView(order: placedOrder) { dismiss() }
            } else if basket.basket.isEmpty {
                ContentUnavailableView(
                    copy.basketLabel.capitalisedFirst,
                    systemImage: "cart",
                    description: Text(copy.basketEmptyText)
                )
            } else {
                contents
            }
        }
        .navigationTitle(placedOrder == nil ? copy.basketTitle(for: session.account?.displayName) : "Done")
        .navigationBarTitleDisplayMode(.inline)
        // Opens at half height and can be dragged up for a long list or the
        // delivery and notes sections. Set here rather than at each call site
        // so it behaves the same wherever the basket is opened from.
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
        .appTheme()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Close") { dismiss() }
            }
        }
        .task {
            await basket.refresh()
            notes = basket.basket.notes ?? ""
        }
    }

    private var contents: some View {
        List {
            Section {
                ForEach(basket.basket.items) { item in
                    BasketRow(item: item)
                }
            }

            if !basket.deliveryOptions.isEmpty {
                Section("Delivery") {
                    ForEach(basket.deliveryOptions) { option in
                        Button {
                            Task { await basket.chooseDelivery(option) }
                        } label: {
                            HStack {
                                Text(option.name)
                                Spacer()
                                Text(option.points == 0 ? "Free" : "\(option.points) pts")
                                    .foregroundStyle(.secondary)
                                if basket.basket.delivery?.id == option.id {
                                    Image(systemName: "checkmark").foregroundStyle(.tint)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Section("Anything to add?") {
                TextField("A note with your order", text: $notes, axis: .vertical)
                    .lineLimit(1...4)
                    .onSubmit { Task { await basket.setNotes(notes) } }
            }

            Section {
                summaryRow("Items", basket.basket.subtotalPoints)
                if basket.basket.discountPoints > 0 {
                    summaryRow("Discount", -basket.basket.discountPoints)
                }
                if basket.basket.deliveryPoints > 0 {
                    summaryRow("Delivery", basket.basket.deliveryPoints)
                }
                HStack {
                    Text("Total").font(.headline)
                    Spacer()
                    Text("\(basket.basket.totalPoints) pts").font(.headline)
                }

                if !affordable {
                    Label(
                        "You need \(basket.basket.totalPoints - session.pointsBalance) more points for this.",
                        systemImage: "exclamationmark.circle"
                    )
                    .font(.footnote)
                    .foregroundStyle(.orange)
                }

                if let error = basket.errorMessage {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    Task {
                        await basket.setNotes(notes)
                        if let order = await basket.placeOrder() {
                            placedOrder = order
                            await session.refresh()
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if basket.isWorking {
                            ProgressView()
                        } else {
                            Text(copy.checkoutLabel).font(.headline)
                        }
                        Spacer()
                    }
                    .frame(height: 30)
                }
                .disabled(!affordable || basket.isWorking)
            }
        }
    }

    private func summaryRow(_ label: String, _ points: Int) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text("\(points) pts").foregroundStyle(.secondary)
        }
        .font(.subheadline)
    }
}

private struct BasketRow: View {
    let item: BasketItem
    @Environment(BasketStore.self) private var basket

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: item.thumbnail, size: 52, fallbackSymbol: "gift")
                .clipShape(.rect(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).font(.subheadline.weight(.medium)).lineLimit(2)
                Text("\(item.pricePoints) pts each").font(.caption).foregroundStyle(.secondary)
            }

            Spacer(minLength: 4)

            VStack(alignment: .trailing, spacing: 4) {
                Text("\(item.lineTotal) pts").font(.subheadline.weight(.semibold))
                Stepper(
                    value: Binding(
                        get: { item.qty },
                        set: { newValue in Task { await basket.setQuantity(newValue, for: item) } }
                    ),
                    in: 0...max(1, item.stockQty)
                ) {
                    Text("\(item.qty)").font(.caption.monospacedDigit())
                }
                .labelsHidden()
                .fixedSize()
            }
        }
        .padding(.vertical, 2)
        .swipeActions {
            Button("Remove", role: .destructive) {
                Task { await basket.remove(item) }
            }
        }
    }
}

struct OrderConfirmationView: View {
    let order: Order
    let onDone: () -> Void

    @Environment(AppCopy.self) private var copy

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.green)

            Text(copy.orderDoneText)
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)

            VStack(spacing: 6) {
                ForEach(order.items) { item in
                    HStack {
                        Text("\(item.qty) × \(item.productName)")
                        Spacer()
                        Text("\(item.lineTotalPoints) pts").foregroundStyle(.secondary)
                    }
                    .font(.subheadline)
                }
                Divider()
                HStack {
                    Text("Paid").font(.headline)
                    Spacer()
                    Text("\(order.totalPoints) pts").font(.headline)
                }
            }
            .padding()
            .background(.background.secondary, in: .rect(cornerRadius: 14))

            if let delivery = order.deliveryName {
                Text(delivery).font(.footnote).foregroundStyle(.secondary)
            }

            Spacer()

            Button(action: onDone) {
                Text("Lovely").font(.headline).frame(maxWidth: .infinity, minHeight: 46)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(20)
    }
}
