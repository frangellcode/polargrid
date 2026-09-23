import Capacitor
import ImageIO
import PhotosUI
import UniformTypeIdentifiers

/// The system photo picker, with the one thing an <input type="file"> can't
/// ask for: a maximum. PHPicker enforces `selectionLimit` itself — the person
/// simply can't tick a sixteenth photo — so an over-sized pick never has to be
/// refused after the fact.
///
/// Photos come back as their ORIGINAL files (HEIC stays HEIC, nothing is
/// re-encoded), copied into the app's cache for the webview to read when it
/// needs them. PHPicker runs out of process and needs no photo library
/// permission.
///
/// The one exception is a photo too big to work with: over 50 MB, or so many
/// pixels that decoding it could exhaust the webview's memory. Rather than
/// turn it away, it's re-encoded as a JPEG — downscaled only as far as needed
/// — so any photo someone owns can be used.
@objc(PhotoPickerPlugin)
public class PhotoPickerPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "PhotoPickerPlugin"
    public let jsName = "PhotoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
    ]

    /// Formats the web layer can decode, best first. A photo usually offers
    /// several (a Live Photo, an edited photo); the first match wins.
    private static let preferredTypes: [UTType] = [.heic, .jpeg, .png, .heif]

    private var pendingCall: CAPPluginCall?

    private static let maxBytes = 50 * 1024 * 1024
    /// Decoded, 110 MP is ~440 MB — about as much as the webview can safely
    /// hold alongside everything else. Covers every current camera, the
    /// 100 MP medium-format ones included.
    private static let maxPixels = 110_000_000

    private var pickedDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("picked", isDirectory: true)
    }

    override public func load() {
        // Picked photos are read from here for as long as the app is open, so
        // they can only be cleared once nothing points at them: at launch.
        try? FileManager.default.removeItem(at: pickedDirectory)
    }

    @objc func pick(_ call: CAPPluginCall) {
        let limit = max(1, call.getInt("limit") ?? 1)
        DispatchQueue.main.async {
            var configuration = PHPickerConfiguration()
            configuration.selectionLimit = limit
            configuration.filter = .images
            configuration.preferredAssetRepresentationMode = .current
            configuration.selection = .ordered
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            self.pendingCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingCall else { return }
        pendingCall = nil
        Task {
            try? FileManager.default.createDirectory(at: pickedDirectory, withIntermediateDirectories: true)
            var photos: [[String: Any]] = []
            for result in results {
                if let photo = await copyOriginal(of: result) { photos.append(photo) }
            }
            call.resolve(["photos": photos, "failed": results.count - photos.count])
        }
    }

    private func copyOriginal(of result: PHPickerResult) async -> [String: Any]? {
        let provider = result.itemProvider
        let registered = provider.registeredTypeIdentifiers.compactMap(UTType.init)
        guard let type = Self.preferredTypes.first(where: { preferred in registered.contains { $0.conforms(to: preferred) } })
                .flatMap({ preferred in registered.first { $0.conforms(to: preferred) } })
                ?? registered.first(where: { $0.conforms(to: .image) }) else { return nil }
        let ext = type.preferredFilenameExtension ?? "jpg"
        let name = "\(provider.suggestedName ?? "photo").\(ext)"
        let destination = pickedDirectory.appendingPathComponent("\(UUID().uuidString).\(ext)")

        let copied: Bool = await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                // The provided file is deleted as soon as this handler returns.
                guard let url, (try? FileManager.default.copyItem(at: url, to: destination)) != nil else {
                    continuation.resume(returning: false)
                    return
                }
                continuation.resume(returning: true)
            }
        }
        guard copied else { return nil }

        var file = destination
        var fileName = name
        var mimeType = type.preferredMIMEType ?? "image/jpeg"
        if Self.needsShrinking(destination), let shrunk = Self.shrink(destination) {
            try? FileManager.default.removeItem(at: destination)
            file = shrunk
            fileName = "\(provider.suggestedName ?? "photo").jpg"
            mimeType = "image/jpeg"
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
        guard let webPath = bridge?.portablePath(fromLocalURL: file)?.absoluteString else { return nil }
        return ["webPath": webPath, "name": fileName, "mimeType": mimeType, "size": size]
    }

    private static func pixelSize(of url: URL) -> (width: Int, height: Int)? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int else { return nil }
        return (width, height)
    }

    private static func needsShrinking(_ url: URL) -> Bool {
        let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        if bytes > maxBytes { return true }
        guard let size = pixelSize(of: url) else { return false }
        return size.width * size.height > maxPixels
    }

    /// A JPEG of the photo under both ceilings, upright (EXIF orientation
    /// applied), stepping the size down only until it fits.
    private static func shrink(_ url: URL) -> URL? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let size = pixelSize(of: url) else { return nil }
        let pixelScale = min(1, (Double(maxPixels) / Double(size.width * size.height)).squareRoot())
        var longEdge = Int(Double(max(size.width, size.height)) * pixelScale)
        let output = url.deletingPathExtension().appendingPathExtension("shrunk.jpg")
        for _ in 0..<8 {
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: longEdge,
            ]
            guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
                  let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { return nil }
            let bytes = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? Int) ?? Int.max
            if bytes <= maxBytes { return output }
            longEdge = Int(Double(longEdge) * 0.85)
        }
        return nil
    }
}
