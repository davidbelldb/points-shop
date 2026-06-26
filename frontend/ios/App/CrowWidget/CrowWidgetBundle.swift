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
        CrowWidget()
        CrowWidgetControl()
        CrowWidgetLiveActivity()
    }
}
