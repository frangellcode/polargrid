import Capacitor
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

/// Joins horizontal bands rendered by the web layer into ONE full-resolution
/// JPEG.
///
/// WebKit can't hold a canvas the size of a full-resolution collage (nine 12 MP
/// photos come to well over 100 MP), which is why the web export is capped at
/// 6000 px. The native build lifts that cap by drawing the export a band at a
/// time — each band a canvas WebKit is comfortable with — and handing the band
/// files here. They are streamed into the encoder one band at a time through a
/// sequential data provider, so the full image never exists in memory at once,
/// here or in the webview.
@objc(ImageComposerPlugin)
public class ImageComposerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ImageComposerPlugin"
    public let jsName = "ImageComposer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "compose", returnType: CAPPluginReturnPromise),
    ]

    @objc func compose(_ call: CAPPluginCall) {
        let width = call.getInt("width") ?? 0
        let height = call.getInt("height") ?? 0
        let quality = call.getDouble("quality") ?? 1.0
        let bands = (call.getArray("bands", String.self) ?? []).compactMap(URL.init(string:))
        guard width > 0, height > 0, !bands.isEmpty,
              let output = call.getString("output").flatMap(URL.init(string:)) else {
            call.reject("compose needs width, height, bands and output")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            defer { bands.forEach { try? FileManager.default.removeItem(at: $0) } }
            do {
                try FileManager.default.createDirectory(at: output.deletingLastPathComponent(), withIntermediateDirectories: true)
                try BandedJPEGWriter.write(bands: bands, width: width, height: height, quality: quality, to: output)
                call.resolve(["uri": output.absoluteString])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}

enum BandedJPEGWriter {
    struct Failure: LocalizedError {
        let errorDescription: String?
    }

    static func write(bands: [URL], width: Int, height: Int, quality: Double, to output: URL) throws {
        let reader = BandReader(bands: bands, width: width)
        var callbacks = CGDataProviderSequentialCallbacks(
            version: 0,
            getBytes: { info, buffer, count in
                Unmanaged<BandReader>.fromOpaque(info!).takeUnretainedValue().read(into: buffer, count: count)
            },
            skipForward: { info, count in
                Unmanaged<BandReader>.fromOpaque(info!).takeUnretainedValue().skip(count)
            },
            rewind: { info in
                Unmanaged<BandReader>.fromOpaque(info!).takeUnretainedValue().rewind()
            },
            releaseInfo: { info in
                Unmanaged<BandReader>.fromOpaque(info!).release()
            }
        )
        guard let provider = CGDataProvider(sequentialInfo: Unmanaged.passRetained(reader).toOpaque(), callbacks: &callbacks),
              let image = CGImage(
                width: width,
                height: height,
                bitsPerComponent: 8,
                bitsPerPixel: 32,
                bytesPerRow: width * 4,
                space: BandReader.colorSpace,
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: false,
                intent: .defaultIntent
              ),
              let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw Failure(errorDescription: "Could not start the JPEG encoder")
        }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            throw Failure(errorDescription: "Could not write the JPEG")
        }
        if let problem = reader.problem { throw Failure(errorDescription: problem) }
    }
}

/// Serves the pixels of the whole image in row order while only ever holding
/// ONE decoded band.
private final class BandReader {
    static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

    private let bands: [URL]
    private let width: Int
    private var next = 0
    private var pixels = Data()
    private var offset = 0
    private(set) var problem: String?

    init(bands: [URL], width: Int) {
        self.bands = bands
        self.width = width
    }

    func read(into buffer: UnsafeMutableRawPointer, count: Int) -> Int {
        var written = 0
        while written < count {
            if offset >= pixels.count, !loadNextBand() { break }
            let n = min(count - written, pixels.count - offset)
            pixels.withUnsafeBytes { src in
                buffer.advanced(by: written).copyMemory(from: src.baseAddress!.advanced(by: offset), byteCount: n)
            }
            offset += n
            written += n
        }
        return written
    }

    func skip(_ count: off_t) -> off_t {
        var skipped: off_t = 0
        while skipped < count {
            if offset >= pixels.count, !loadNextBand() { break }
            let n = min(Int(count - skipped), pixels.count - offset)
            offset += n
            skipped += off_t(n)
        }
        return skipped
    }

    func rewind() {
        next = 0
        pixels = Data()
        offset = 0
    }

    private func loadNextBand() -> Bool {
        guard next < bands.count else { return false }
        let url = bands[next]
        next += 1
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let band = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCache: false] as CFDictionary),
              band.width == width else {
            problem = "Band \(next) could not be read"
            return false
        }
        let bytesPerRow = width * 4
        var data = Data(count: bytesPerRow * band.height)
        let drawn: Bool = data.withUnsafeMutableBytes { raw in
            guard let context = CGContext(
                data: raw.baseAddress,
                width: width,
                height: band.height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: BandReader.colorSpace,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ) else { return false }
            context.draw(band, in: CGRect(x: 0, y: 0, width: width, height: band.height))
            return true
        }
        guard drawn else {
            problem = "Band \(next) could not be drawn"
            return false
        }
        pixels = data
        offset = 0
        return true
    }
}
