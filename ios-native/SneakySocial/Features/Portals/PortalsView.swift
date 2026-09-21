import SwiftUI

/// Portals — still to be defined. Placeholder so the tab exists and the shape
/// of the app is right; the content lands once we've settled what it is.
struct PortalsView: View {

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PageHeading(title: "Portals")
                .padding(.horizontal, 16)
                .padding(.top, 8)

            ContentUnavailableView {
                Label("Portals", systemImage: "circle.hexagongrid.fill")
            } description: {
                Text("Coming soon.")
            }
        }
        .appTopBar()
    }
}
