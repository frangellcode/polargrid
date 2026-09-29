import Capacitor
import UIKit

/// Registers the app's own plugins — Capacitor finds npm plugins on its own,
/// but a plugin living inside the app target has to be handed over — and
/// forwards trackpad pinches to the web view.
class MainViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ProPlugin())
        bridge?.registerPluginInstance(ColorPickerPlugin())
        bridge?.registerPluginInstance(PhotoPickerPlugin())
        bridge?.registerPluginInstance(ImageComposerPlugin())

        // A pinch on an iPad's trackpad never reaches the page as touches or
        // as WebKit gesture events — UIKit hands it to pinch recognizers. This
        // one listens to the trackpad only (fingers on the glass are left to
        // the page's own touch handling) and passes every step on as a
        // "trackpadpinch" event, in the page's CSS pixels.
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handleTrackpadPinch(_:)))
        pinch.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirectPointer.rawValue)]
        pinch.delegate = self
        webView?.addGestureRecognizer(pinch)
    }

    @objc private func handleTrackpadPinch(_ recognizer: UIPinchGestureRecognizer) {
        guard let webView = webView else { return }
        let phase: String
        switch recognizer.state {
        case .began: phase = "start"
        case .changed: phase = "change"
        case .ended, .cancelled, .failed: phase = "end"
        default: return
        }
        let point = recognizer.location(in: webView)
        let js = "window.dispatchEvent(new CustomEvent('trackpadpinch',{detail:{phase:'\(phase)',scale:\(recognizer.scale),x:\(point.x),y:\(point.y)}}))"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}
