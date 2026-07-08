import UIKit
import Capacitor

/// Capacitor's auto-discovery doesn't pick up plugins that live in the app
/// target (only ones shipped as packages), so we register CrowActivityPlugin
/// explicitly here. Main.storyboard's root view controller must use this class
/// (Identity Inspector → Custom Class → MainViewController) instead of the
/// default CAPBridgeViewController.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CrowActivityPlugin())
        bridge?.registerPluginInstance(NfcPlugin())
    }
}
