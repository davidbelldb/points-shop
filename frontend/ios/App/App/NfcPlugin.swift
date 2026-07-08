import Foundation
import Capacitor
import CoreNFC

/// Reads/writes NFC tags for the hidden-story flow.
///
/// JS usage (see frontend/src/lib/nfc.js):
///   Nfc.isAvailable()            // -> { available: Bool }
///   Nfc.writeUrl({ url })        // -> { written: true } | rejects
///   Nfc.eraseTag()               // -> { written: true } | rejects  (wipes a tag)
///
/// A write always overwrites whatever the tag already held, so re-writing a tag
/// just replaces the old link. Erase writes a single empty NDEF record.
///
/// Auto-registered by Capacitor via CAPBridgedPlugin — no manual wiring needed.
@objc(NfcPlugin)
public class NfcPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NfcPlugin"
    public let jsName = "Nfc"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "eraseTag", returnType: CAPPluginReturnPromise),
    ]

    private var session: NFCNDEFReaderSession?
    private var pendingCall: CAPPluginCall?
    private var messageToWrite: NFCNDEFMessage?
    private var successAlert: String = "Done."

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": NFCNDEFReaderSession.readingAvailable])
    }

    @objc func writeUrl(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("A valid url is required")
            return
        }
        guard let payload = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else {
            call.reject("Couldn't build the link record.")
            return
        }
        begin(
            call: call,
            message: NFCNDEFMessage(records: [payload]),
            prompt: "Hold your iPhone near the NFC tag to write the story link.",
            success: "Story link written to tag."
        )
    }

    @objc func eraseTag(_ call: CAPPluginCall) {
        let empty = NFCNDEFPayload(format: .empty, type: Data(), identifier: Data(), payload: Data())
        begin(
            call: call,
            message: NFCNDEFMessage(records: [empty]),
            prompt: "Hold your iPhone near the NFC tag to wipe it.",
            success: "Tag wiped."
        )
    }

    // MARK: - Session lifecycle

    private func begin(call: CAPPluginCall, message: NFCNDEFMessage, prompt: String, success: String) {
        guard NFCNDEFReaderSession.readingAvailable else {
            call.reject("NFC is not available on this device")
            return
        }
        call.keepAlive = true
        self.pendingCall = call
        self.messageToWrite = message
        self.successAlert = success
        DispatchQueue.main.async {
            let session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: false)
            session.alertMessage = prompt
            self.session = session
            session.begin()
        }
    }

    private func finish(resolve payload: [String: Any]) {
        if let call = self.pendingCall {
            self.pendingCall = nil
            call.resolve(payload)
        }
        self.messageToWrite = nil
        self.session = nil
    }

    private func finish(reject message: String) {
        if let call = self.pendingCall {
            self.pendingCall = nil
            call.reject(message)
        }
        self.messageToWrite = nil
        self.session = nil
    }
}

extension NfcPlugin: NFCNDEFReaderSessionDelegate {
    // Required by the protocol but unused — we drive writes off didDetect tags.
    public func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {}

    public func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        // Success path nils pendingCall before invalidating, so this only fires
        // for genuine failures / cancels.
        guard self.pendingCall != nil else { return }
        let nsErr = error as NSError
        if nsErr.code == NFCReaderError.readerSessionInvalidationErrorUserCanceled.rawValue {
            self.finish(reject: "cancelled")
        } else {
            self.finish(reject: error.localizedDescription)
        }
    }

    public func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard let message = self.messageToWrite else {
            session.invalidate(errorMessage: "Nothing to write.")
            return
        }
        if tags.count > 1 {
            session.alertMessage = "More than one tag detected. Remove all but one and try again."
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { session.restartPolling() }
            return
        }
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag found.")
            return
        }

        session.connect(to: tag) { error in
            if let error = error {
                session.invalidate(errorMessage: "Connection failed: \(error.localizedDescription)")
                return
            }
            tag.queryNDEFStatus { status, _, error in
                if let error = error {
                    session.invalidate(errorMessage: "Couldn't read the tag: \(error.localizedDescription)")
                    return
                }
                switch status {
                case .notSupported:
                    session.invalidate(errorMessage: "This tag isn't NDEF compatible.")
                case .readOnly:
                    session.invalidate(errorMessage: "This tag is locked (read-only).")
                case .readWrite:
                    tag.writeNDEF(message) { error in
                        if let error = error {
                            session.invalidate(errorMessage: "Write failed: \(error.localizedDescription)")
                        } else {
                            // Resolve BEFORE invalidating so didInvalidate is a no-op.
                            self.finish(resolve: ["written": true])
                            session.alertMessage = self.successAlert
                            session.invalidate()
                        }
                    }
                @unknown default:
                    session.invalidate(errorMessage: "Unknown tag state.")
                }
            }
        }
    }
}
