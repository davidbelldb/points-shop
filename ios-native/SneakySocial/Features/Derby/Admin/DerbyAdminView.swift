import SwiftUI

/// Root of the derby admin plane — race settings inline, everything else behind
/// a link so the phone isn't asked to render 84 editable rows at once.
struct DerbyAdminView: View {
    @State private var model: DerbyAdminViewModel
    let onChange: (DuckyConfig) -> Void

    init(config: DuckyConfig?, onChange: @escaping (DuckyConfig) -> Void) {
        _model = State(initialValue: DerbyAdminViewModel(config: config))
        self.onChange = onChange
    }

    var body: some View {
        Group {
            if model.config == nil {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Form {
                    if let error = model.errorMessage {
                        Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.red) }
                    }

                    Section {
                        Picker("Editing", selection: Binding(
                            get: { model.variant },
                            set: { newValue in Task { await model.select(newValue) } }
                        )) {
                            ForEach(DuckyVariant.allCases) { variant in
                                Text(variant.title).tag(variant)
                            }
                        }
                        .pickerStyle(.segmented)
                    } header: {
                        Text("Content set")
                    } footer: {
                        Text(model.variant == .kids
                             ? "What this app shows. The Capacitor app keeps the original."
                             : "What the Capacitor app shows. This app plays the kid-friendly set.")
                    }

                    RaceSettingsSection(model: model)

                    Section {
                        NavigationLink {
                            DuckListView(model: model)
                        } label: {
                            LabeledContent("Ducks", value: "\(model.ducks.filter(\.active).count) racing")
                        }
                        .badge(Text("shared"))

                        ForEach(DuckyTextList.allCases) { list in
                            NavigationLink {
                                TextRowListView(model: model, list: list)
                            } label: {
                                LabeledContent(list.title, value: activeCount(for: list))
                            }
                        }
                    } header: {
                        Text("Content")
                    }
                }
            }
        }
        .navigationTitle("Ducky Derby")
        .navigationBarTitleDisplayMode(.inline)
        .animation(.default, value: model.variant)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if model.isSaving {
                    ProgressView()
                } else if let savedAt = model.lastSavedAt, Date.now.timeIntervalSince(savedAt) < 2 {
                    Label("Saved", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.caption)
                }
            }
        }
        .task { if model.config == nil { await model.load() } }
        .onChange(of: model.config) { _, config in
            // Keep the race screen in step with whatever was just saved.
            if let config { onChange(config) }
        }
    }

    private func activeCount(for list: DuckyTextList) -> String {
        guard let config = model.config else { return "—" }
        let rows = list.rows(in: config)
        return "\(rows.filter(\.isUsable).count)/\(rows.count)"
    }
}

// MARK: - Race settings

private struct RaceSettingsSection: View {
    let model: DerbyAdminViewModel

    @State private var water = ""
    @State private var grass = ""
    @State private var mud = ""
    @State private var buoy = ""
    @State private var duckCount = 10
    @State private var buoyCount = 4
    @State private var icebergCount = 3
    @State private var icebergSizeMin = 2
    @State private var icebergSizeMax = 7
    @State private var validationError: String?

    private var icebergsEnabled: Bool { icebergCount > 0 }

