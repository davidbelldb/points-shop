import SwiftUI

/// Opened by tapping the profile photo in the points pill. Appearance and
/// sign-out live here so every screen's toolbar stays clear — and it's the
/// obvious home for notification settings when those land.
struct AccountSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(ThemeStore.self) private var theme
    @Environment(FeatureStore.self) private var features
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Avatar(url: session.account?.photo, size: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(session.account?.displayName ?? "—")
                                .font(.headline)
                            Text("\(session.pointsBalance.formatted()) points")
                                .font(.subheadline)
                                .foregroundStyle(Palette.points)
                        }
                    }
                    .padding(.vertical, 4)

                    if session.account?.impersonating == true {
                        Label("Viewing as \(session.account?.username ?? "")", systemImage: "eye")
                            .foregroundStyle(.orange)
                            .font(.footnote)
                    }
                }

                Section("Appearance") {
                    Picker("Theme", selection: Binding(
                        get: { theme.preference },
                        set: { theme.preference = $0 }
                    )) {
                        ForEach(ThemeStore.Preference.allCases) { option in
                            Label(option.title, systemImage: option.icon).tag(option)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task {
                            await session.logOut()
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("You")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        // This sheet changes the theme, so it has to wear it too.
        .appTheme()
        .animation(.easeInOut(duration: 0.2), value: theme.preference)
    }
}
