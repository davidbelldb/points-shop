import SwiftUI

/// A duck's artwork at an arbitrary size, falling back to its admin colours if
/// the sprite is missing.
struct DuckBadge: View {
    let duck: Duck
    let night: Bool
    var width: CGFloat = 38
    var height: CGFloat = 32

    var body: some View {
        Group {
            if let image = Sprites.duck(ord: duck.ord, night: night) {
                image.resizable().scaledToFit()
            } else {
                ZStack(alignment: .trailing) {
                    Capsule().fill(Color(hex: duck.duckColour ?? "#f5c542"))
                    Capsule()
                        .fill(Color(hex: duck.billColour ?? "#e8912d"))
                        .frame(width: width * 0.28, height: height * 0.28)
                        .offset(x: width * 0.1)
                }
            }
        }
        .frame(width: width, height: height)
    }
}

/// The two-line commentary ticker under the track. Lines are derived from the
/// clock, so nothing has to be pushed into it.
struct CommentaryTicker: View {
    let model: DerbyViewModel
    let night: Bool

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.15)) { timeline in
            let elapsed = max(0, timeline.date.timeIntervalSince(model.phaseStartedAt) * 1000)
            let line = model.isRacing
                ? model.visibleCommentary(atRealElapsed: elapsed).last
                : model.visibleIntro(atElapsed: elapsed).last

            ZStack {
                if let line {
                    Text(line.text)
                        .font(.system(size: 13, weight: .semibold))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.85)
                        .foregroundStyle(night ? Color(hex: "#7dd8e8") : Color(hex: "#111827"))
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity)
                        .id(line.id)
                        .transition(.asymmetric(
                            insertion: .move(edge: .bottom).combined(with: .opacity),
                            removal: .move(edge: .top).combined(with: .opacity)
                        ))
                }
            }
            .frame(height: 38)
            .frame(maxWidth: .infinity)
            .animation(.easeOut(duration: 0.35), value: line?.id)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(line?.text ?? "Commentary")
            .accessibilityAddTraits(.updatesFrequently)
        }
        .background(night ? Color(hex: "#0d1f2d") : Color(hex: "#f0fdfa"),
                    in: .rect(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(night ? Color(hex: "#2a5a6a") : Color(hex: "#2dd4bf"))
        }
    }
}

/// 3 · 2 · 1 · GO! over the track.
struct CountdownOverlay: View {
    let model: DerbyViewModel

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.05)) { timeline in
            let elapsed = max(0, timeline.date.timeIntervalSince(model.phaseStartedAt) * 1000)
            let text = model.countdownText(at: elapsed)
            let step = elapsed.truncatingRemainder(dividingBy: DerbyViewModel.countdownStepMs)
                / DerbyViewModel.countdownStepMs

            Text(text)
                .opacity(elapsed < DerbyViewModel.countdownDurationMs ? 1 : 0)
                .font(.system(size: 62, weight: .heavy, design: .default))
                .italic()
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.5), radius: 12, y: 3)
                // Punches in large and settles, like the web app's ddcount.
                .scaleEffect(1.9 - 0.9 * min(1, step / 0.35))
                .opacity(min(1, step / 0.35) * 0.95 + 0.05)
        }
        .allowsHitTesting(false)
    }
}

/// Pick your duck — two per row, with odds.
struct DuckPicker: View {
    let model: DerbyViewModel
    let night: Bool

    private let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Pick your duck").font(.subheadline.weight(.semibold))

            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(model.ducks) { duck in
                    Button {
                        model.pick(duck.ord)
                    } label: {
                        HStack(spacing: 8) {
                            DuckBadge(duck: duck, night: night)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(duck.name)
                                    .font(.caption.weight(.medium))
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.8)
                                Text(duck.oddsLabel)
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(background(for: duck), in: .rect(cornerRadius: 12))
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(border(for: duck), lineWidth: model.pickedOrd == duck.ord ? 2 : 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(model.phase != .betting)
                    .accessibilityLabel("\(duck.name), odds \(duck.oddsNum) to \(duck.oddsDen)")
                    .accessibilityAddTraits(model.pickedOrd == duck.ord ? [.isSelected] : [])
                }
            }
        }
    }

    private func background(for duck: Duck) -> Color {
        guard model.pickedOrd == duck.ord else {
            return night ? Color(hex: "#262626") : .white
        }
        return night ? Color(hex: "#831843").opacity(0.3) : Color(hex: "#fdf2f8")
    }

    private func border(for duck: Duck) -> Color {
        guard model.pickedOrd == duck.ord else {
            return night ? Color(hex: "#404040") : Palette.cardBorder
        }
        return Color(hex: "#ec4899")
    }
}

/// Recent finishing positions per duck — 1 = won, 2+ = placed, D = sank.
struct FormGuide: View {
    let model: DerbyViewModel
    let night: Bool