    var body: some View {
        Section {
            HexColourField(label: "Water", hex: $water)
            HexColourField(label: "Grass", hex: $grass)
            HexColourField(label: "Mud", hex: $mud)
            HexColourField(label: "Buoy", hex: $buoy)

            Picker("Ducks per race", selection: $duckCount) {
                ForEach(2...10, id: \.self) { Text("\($0)").tag($0) }
            }

            Picker("Buoys per race", selection: $buoyCount) {
                Text("Off").tag(0)
                ForEach([1, 2, 3, 4, 5, 6, 8, 10, 12], id: \.self) { Text("\($0)").tag($0) }
            }

            Picker("Icebergs per race", selection: $icebergCount) {
                Text("Off").tag(0)
                ForEach(1...10, id: \.self) { Text("\($0)").tag($0) }
            }

            Picker("Iceberg size — min", selection: $icebergSizeMin) {
                ForEach(1...10, id: \.self) { Text("\($0)").tag($0) }
            }
            .disabled(!icebergsEnabled)

            Picker("Iceberg size — max", selection: $icebergSizeMax) {
                ForEach(1...10, id: \.self) { Text("\($0)").tag($0) }
            }
            .disabled(!icebergsEnabled)

            if let validationError {
                Text(validationError).font(.footnote).foregroundStyle(.red)
            }

            Button("Save race settings", action: save)
                .disabled(model.isSaving)
        } header: {
            Text("Race")
        } footer: {
            Text("Shared by both content sets \u{2014} the scene and the field are the same race. Colours apply to day races; night races use their own fixed palette.")
        }
        .onAppear(perform: fill)
        .onChange(of: icebergSizeMin) { _, value in
            if value > icebergSizeMax { icebergSizeMax = value }
        }
        .onChange(of: icebergSizeMax) { _, value in
            if value < icebergSizeMin { icebergSizeMin = value }
        }
    }

    private func fill() {
        guard let config = model.config else { return }
        water = config.waterColour ?? "#4aa3c7"
        grass = config.grassColour ?? "#5bbf3a"
        mud = config.mudColour ?? "#6b4a2a"
        buoy = config.buoyColour ?? "#e0322e"
        duckCount = min(10, max(2, config.raceDuckCount))
        buoyCount = config.buoyCount
        icebergCount = config.icebergEnabled ? config.icebergCount : 0
        icebergSizeMin = config.icebergSizeMin
        icebergSizeMax = config.icebergSize
    }

    private func save() {
        validationError = DerbyAdminViewModel.validateRaceSettings(
            water: water, grass: grass, mud: mud, buoy: buoy
        )
        guard validationError == nil else { return }

        let patch = DuckyConfigPatch(
            waterColour: water,
            grassColour: grass,
            mudColour: mud,
            buoyColour: buoy,
            raceDuckCount: duckCount,
            buoyCount: buoyCount,
            icebergEnabled: icebergsEnabled,
            icebergSize: icebergSizeMax,
            icebergSizeMin: icebergSizeMin,
            icebergCount: icebergCount
        )
        Task { await model.saveRaceSettings(patch) }
    }
}

/// Hex field with a swatch that doubles as a colour picker.
struct HexColourField: View {
    let label: String
    @Binding var hex: String

    private var colour: Color { Color(hex: HexColour.isValid(hex) ? hex : "#000000") }

    var body: some View {
        HStack(spacing: 10) {
            ColorPicker("", selection: Binding(
                get: { colour },
                set: { hex = HexColour.string(from: $0) }
            ), supportsOpacity: false)
            .labelsHidden()

            Text(label)

            Spacer()

            TextField("#rrggbb", text: $hex)
                .font(.system(.footnote, design: .monospaced))
                .multilineTextAlignment(.trailing)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .frame(width: 92)
                .foregroundStyle(HexColour.isValid(hex) ? Color.primary : Color.red)
        }
    }
}

// MARK: - Ducks

private struct DuckListView: View {
    let model: DerbyAdminViewModel

