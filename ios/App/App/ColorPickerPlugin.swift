import Capacitor
import UIKit

/// Presents iOS's own colour picker for a custom border colour. It brings the
/// grid, spectrum, sliders, hex field and — the point of it — an eyedropper
/// that can sample anything on screen, including the photo being edited.
///
/// Shown as a half-height sheet so the photo stays visible above it, and every
/// change is streamed to the web view ("colorChange") so the border follows the
/// picker live. pick() resolves with the final colour when the sheet closes.
@objc(ColorPickerPlugin)
public class ColorPickerPlugin: CAPPlugin, CAPBridgedPlugin, UIColorPickerViewControllerDelegate {
    public let identifier = "ColorPickerPlugin"
    public let jsName = "ColorPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?

    @objc func pick(_ call: CAPPluginCall) {
        let initial = call.getString("color").flatMap(ColorPickerPlugin.color(fromHex:)) ?? .white
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            // A second tap while the sheet is still animating away: answer the
            // first call with what it had so it never hangs.
            if let previous = self.pendingCall {
                previous.resolve(["color": call.getString("color") ?? "#ffffff"])
            }
            self.pendingCall = call

            let picker = UIColorPickerViewController()
            picker.selectedColor = initial
            picker.supportsAlpha = false
            picker.delegate = self
            if let sheet = picker.sheetPresentationController {
                sheet.detents = [.medium(), .large()]
                sheet.prefersGrabberVisible = true
                sheet.largestUndimmedDetentIdentifier = .medium
            }
            presenter.present(picker, animated: true)
        }
    }

    public func colorPickerViewController(_ viewController: UIColorPickerViewController, didSelect color: UIColor, continuously: Bool) {
        notifyListeners("colorChange", data: ["color": ColorPickerPlugin.hex(from: color)])
    }

    public func colorPickerViewControllerDidFinish(_ viewController: UIColorPickerViewController) {
        pendingCall?.resolve(["color": ColorPickerPlugin.hex(from: viewController.selectedColor)])
        pendingCall = nil
    }

    /// sRGB "#rrggbb" — the border is drawn on an sRGB canvas, and a colour
    /// sampled from a Display P3 photo is clamped into that range.
    static func hex(from color: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        let srgb = color.cgColor.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)
            .flatMap { UIColor(cgColor: $0) } ?? color
        srgb.getRed(&r, green: &g, blue: &b, alpha: &a)
        func byte(_ v: CGFloat) -> Int { Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(r), byte(g), byte(b))
    }

    static func color(fromHex hex: String) -> UIColor? {
        var value = hex.trimmingCharacters(in: .whitespaces)
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let rgb = Int(value, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((rgb >> 16) & 0xff) / 255,
            green: CGFloat((rgb >> 8) & 0xff) / 255,
            blue: CGFloat(rgb & 0xff) / 255,
            alpha: 1
        )
    }
}
