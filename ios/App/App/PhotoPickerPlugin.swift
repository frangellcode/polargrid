import Capacitor
import PhotosUI
import UniformTypeIdentifiers

/// The system photo picker, with the one thing an <input type="file"> can't
/// ask for: a maximum. PHPicker enforces `selectionLimit` itself — the person
/// simply can't tick a sixteenth photo — so an over-sized pick never has to be
/// refused after the fact.
///
/// Photos come back as their ORIGINAL files (HEIC stays HEIC, nothing is
/// re-encoded), copied into the app's cache for the webview to read. PHPicker
/// runs out of process and needs no photo library permission.
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

    private var pickedDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("picked", isDirectory: true)
    }

    @objc func pick(_ call: CAPPluginCall) {
        let limit = max(1, call.getInt("limit") ?? 1)
        DispatchQueue.main.async {
            // Files from the previous pick were already read into the webview.
            try? FileManager.default.removeItem(at: self.pickedDirectory)
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
            var photos: [[String: String]] = []
            for result in results {
                if let photo = await copyOriginal(of: result) { photos.append(photo) }
            }
            call.resolve(["photos": photos, "failed": results.count - photos.count])
        }
    }

    private func copyOriginal(of result: PHPickerResult) async -> [String: String]? {
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
        guard copied, let webPath = bridge?.portablePath(fromLocalURL: destination)?.absoluteString else { return nil }
        return ["webPath": webPath, "name": name, "mimeType": type.preferredMIMEType ?? "image/jpeg"]
    }
}
