import SwiftUI

struct DerbyView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @Environment(DerbyConfigBroadcast.self) private var derbyConfig
    @State private var model = DerbyViewModel()
    @State private var showingAccount = false

    private var night: Bool { colorScheme == .dark }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView("Saddling the ducks…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                ContentUnavailableView {
                    Label("The derby is closed", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await model.load() } }
                        .buttonStyle(.borderedProminent)
                }
            default:
                raceDay
            }
        }
        .navigationTitle("Ducky Derby")
        .navigationBarTitleDisplayMode(.inline)
        // Pushed from the Games hub, so it gets a back button rather than the
        // app icon in the leading slot.
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                PointsPill(onTapAvatar: { showingAccount = true })
            }
            .sharedBackgroundVisibility(.hidden)
        }
        .overlay {
            if model.phase == .result {
                RaceResultCard(model: model, night: night) {
                    Task { await model.load() }
                }
            }
        }
        .sheet(isPresented: $showingAccount) { AccountSheet() }
        .animation(.easeOut(duration: 0.25), value: model.phase)
        .task {
            model.isNight = night
            model.reduceMotion = reduceMotion
            SoundPlayer.shared.preload([Sound.raceStart, Sound.quack, Sound.splash, Sound.cheer, Sound.groan])
            if model.phase == .loading { await model.load() }
        }
        .onChange(of: colorScheme) { model.isNight = night }
        .onChange(of: reduceMotion) { model.reduceMotion = reduceMotion }
        // The race keeps running while you're on another tab; catch up on return.
        .onAppear { model.reconcile() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.reconcile() }
        }
        .onChange(of: model.balance) { _, balance in
            session.applyBalance(balance)
        }
        // Settings saved over in the admin tab.
        .onChange(of: derbyConfig.config) { _, config in
            guard let config else { return }
            model.apply(config)
            reloadIfSettingsChanged()
        }
    }

    /// A changed duck count, odds or bench list only reaches the ducks on the
    /// next lineup, so pull a fresh one if we're still at the betting stage.
    /// Mid-race it's left alone — the current race stays as the server dealt it.
    private func reloadIfSettingsChanged() {
        guard model.phase == .betting else { return }
        Task { await model.load() }
    }

    private var raceDay: some View {
        ScrollView {
            VStack(spacing: 14) {
                ZStack {
                    TrackCanvas(
                        viewModel: model,
                        furniture: model.furniture,
                        banners: model.banners,
                        isNight: night,
                        reduceMotion: reduceMotion
                    )
                    if model.phase == .countdown {
                        CountdownOverlay(model: model)
                    }
                }

                CommentaryTicker(model: model, night: night)
                DuckPicker(model: model, night: night)
                FormGuide(model: model, night: night)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            BetBar(model: model) { model.placeBet() }
        }
    }
}
