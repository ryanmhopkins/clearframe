import Foundation
import zlib

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

struct MetadataDetail: Identifiable {
    let id = UUID()
    let name: String
    let value: String
}

struct ScanReport {
    let format: String
    let blocks: [MetadataBlock]
    let imageParts: Int
}

/// Removes complete metadata segments/chunks without decoding or recompressing image pixels.
enum MetadataEngine {
    static let maximumBytes = 256 * 1024 * 1024

    /// Describe only values present in the selected block. Unknown binary payloads stay opaque.
    static func details(for block: MetadataBlock, in data: Data, format: String) -> [MetadataDetail] {
        guard block.id >= 0, block.end <= data.count, block.end > block.id else { return [] }
        let bytes = [UInt8](data[block.id..<block.end])
        if block.label == "Trailing data" {
            return [MetadataDetail(name: "Content", value: "Unrecognized bytes after the image end marker"),
                    MetadataDetail(name: "First bytes", value: hexPreview(bytes))]
        }
        if format == "JPEG" { return jpegDetails(block, bytes: bytes) }
        if format == "PNG" { return pngDetails(block, bytes: bytes) }
        return []
    }

    private static func jpegDetails(_ block: MetadataBlock, bytes: [UInt8]) -> [MetadataDetail] {
        guard bytes.count >= 4 else { return [] }
        let marker = bytes[1]
        let payload = Array(bytes.dropFirst(4))
        var result = [MetadataDetail(name: "JPEG segment", value: marker == 0xfe ? "Comment" : String(format: "APP%d", Int(marker) - 0xe0))]
        if block.label == "EXIF, GPS & camera details" {
            result += exifDetails(Array(payload.dropFirst(6)))
        } else if block.label == "XMP metadata" {
            let xml = payload.drop(while: { $0 != 0 }).dropFirst()
            result += xmpDetails(Array(xml))
        } else if block.label == "Comment" {
            result += textPreview(payload, name: "Comment")
        } else if block.label == "ICC color profile" {
            result.append(.init(name: "Profile identifier", value: "ICC_PROFILE"))
            if payload.count > 13 {
                result.append(.init(name: "Profile chunk", value: "\(payload[12]) of \(payload[13])"))
            }
        } else {
            if let signature = asciiPrefix(payload) {
                result.append(.init(name: "Identifier", value: signature))
            }
            result.append(.init(name: "First bytes", value: hexPreview(payload)))
        }
        return result
    }

    private static func pngDetails(_ block: MetadataBlock, bytes: [UInt8]) -> [MetadataDetail] {
        guard bytes.count >= 12, let type = String(bytes: bytes[4..<8], encoding: .ascii) else { return [] }
        let payload = Array(bytes[8..<(bytes.count - 4)])
        var result = [MetadataDetail(name: "PNG chunk", value: type)]
        switch type {
        case "eXIf": result += exifDetails(payload)
        case "tEXt", "zTXt", "iTXt":
            let keyword = payload.prefix(while: { $0 != 0 })
            if let name = String(bytes: keyword, encoding: .isoLatin1), !name.isEmpty {
                result.append(.init(name: "Keyword", value: short(name)))
            }
            let offset = keyword.count + 1
            if type == "tEXt", offset <= payload.count {
                result += textPreview(Array(payload.dropFirst(offset)), name: "Text", encoding: .isoLatin1)
            } else if type == "zTXt" {
                let compressed = Array(payload.dropFirst(offset + 1))
                result += inflateText(compressed, name: "Text", encoding: .isoLatin1)
            } else if type == "iTXt", offset + 2 <= payload.count {
                let compressed = payload[offset] == 1
                let rest = payload.dropFirst(offset + 2)
                let language = rest.prefix(while: { $0 != 0 })
                let translated = rest.dropFirst(language.count + 1)
                let translatedKeyword = translated.prefix(while: { $0 != 0 })
                let content = translated.dropFirst(translatedKeyword.count + 1)
                if !language.isEmpty, let value = String(bytes: language, encoding: .ascii) {
                    result.append(.init(name: "Language", value: short(value)))
                }
                result += compressed ? inflateText(Array(content), name: "Text", encoding: .utf8)
                                     : textPreview(Array(content), name: "Text")
            }
        case "tIME" where payload.count >= 7:
            let year = Int(payload[0]) << 8 | Int(payload[1])
            result.append(.init(name: "Modified", value: String(format: "%04d-%02d-%02d %02d:%02d:%02d UTC", year, payload[2], payload[3], payload[4], payload[5], payload[6])))
        case "iCCP":
            if let name = asciiPrefix(payload) { result.append(.init(name: "Profile name", value: name)) }
            result.append(.init(name: "Content", value: "Compressed ICC color profile"))
        case "pHYs" where payload.count >= 9:
            func number(_ start: Int) -> UInt32 { payload[start..<start + 4].reduce(0) { ($0 << 8) | UInt32($1) } }
            result.append(.init(name: "Pixels per unit", value: "\(number(0)) × \(number(4))"))
            result.append(.init(name: "Unit", value: payload[8] == 1 ? "Meter" : "Unspecified"))
        default:
            result.append(.init(name: "First bytes", value: hexPreview(payload)))
        }
        return result
    }

