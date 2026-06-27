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
        // Only the Live Activity — the template's static + control widgets were
        // removed to rule them out as a cause of the activity not rendering.
        CrowWidgetLiveActivity()
    }
}
