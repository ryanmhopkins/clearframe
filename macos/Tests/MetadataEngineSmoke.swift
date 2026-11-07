import Foundation

@main
struct MetadataEngineSmoke {
    static func main() throws {
        // SOI, EXIF APP1, quantization table, scan header, encoded bytes, EOI.
        let jpeg = Data([0xff, 0xd8, 0xff, 0xe1, 0, 8, 69, 120, 105, 102, 0, 0,
                         0xff, 0xdb, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 17, 34, 0xff, 0xd9])
        let jpegReport = try MetadataEngine.scan(jpeg)
        precondition(jpegReport.format == "JPEG" && jpegReport.blocks.count == 1)
        let incompleteExif = MetadataEngine.details(for: jpegReport.blocks[0], in: jpeg, format: "JPEG")
        precondition(incompleteExif.contains { $0.value.contains("could not be read") })
        let unchangedJPEG = try MetadataEngine.clean(jpeg, removing: [])
        precondition(unchangedJPEG == jpeg)
        let cleanedJPEG = try MetadataEngine.clean(jpeg, removing: [jpegReport.blocks[0].id])
        precondition(cleanedJPEG == Data([0xff, 0xd8, 0xff, 0xdb, 0, 4, 1, 2,
                                          0xff, 0xda, 0, 2, 17, 34, 0xff, 0xd9]))

        // The disclosure reads a value from this block's TIFF directory.
        let tiff: [UInt8] = [73, 73, 42, 0, 8, 0, 0, 0, 1, 0,
                             0x0f, 1, 2, 0, 6, 0, 0, 0, 26, 0, 0, 0,
                             0, 0, 0, 0] + Array("Canon\0".utf8)
        let segmentLength = 2 + 6 + tiff.count
        let taggedJPEG = Data([0xff, 0xd8, 0xff, 0xe1, UInt8(segmentLength >> 8), UInt8(segmentLength & 255)]
                              + Array("Exif\0\0".utf8) + tiff
                              + [0xff, 0xda, 0, 2, 17, 34, 0xff, 0xd9])
        let taggedBlock = try MetadataEngine.scan(taggedJPEG).blocks[0]
        precondition(MetadataEngine.details(for: taggedBlock, in: taggedJPEG, format: "JPEG")
            .contains { $0.name == "Camera make" && $0.value == "Canon" })

        // The engine removes a complete ancillary chunk and retains all image chunks byte for byte.
        func chunk(_ type: String, _ payload: [UInt8]) -> Data {
            var bytes = Data()
            let count = UInt32(payload.count)
            bytes.append(contentsOf: [UInt8(count >> 24), UInt8((count >> 16) & 255), UInt8((count >> 8) & 255), UInt8(count & 255)])
            bytes.append(contentsOf: type.utf8)
            bytes.append(contentsOf: payload)
            bytes.append(contentsOf: [0, 0, 0, 0])
            return bytes
        }
        var png = Data([137, 80, 78, 71, 13, 10, 26, 10])
        png.append(chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]))
        png.append(chunk("tEXt", Array("Note\0Shared locally".utf8)))
        png.append(chunk("IDAT", [7]))
        png.append(chunk("IEND", []))
        let pngReport = try MetadataEngine.scan(png)
        precondition(pngReport.format == "PNG" && pngReport.blocks.count == 1)
        precondition(MetadataEngine.details(for: pngReport.blocks[0], in: png, format: "PNG")
            .contains { $0.name == "Keyword" && $0.value == "Note" })
        precondition(MetadataEngine.details(for: pngReport.blocks[0], in: png, format: "PNG")
            .contains { $0.name == "Text" && $0.value == "Shared locally" })
        let cleanedPNG = try MetadataEngine.clean(png, removing: [pngReport.blocks[0].id])
        precondition(cleanedPNG.count == png.count - pngReport.blocks[0].byteCount)
        let cleanedPNGReport = try MetadataEngine.scan(cleanedPNG)
        precondition(cleanedPNGReport.blocks.isEmpty)

        do {
            _ = try MetadataEngine.scan(Data([0xff, 0xd8, 0xff]))
            preconditionFailure("Truncated JPEG should fail")
        } catch MetadataError.malformed { }
        print("Metadata engine smoke checks passed")
    }
}