    var body: some View {
        List {
            ForEach(model.ducks) { duck in
                NavigationLink {
                    DuckEditorView(model: model, duck: duck)
                } label: {
                    HStack(spacing: 10) {
                        DuckBadge(duck: duck, night: false, width: 34, height: 28)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(duck.name)
                            Text(duck.oddsLabel).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(duck.active ? "Racing" : "Benched")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(duck.active ? Color.green.opacity(0.18) : Color.secondary.opacity(0.15),
                                        in: .capsule)
                            .foregroundStyle(duck.active ? Color.green : Color.secondary)
                    }
                }
            }
        }
        .navigationTitle("Ducks")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct DuckEditorView: View {
    let model: DerbyAdminViewModel
    let duck: Duck

    @State private var name = ""
    @State private var duckColour = ""
    @State private var billColour = ""
    @State private var oddsNum = ""
    @State private var oddsDen = ""
    @State private var validationError: String?

    var body: some View {
        Form {
            Section {
                TextField("Duck name", text: $name)
                HexColourField(label: "Body", hex: $duckColour)
                HexColourField(label: "Bill", hex: $billColour)
            } header: {
                Text("Duck \(duck.ord)")
            } footer: {
                Text("Colours are only used if the sprite is missing.")
            }

            Section("Odds") {
                HStack {
                    TextField("10", text: $oddsNum)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 60)
                    Text("/").font(.headline).foregroundStyle(.secondary)
                    TextField("1", text: $oddsDen)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.center)
                        .frame(width: 60)
                    Spacer()
                    Text(potentialLabel).font(.caption).foregroundStyle(.secondary)
                }
            }

            Section {
                Button(duck.active ? "Bench this duck" : "Put back in the race") {
                    Task { await model.toggleRacing(duck) }
                }
                .foregroundStyle(duck.active ? .red : .green)
            } footer: {
                Text("Benched ducks are left out of every lineup.")
            }

            if let validationError {
                Section { Text(validationError).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle(duck.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Save", action: save).disabled(model.isSaving)
            }
        }
        .onAppear {
            name = duck.name
            duckColour = duck.duckColour ?? "#ffd23f"
            billColour = duck.billColour ?? "#e8912d"
            oddsNum = "\(duck.oddsNum)"
            oddsDen = "\(duck.oddsDen)"
        }
    }

    private var potentialLabel: String {
        guard let num = Int(oddsNum), let den = Int(oddsDen), den > 0 else { return "" }
        let multiplier = Double(num) / Double(den) + 1
        return "100 pts returns \(Int((100 * multiplier).rounded()))"
    }

    private func save() {
        validationError = DerbyAdminViewModel.validateDuck(
            duckColour: duckColour, billColour: billColour,
            oddsNum: Int(oddsNum), oddsDen: Int(oddsDen)
        )
        guard validationError == nil else { return }

        let patch = DuckPatch(
            name: name,
            duckColour: duckColour,
            billColour: billColour,
            oddsNum: Int(oddsNum),
            oddsDen: Int(oddsDen)
        )
        Task { await model.saveDuck(ord: duck.ord, patch) }
    }
}

// MARK: - Text lists

private struct TextRowListView: View {
    let model: DerbyAdminViewModel
    let list: DuckyTextList

    var body: some View {
        List {
            Section {
                ForEach(rows) { row in
                    TextRowEditor(model: model, list: list, row: row)
                }
            } footer: {
                if let footnote = list.footnote { Text(footnote) }
            }
        }
        .navigationTitle(list.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var rows: [DuckyTextRow] {
        guard let config = model.config else { return [] }
        return list.rows(in: config)
    }
}

private struct TextRowEditor: View {
    let model: DerbyAdminViewModel
    let list: DuckyTextList
    let row: DuckyTextRow

    @State private var text = ""
    @State private var placement = "top"

    private var isDirty: Bool {
        text != row.text || (list.isBanner && placement != (row.placement ?? "top"))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(list.rowLabel) \(row.ord)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    Task { await model.toggleActive(list, row: row) }
                } label: {
                    Text(row.active ? "Active" : "Inactive")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(row.active ? Color.green.opacity(0.18) : Color.secondary.opacity(0.15),
                                    in: .capsule)
                        .foregroundStyle(row.active ? Color.green : Color.secondary)
                }
                .buttonStyle(.plain)
            }

            TextField(list.isBanner ? "Banner text" : "Message text", text: $text, axis: .vertical)
                .lineLimit(1...3)

            if list.isBanner {
                Picker("Bank", selection: $placement) {
                    Text("Top bank").tag("top")
                    Text("Bottom bank").tag("bottom")
                }
                .pickerStyle(.segmented)
            }

            if isDirty {
                Button("Save") {
                    Task {
                        await model.saveRow(
                            list, ord: row.ord,
                            TextRowPatch(text: text, placement: list.isBanner ? placement : nil)
                        )
                    }
                }
                .font(.footnote.weight(.semibold))
                .disabled(model.isSaving)
            }
        }
        .padding(.vertical, 4)
        .onAppear {
            text = row.text
            placement = row.placement ?? "top"
        }
    }
}
