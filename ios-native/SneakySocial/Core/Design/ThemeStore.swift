import SwiftUI
import Observation

/// Light / dark / follow-the-phone, remembered on the device.
///
/// The web app does the same thing in localStorage — a stored choice wins,
/// otherwise it follows the OS — so this keeps the two clients behaving alike
/// without needing anything server-side.
@MainActor
@Observable
final class ThemeStore {
    enum Preference: String, CaseIterable, Identifiable, Sendable {
        case light, dark

        var id: String { rawValue }

        var title: String {
            switch self {
            case .light: "Light"
            case .dark: "Dark"
            }
        }

        var icon: String {
            switch self {
            case .light: "sun.max"
            case .dark: "moon"
            }
        }
    }

    private static let key = "theme"

    var preference: Preference {
        didSet {
            guard preference != oldValue else { return }
            UserDefaults.standard.set(preference.rawValue, forKey: Self.key)
        }
    }

    init() {
        // Anyone carrying the old "system" value — or a fresh install — lands on
        // dark, which is how the app is designed to look.
        let stored = UserDefaults.standard.string(forKey: Self.key)
        preference = stored.flatMap(Preference.init(rawValue:)) ?? .dark
    }

    var colorScheme: ColorScheme {
        switch preference {
        case .light: .light
        case .dark: .dark
        }
    }

    /// Flip between light and dark. From `.system` it jumps to whichever is the
    /// opposite of what's on screen right now.
    func toggle(currentlyDark: Bool) {
        preference = currentlyDark ? .light : .dark
        Haptics.tap()
    }
}

/// Applies the chosen appearance to a view.
///
/// A sheet is its own presentation context: the `.preferredColorScheme` set at
/// the app root doesn't reach one that's already on screen, so a sheet that can
/// CHANGE the theme has to apply it to itself or it stays stale until reopened.
private struct AppThemeModifier: ViewModifier {
    @Environment(ThemeStore.self) private var theme

    func body(content: Content) -> some View {
        content.preferredColorScheme(theme.colorScheme)
    }
}

extension View {
    /// Put this on the root of any sheet so it follows the theme live.
    func appTheme() -> some View {
        modifier(AppThemeModifier())
    }
}

/// Tap to flip light/dark, long-press for the three-way choice.
struct ThemeToggleButton: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        Button {
            theme.toggle(currentlyDark: isDark)
        } label: {
            Image(systemName: isDark ? "moon.fill" : "sun.max.fill")
                .contentTransition(.symbolEffect(.replace))
        }
        .accessibilityLabel(isDark ? "Switch to light mode" : "Switch to dark mode")
        .contextMenu {
            Picker("Appearance", selection: Binding(
                get: { theme.preference },
                set: { theme.preference = $0 }
            )) {
                ForEach(ThemeStore.Preference.allCases) { option in
                    Label(option.title, systemImage: option.icon).tag(option)
                }
            }
        }
    }
}
