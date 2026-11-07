import Foundation

enum MetadataError: LocalizedError {
    case unsupported, malformed, tooLarge, unsafeOutput

    var errorDescription: String? {
        switch self {
        case .unsupported: "This version supports JPEG and PNG photos."
        case .malformed: "The image container is incomplete or malformed."
        case .tooLarge: "Photos must be 256 MB or smaller."
        case .unsafeOutput: "The cleaned photo could not be verified."
        }
    }
}

enum MetadataKind: String, Codable {
    case personal, appearance, provenance
}

struct MetadataBlock: Identifiable, Hashable {
    let id: Int
    let end: Int
    let label: String
    let kind: MetadataKind
    let removable: Bool
    var byteCount: Int { end - id }
}

struct ScanReport {
    let format: String
    let blocks: [MetadataBlock]
    let imageParts: Int
}

/// Removes complete metadata segments/chunks without decoding or recompressing image pixels.
enum MetadataEngine {
    static let maximumBytes = 256 * 1024 * 1024

    static func scan(_ data: Data) throws -> ScanReport {
        guard data.count <= maximumBytes else { throw MetadataError.tooLarge }
        let bytes = [UInt8](data)
        if bytes.starts(with: [0xff, 0xd8]) { return try scanJPEG(bytes) }
        if bytes.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) { return try scanPNG(bytes) }
        throw MetadataError.unsupported
    }

    static func clean(_ data: Data, removing ids: Set<Int>) throws -> Data {
        let before = try scan(data)
        let selected = before.blocks.filter { $0.removable && ids.contains($0.id) }.sorted { $0.id < $1.id }
        if selected.isEmpty { return data }
        var output = Data(capacity: data.count - selected.reduce(0) { $0 + $1.byteCount })
        var cursor = 0
        for block in selected {
            guard block.id >= cursor else { throw MetadataError.malformed }
            output.append(data.subdata(in: cursor..<block.id))
            cursor = block.end
        }
        output.append(data.subdata(in: cursor..<data.count))
        let after = try scan(output)
        guard after.format == before.format, after.imageParts == before.imageParts,
              output.count == data.count - selected.reduce(0, { $0 + $1.byteCount }) else {
            throw MetadataError.unsafeOutput
        }
        return output
    }

    private static func scanJPEG(_ b: [UInt8]) throws -> ScanReport {
        var blocks: [MetadataBlock] = []
        var p = 2, imageParts = 0, ended = false, sawScan = false
        while p < b.count {
            let start = p
            guard b[p] == 0xff else { throw MetadataError.malformed }
            while p < b.count && b[p] == 0xff { p += 1 }
            guard p < b.count else { throw MetadataError.malformed }
            let marker = b[p]; p += 1
            if marker == 0xd9 {
                ended = true
                if p < b.count { blocks.append(.init(id: p, end: b.count, label: "Trailing data", kind: .personal, removable: true)) }
                break
            }
            if marker == 0x01 || (0xd0...0xd7).contains(marker) { continue }
            guard p + 2 <= b.count else { throw MetadataError.malformed }
            let length = Int(b[p]) << 8 | Int(b[p + 1])
            guard length >= 2, length <= b.count - p else { throw MetadataError.malformed }
            let payload = p + 2, end = p + length
            if (0xe0...0xef).contains(marker) || marker == 0xfe {
                let prefix = String(bytes: b[payload..<min(end, payload + 80)], encoding: .isoLatin1) ?? ""
                var label = "JPEG application data"
                var kind: MetadataKind = .personal
                var removable = true
                switch marker {
                case 0xfe: label = "Comment"
                case 0xe1 where prefix.hasPrefix("Exif\0\0"): label = "EXIF, GPS & camera details"
                case 0xe1 where prefix.contains("ns.adobe.com/xap"): label = "XMP metadata"
                case 0xed: label = "IPTC / Photoshop resources"
                case 0xe2 where prefix.hasPrefix("ICC_PROFILE"): label = "ICC color profile"; kind = .appearance
                case 0xe0 where prefix.hasPrefix("JFIF\0"): label = "JFIF display details"; kind = .appearance
                case 0xee where prefix.hasPrefix("Adobe"): label = "Adobe color transform"; kind = .appearance; removable = false
                case 0xeb where prefix.hasPrefix("JP"): label = "Content Credentials"; kind = .provenance
                default: break
                }
                blocks.append(.init(id: start, end: end, label: label, kind: kind, removable: removable))
            } else { imageParts += 1 }
            p = end
            if marker == 0xda {
                sawScan = true
                // Skip entropy bytes, stuffed 0xff bytes and restart markers.
                while p < b.count {
                    if b[p] != 0xff { p += 1; continue }
                    var q = p + 1
                    while q < b.count && b[q] == 0xff { q += 1 }
                    guard q < b.count else { throw MetadataError.malformed }
                    if b[q] == 0 || (0xd0...0xd7).contains(b[q]) { p = q + 1; continue }
                    break
                }
            }
        }
        guard ended, sawScan, imageParts > 0 else { throw MetadataError.malformed }
        return .init(format: "JPEG", blocks: blocks, imageParts: imageParts)
    }

    private static func scanPNG(_ b: [UInt8]) throws -> ScanReport {
        var blocks: [MetadataBlock] = []
        var p = 8, imageParts = 0, ended = false, sawHeader = false, sawData = false
        let required: Set<String> = ["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "acTL", "fcTL", "fdAT"]
        let appearance: Set<String> = ["iCCP", "sRGB", "gAMA", "cHRM", "sBIT", "bKGD", "pHYs", "cICP", "mDCV", "cLLI", "sTER"]
        while p + 12 <= b.count {
            let size = UInt64(b[p]) << 24 | UInt64(b[p + 1]) << 16 | UInt64(b[p + 2]) << 8 | UInt64(b[p + 3])
            guard size <= UInt64(b.count - p - 12) else { throw MetadataError.malformed }
            let end = p + 12 + Int(size)
            let typeBytes = Array(b[(p + 4)..<(p + 8)])
            guard typeBytes.allSatisfy({ (65...90).contains($0) || (97...122).contains($0) }),
                  let type = String(bytes: typeBytes, encoding: .ascii) else { throw MetadataError.malformed }
            if !sawHeader { guard type == "IHDR", size == 13 else { throw MetadataError.malformed }; sawHeader = true }
            if type == "IDAT" { sawData = true }
            if required.contains(type) || typeBytes[0] < 97 { imageParts += 1 }
            else {
                let kind: MetadataKind = type == "caBX" ? .provenance : appearance.contains(type) ? .appearance : .personal
                let labels = ["eXIf": "EXIF, GPS & camera details", "tEXt": "Text metadata", "zTXt": "Compressed text", "iTXt": "International text", "tIME": "Modification time", "iCCP": "ICC color profile", "caBX": "Content Credentials"]
                blocks.append(.init(id: p, end: end, label: labels[type] ?? "\(type) ancillary data", kind: kind, removable: true))
            }
            p = end
            if type == "IEND" {
                ended = true
                if p < b.count { blocks.append(.init(id: p, end: b.count, label: "Trailing data", kind: .personal, removable: true)) }
                break
            }
        }
        guard ended, sawHeader, sawData, imageParts > 1 else { throw MetadataError.malformed }
        return .init(format: "PNG", blocks: blocks, imageParts: imageParts)
    }
}
