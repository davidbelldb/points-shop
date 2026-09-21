import SwiftUI
import PhotosUI

/// The '+' tray, ported from the web composer: GIF, photo, voice note, poll,
/// nudge, and the three things you can rain on someone.
///
/// The rain buttons show the real 3D models turning, as they do on the web —
/// they're the same assets, converted to USDZ.
struct MediaTray: View {
    let partnerName: String
    var isBusy: Bool

    var onGif: () -> Void
    var onPhoto: () -> Void
    var onCamera: () -> Void
    var onVoice: () -> Void
    var onPoll: () -> Void
    var onNudge: () -> Void
    var onRain: (RainKind) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                TrayButton(symbol: "rectangle.on.rectangle.angled", label: "GIF", action: onGif)
                TrayButton(symbol: "photo.on.rectangle", label: "Photo", action: onPhoto)
                TrayButton(symbol: "camera.fill", label: "Camera", action: onCamera)
                TrayButton(symbol: "mic.fill", label: "Voice note", action: onVoice)
                TrayButton(symbol: "chart.bar.fill", label: "Poll", action: onPoll)

                Button(action: onNudge) {
                    Text("Nudge")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 16)
                        .frame(height: 44)
                        .background(.quaternary, in: .capsule)
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .accessibilityLabel("Nudge \(partnerName)")

                ForEach(RainKind.allCases) { kind in
                    Button { onRain(kind) } label: {
                        SpinningModel(model: kind.model, size: 34)
                            .frame(width: 44, height: 44)
                            .background(.quaternary, in: .circle)
                    }
                    .buttonStyle(.plain)
                    .disabled(isBusy)
                    .accessibilityLabel(kind.label)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .scrollClipDisabled()
    }
}

private struct TrayButton: View {
    let symbol: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17))
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .background(.quaternary, in: .circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

// MARK: - Poll composer

/// Question and two to four options, as the web app allows.
struct PollComposer: View {
    @Environment(\.dismiss) private var dismiss
    var onSend: (String, [String]) -> Void

    @State private var question = ""
    @State private var options = ["", ""]

    private var canSend: Bool {
        !question.trimmingCharacters(in: .whitespaces).isEmpty
            && options.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }.count >= 2
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Question") {
                    TextField("What are we deciding?", text: $question, axis: .vertical)
                        .lineLimit(1...3)
                }

                Section("Options") {
                    ForEach(options.indices, id: \.self) { index in
                        HStack {
                            TextField("Option \(index + 1)", text: $options[index])
                            if options.count > 2 {
                                Button {
                                    options.remove(at: index)
                                } label: {
                                    Image(systemName: "minus.circle.fill").foregroundStyle(.secondary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if options.count < 4 {
                        Button("Add option") { options.append("") }
                    }
                }
            }
            .navigationTitle("New poll")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        onSend(
                            question.trimmingCharacters(in: .whitespaces),
                            options.map { $0.trimmingCharacters(in: .whitespaces) }
                                .filter { !$0.isEmpty }
                        )
                        dismiss()
                    }
                    .disabled(!canSend)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .appTheme()
    }
}

// MARK: - GIF picker

/// Giphy, through our own backend so the key stays off the device.
struct GifPicker: View {
    @Environment(\.dismiss) private var dismiss
    var onSelect: (String) -> Void

    @State private var query = ""
    @State private var gifs: [Gif] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var searchTask: Task<Void, Never>?

    struct Gif: Decodable, Sendable, Identifiable {
        let id: String
        var title: String = ""
        var preview: String?
        var url: String
        var width: Int = 200
        var height: Int = 200

        var previewURL: URL? { URL(string: preview ?? url) }
    }

    private struct Response: Decodable, Sendable { let gifs: [Gif] }

    private let columns = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ContentUnavailableView("No GIFs", systemImage: "wifi.slash", description: Text(error))
                } else {
                    ScrollView {
                        LazyVGrid(columns: columns, spacing: 6) {
                            ForEach(gifs) { gif in
                                Button {
                                    Haptics.tap()
                                    onSelect(gif.url)
                                    dismiss()
                                } label: {
                                    AsyncImage(url: gif.previewURL) { phase in
                                        switch phase {
                                        case .success(let image): image.resizable().scaledToFill()
                                        default: Color.secondary.opacity(0.15)
                                        }
                                    }
                                    .frame(height: 110)
                                    .clipped()
                                    .clipShape(.rect(cornerRadius: 10))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 12)
                    }
                    .overlay { if isLoading && gifs.isEmpty { ProgressView() } }
                }
            }
            .navigationTitle("GIFs")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Search Giphy")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.large])
        .appTheme()
        .task { await load() }
        .onChange(of: query) { _, text in
            // Debounced, so typing doesn't fire a request per keystroke.
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(for: .milliseconds(350))
                guard !Task.isCancelled else { return }
                await load(text)
            }
        }
    }

    private func load(_ text: String = "") async {
        isLoading = true
        defer { isLoading = false }
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        let path = trimmed.isEmpty
            ? "/giphy"
            : "/giphy?q=\(trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        do {
            gifs = try await APIClient.shared.get(path, as: Response.self).gifs
            error = nil
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
