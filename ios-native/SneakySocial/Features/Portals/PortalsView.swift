import SwiftUI

/// Portals — still to be defined. Placeholder so the tab exists and the shape
/// of the app is right; the content lands once we've settled what it is.
struct PortalsView: View {
    @State private var showingAccount = false

    var body: some View {
        ContentUnavailableView {
            Label("Portals", systemImage: "circle.hexagongrid.fill")
        } description: {
            Text("Coming soon.")
        }
        .navigationTitle("Portals")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { AppIconBadge() }
                .sharedBackgroundVisibility(.hidden)
            ToolbarItem(placement: .topBarTrailing) {
                PointsPill(onTapAvatar: { showingAccount = true })
            }
            .sharedBackgroundVisibility(.hidden)
        }
        .sheet(isPresented: $showingAccount) { AccountSheet() }
    }
}
