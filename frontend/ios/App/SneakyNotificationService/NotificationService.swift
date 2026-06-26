import UserNotifications

/// Notification Service Extension for Sneaky Stuff.
///
/// When a push arrives with `"mutable-content": 1` and a top-level `"image"`
/// URL in its payload (e.g. a story thumbnail), this downloads the image and
/// attaches it so iOS shows it in the expanded/long-pressed banner. If anything
/// fails it just delivers the original text notification — it never blocks.
class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttempt: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent

        guard let content = bestAttempt else {
            contentHandler(request.content)
            return
        }

        guard let urlString = request.content.userInfo["image"] as? String,
              let url = URL(string: urlString) else {
            contentHandler(content)
            return
        }

        URLSession.shared.downloadTask(with: url) { tempURL, _, _ in
            defer { contentHandler(content) }
            guard let tempURL = tempURL else { return }
            // Give the temp file a real extension so iOS can render it.
            let ext = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            let dest = tempURL.deletingPathExtension().appendingPathExtension(ext)
            try? FileManager.default.moveItem(at: tempURL, to: dest)
            if let attachment = try? UNNotificationAttachment(identifier: "image", url: dest, options: nil) {
                content.attachments = [attachment]
            }
        }.resume()
    }

    override func serviceExtensionTimeWillExpire() {
        // Out of time — deliver whatever we have.
        if let handler = contentHandler, let content = bestAttempt {
            handler(content)
        }
    }
}

