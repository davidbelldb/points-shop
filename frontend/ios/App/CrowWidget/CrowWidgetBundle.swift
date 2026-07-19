//
//  CrowWidgetBundle.swift
//  CrowWidget
//
//  Created by David Bell on 26/06/2026.
//

import WidgetKit
import SwiftUI

@main
struct CrowWidgetBundle: WidgetBundle {
    var body: some Widget {
        // The Crow Live Activity…
        CrowWidgetLiveActivity()
        // …plus the Sneaky home-screen + lock-screen widgets.
        SneakyCalendarWidget()
        SneakyDirdleWidget()
        SneakyDirdleBoardWidget()
    }
}
