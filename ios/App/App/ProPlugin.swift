import Capacitor
import StoreKit

/// PolarGrid Pro: one non-consumable in-app purchase that unlocks the extra
/// border colours, maximum-quality export, grain and sharpness in the App
/// Store build. The web build has no store and keeps everything unlocked.
///
/// StoreKit 2 only, no third-party SDK or server: whether someone has Pro is
/// read from the signed transactions StoreKit keeps on the device, so nothing
/// about the person leaves it and the privacy label stays "Data Not Collected".
///
/// People who downloaded the app while it was fully free (version 1.0, whose
/// App Store build number is 2) keep everything they had: their AppTransaction
/// says which build they first got, and anything below the first Pro build
/// counts as Pro.
@objc(ProPlugin)
public class ProPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProPlugin"
    public let jsName = "Pro"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    static let productId = "com.frangellcode.polargrid.pro"
    /// The first App Store build that has Pro. Anyone whose original download
    /// is an older build got the app when everything was free.
    static let firstProBuild = 3

    /// TEMPORARY — TestFlight builds for the developer's own use while the Pro
    /// product isn't live in the sandbox yet. MUST be false in any build sent
    /// to App Review: App Review runs in the sandbox too, and would see
    /// everything already unlocked with no purchase to test.
    static let grantProForTesting = false

    @MainActor private var product: Product?
    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Purchases can complete outside purchase() below — Ask to Buy, an
        // interrupted payment, a refund. Finish them and tell the web view so
        // the locks update without a relaunch.
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                if transaction.productID == ProPlugin.productId {
                    let isPro = await ProPlugin.hasEntitlement()
                    self?.notifyListeners("statusChange", data: ["isPro": isPro])
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    /// True when the person owns Pro or first downloaded a free-for-all build.
    static func hasEntitlement() async -> Bool {
        if grantProForTesting { return true }
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productID == productId,
               transaction.revocationDate == nil {
                return true
            }
        }
        return await isEarlySupporter()
    }

    /// On iOS originalAppVersion is the CFBundleVersion (build number) of the
    /// first download. The sandbox and TestFlight report "1.0", which isn't a
    /// whole number, so testers are treated as new customers.
    static func isEarlySupporter() async -> Bool {
        guard case .verified(let appTransaction) = try? await AppTransaction.shared,
              let originalBuild = Int(appTransaction.originalAppVersion) else {
            return false
        }
        return originalBuild < firstProBuild
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        Task {
            call.resolve(["isPro": await ProPlugin.hasEntitlement()])
        }
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                guard let found = try await Product.products(for: [ProPlugin.productId]).first else {
                    call.reject("Pro is not available right now")
                    return
                }
                self.product = found
                call.resolve([
                    "id": found.id,
                    "displayName": found.displayName,
                    "displayPrice": found.displayPrice,
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let product: Product
                if let loaded = self.product {
                    product = loaded
                } else if let found = try await Product.products(for: [ProPlugin.productId]).first {
                    product = found
                } else {
                    call.reject("Pro is not available right now")
                    return
                }
                let result: Product.PurchaseResult
                if #available(iOS 17.0, *), let scene = self.bridge?.viewController?.view.window?.windowScene {
                    result = try await product.purchase(confirmIn: scene)
                } else {
                    result = try await product.purchase()
                }
                switch result {
                case .success(let verification):
                    // Unlike a tip, Pro unlocks something, so only a purchase
                    // Apple's signature vouches for counts.
                    guard case .verified(let transaction) = verification else {
                        call.reject("The purchase couldn't be verified")
                        return
                    }
                    await transaction.finish()
                    call.resolve(["status": "purchased"])
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "cancelled"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Asks the App Store to resend the person's purchases (it may ask them to
    /// sign in), then reports whether Pro came back.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["isPro": await ProPlugin.hasEntitlement()])
        }
    }
}