    private static func exifDetails(_ tiff: [UInt8]) -> [MetadataDetail] {
        guard tiff.count >= 8 else { return [.init(name: "Content", value: "EXIF header found; tag values could not be read")] }
        let little = tiff[0] == 0x49 && tiff[1] == 0x49
        guard little || (tiff[0] == 0x4d && tiff[1] == 0x4d) else {
            return [.init(name: "Content", value: "EXIF tag values could not be read")]
        }
        func u16(_ at: Int) -> Int? {
            guard at >= 0, at + 2 <= tiff.count else { return nil }
            return little ? Int(tiff[at]) | Int(tiff[at + 1]) << 8 : Int(tiff[at]) << 8 | Int(tiff[at + 1])
        }
        func u32(_ at: Int) -> Int? {
            guard at >= 0, at + 4 <= tiff.count else { return nil }
            var slice = Array(tiff[at..<at + 4])
            if little { slice.reverse() }
            return slice.reduce(0) { ($0 << 8) | Int($1) }
        }
        guard u16(2) == 42, let root = u32(4) else {
            return [.init(name: "Content", value: "EXIF tag values could not be read")]
        }
        let names: [Int: String] = [0x010e: "Description", 0x010f: "Camera make", 0x0110: "Camera model", 0x0112: "Orientation", 0x0131: "Software", 0x0132: "Modified", 0x013b: "Artist", 0x8298: "Copyright", 0x829a: "Exposure time", 0x829d: "F-number", 0x8827: "ISO", 0x9003: "Date taken", 0x9004: "Digitized", 0x920a: "Focal length", 0xa420: "Image ID", 0xa430: "Camera owner", 0xa431: "Body serial number", 0xa432: "Lens specification", 0xa433: "Lens make", 0xa434: "Lens model", 0x0001: "Latitude reference", 0x0002: "Latitude", 0x0003: "Longitude reference", 0x0004: "Longitude", 0x0005: "Altitude reference", 0x0006: "Altitude", 0x001d: "GPS date"]
        var found: [MetadataDetail] = []
        var visited: Set<Int> = []
        func walk(_ offset: Int, depth: Int) {
            guard depth < 4, !visited.contains(offset), let count = u16(offset), count <= 256,
                  offset + 2 + count * 12 + 4 <= tiff.count else { return }
            visited.insert(offset)
            for index in 0..<count {
                let entry = offset + 2 + index * 12
                guard let tag = u16(entry), let type = u16(entry + 2), let quantity = u32(entry + 4),
                      let valueOffset = u32(entry + 8) else { continue }
                if [0x8769, 0x8825, 0xa005].contains(tag) { walk(valueOffset, depth: depth + 1); continue }
                guard found.count < 40 else { continue }
                let name = names[tag] ?? String(format: "Tag 0x%04X", tag)
                let width = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8].indices.contains(type) ? [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] : 0
                guard width > 0, quantity > 0, quantity <= 4096, quantity <= Int.max / width else { continue }
                let length = quantity * width
                let start = length <= 4 ? entry + 8 : valueOffset
                guard start >= 0, start + length <= tiff.count else { continue }
                var value: String?
                if type == 2 {
                    value = String(bytes: tiff[start..<start + length].prefix(while: { $0 != 0 }), encoding: .ascii)
                } else if type == 3, quantity == 1 { value = u16(start).map(String.init) }
                else if type == 4, quantity == 1 { value = u32(start).map(String.init) }
                else if type == 5, quantity <= 3 {
                    let parts = (0..<quantity).compactMap { part -> String? in
                        guard let top = u32(start + part * 8), let bottom = u32(start + part * 8 + 4), bottom != 0 else { return nil }
                        return String(format: "%.5g", Double(top) / Double(bottom))
                    }
                    value = parts.joined(separator: ", ")
                }
                if let value, !value.isEmpty { found.append(.init(name: name, value: short(value))) }
            }
            if let next = u32(offset + 2 + count * 12), next != 0 { walk(next, depth: depth + 1) }
        }
        walk(root, depth: 0)
        return found.isEmpty ? [.init(name: "Content", value: "EXIF data is present, but no readable named tags were found")] : found
    }

    private static func textPreview(_ bytes: [UInt8], name: String, encoding: String.Encoding = .utf8) -> [MetadataDetail] {
        guard let value = String(bytes: bytes.prefix(4096), encoding: encoding), !value.isEmpty else {
            return [.init(name: name, value: "Text could not be decoded")]
        }
        return [.init(name: name, value: short(value.trimmingCharacters(in: .whitespacesAndNewlines)))]
    }

    private static func inflateText(_ bytes: [UInt8], name: String, encoding: String.Encoding) -> [MetadataDetail] {
        guard !bytes.isEmpty else { return [.init(name: name, value: "Compressed text could not be previewed")] }
        var output = [UInt8](repeating: 0, count: 65_536)
        var size = uLong(output.count)
        let status = output.withUnsafeMutableBufferPointer { destination in
            bytes.withUnsafeBufferPointer { source in
                uncompress(destination.baseAddress!, &size, source.baseAddress!, uLong(source.count))
            }
        }
        guard status == Z_OK else { return [.init(name: name, value: "Compressed text could not be previewed")] }
        return textPreview(Array(output.prefix(Int(size))), name: name, encoding: encoding)
    }

    private static func xmpDetails(_ bytes: [UInt8]) -> [MetadataDetail] {
        guard let xml = String(bytes: bytes.prefix(65536), encoding: .utf8) else {
            return [.init(name: "XMP packet", value: "XML could not be decoded")]
        }
        let source = xml as NSString
        var fields: [MetadataDetail] = []
        let patterns = [#"([A-Za-z][A-Za-z0-9:._-]*)\s*=\s*"([^"]{1,300})""#,
                        #"<([A-Za-z][A-Za-z0-9:._-]*)[^>]*>([^<]{1,300})</\1>"#]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            for match in regex.matches(in: xml, range: NSRange(location: 0, length: source.length)) {
                guard fields.count < 25 else { break }
                let name = source.substring(with: match.range(at: 1))
                if name.hasPrefix("xmlns") || name == "rdf:about" { continue }
                let value = source.substring(with: match.range(at: 2))
                fields.append(.init(name: name, value: short(value)))
            }
        }
        return fields.isEmpty ? textPreview(bytes, name: "XMP packet") : fields
    }

    private static func asciiPrefix(_ bytes: [UInt8]) -> String? {
        let prefix = bytes.prefix(while: { $0 != 0 }).prefix(40)
        guard !prefix.isEmpty, prefix.allSatisfy({ 32...126 ~= $0 }) else { return nil }
        return String(bytes: prefix, encoding: .ascii).map(short)
    }

    private static func hexPreview(_ bytes: [UInt8]) -> String {
        bytes.prefix(16).map { String(format: "%02X", $0) }.joined(separator: " ") + (bytes.count > 16 ? " …" : "")
    }

    private static func short(_ value: String) -> String {
        let cleaned = String(value.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) || $0 == "\n" })
            .replacingOccurrences(of: "\n", with: " ")
        return String(cleaned.prefix(300)) + (cleaned.count > 300 ? "…" : "")
    }

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