    var body: some View {
        if !model.form.isEmpty, !model.ducks.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Form guide").font(.subheadline.weight(.semibold))

                VStack(spacing: 0) {
                    ForEach(Array(model.ducks.enumerated()), id: \.element.ord) { index, duck in
                        if index > 0 { Divider() }
                        Button {
                            model.pick(duck.ord)
                        } label: {
                            row(for: duck)
                        }
                        .buttonStyle(.plain)
                        .disabled(model.phase != .betting)
                    }
                }
                .background(night ? Color(hex: "#262626") : .white, in: .rect(cornerRadius: 12))
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(night ? Color(hex: "#404040") : Palette.cardBorder)
                }
            }
        }
    }

    private func row(for duck: Duck) -> some View {
        let form = model.form[duck.ord] ?? DuckForm()

        return HStack(spacing: 8) {
            DuckBadge(duck: duck, night: night, width: 28, height: 24)
            Text(duck.name).font(.caption.weight(.medium)).lineLimit(2).minimumScaleFactor(0.8)
            Text(duck.oddsLabel).font(.caption2.weight(.bold)).foregroundStyle(.secondary)

            Spacer(minLength: 4)

            if form.recent.isEmpty {
                Text("No runs yet").font(.caption2).foregroundStyle(.tertiary)
            } else {
                HStack(spacing: 3) {
                    ForEach(Array(form.recent.reversed().enumerated()), id: \.offset) { _, place in
                        let colours = Palette.placing(place, night: night)
                        Text(place == 0 ? "D" : "\(place)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(colours.foreground)
                            .frame(width: 20, height: 20)
                            .background(colours.background, in: .rect(cornerRadius: 5))
                    }
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            model.pickedOrd == duck.ord
                ? Color(hex: "#ec4899").opacity(night ? 0.22 : 0.10)
                : Color.clear
        )
        .contentShape(.rect)
    }
}

/// The stake field and the button that starts the race.
struct BetBar: View {
    let model: DerbyViewModel
    let onRace: () -> Void

    @FocusState private var stakeFocused: Bool

    /// Field and button share these so neither looks stunted next to the other.
    private static let controlHeight: CGFloat = 46
    private static let controlRadius: CGFloat = 12

    var body: some View {
        VStack(spacing: 8) {
            if let error = model.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !model.hasFunds {
                Text("You need at least 2 points to place a bet, you peasant. Come back when you can afford it…")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color(hex: "#92400e"))
                    .multilineTextAlignment(.center)
            } else if model.phase == .betting {
                if !model.stakePresets.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(model.stakePresets, id: \.self) { preset in
                            StakeChip(label: "\(preset)", isSelected: model.stakeText == "\(preset)") {
                                model.setStake(preset)
                            }
                        }
                        StakeChip(label: "Max", isSelected: model.stakeText == "\(model.balance)") {
                            model.setStake(model.balance)
                        }
                        Spacer(minLength: 0)
                    }
                }

                HStack(spacing: 10) {
                    // The label lives in the field as placeholder text, so the
                    // field and the button can share one height.
                    TextField("Stake (max \(model.balance))", text: Binding(
                        get: { model.stakeText },
                        set: { model.stakeText = $0.filter(\.isNumber) }
                    ))
                    .keyboardType(.numberPad)
                    .focused($stakeFocused)
                    .font(.subheadline)
                    .padding(.horizontal, 14)
                    .frame(height: Self.controlHeight)
                    .background(.background.secondary, in: .rect(cornerRadius: Self.controlRadius))

                    // Drawn by hand rather than .borderedProminent: that style
                    // adds its own padding around the label, which made the
                    // button noticeably taller than the field beside it.
                    Button {
                        stakeFocused = false
                        onRace()
                    } label: {
                        Text(buttonTitle)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color(hex: "#451a03"))
                            .padding(.horizontal, 16)
                            .frame(height: Self.controlHeight)
                            .background(
                                Color(hex: "#fbbf24").opacity(model.canPlaceBet ? 1 : 0.35),
                                in: .rect(cornerRadius: Self.controlRadius)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(!model.canPlaceBet)
                }
            } else {
                Text("Race in progress…")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: Self.controlHeight)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(.bar)
    }

    private var buttonTitle: String {
        model.canPlaceBet ? "Race to win \(model.potentialReturn)" : "Place bet & race"
    }
}

/// A one-tap stake preset.
private struct StakeChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Color(hex: "#fbbf24") : Color.secondary.opacity(0.16),
                            in: .capsule)
                .foregroundStyle(isSelected ? Color(hex: "#451a03") : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Stake \(label)")
    }
}

/// The card that drops in when the race is done.
struct RaceResultCard: View {
    let model: DerbyViewModel
    let night: Bool
    let onRaceAgain: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.4).ignoresSafeArea()

            VStack(spacing: 0) {
                if let result = model.result, let winner = result.duck(result.winnerOrd) {
                    DuckBadge(duck: winner, night: night, width: 104, height: 92)
                }

                Text(model.resultHeadline)
                    .font(.caption.weight(.semibold))
                    .kerning(2)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)

                Text(model.resultAmount)
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(model.result?.won == true ? Color(hex: "#059669") : Color(hex: "#ec4899"))
                    .padding(.top, 6)

                Text(model.resultDetail)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(12)
                    .frame(maxWidth: .infinity)
                    .background(.background.secondary, in: .rect(cornerRadius: 12))
                    .padding(.top, 14)

                Text("Balance: \(model.balance) pts")
                    .font(.subheadline)
                    .padding(.top, 12)

                Button(action: onRaceAgain) {
                    Text("Race again")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 46)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(hex: "#fbbf24"))
                .foregroundStyle(Color(hex: "#451a03"))
                .disabled(model.isBusy)
                .padding(.top, 18)
            }
            .padding(22)
            .background(.background, in: .rect(cornerRadius: 26))
            .padding(.horizontal, 28)
            .shadow(radius: 30)
        }
        .transition(.opacity)
    }
}
