import AppKit
import Foundation

guard CommandLine.arguments.count == 3,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: 1280,
        pixelsHigh: 800,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
      ),
      let context = NSGraphicsContext(bitmapImageRep: bitmap)
else { fatalError("Expected source image and destination PNG") }

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor(calibratedRed: 0.055, green: 0.06, blue: 0.085, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: 1280, height: 800).fill()
let scale = min(1280 / image.size.width, 800 / image.size.height)
let width = image.size.width * scale
let height = image.size.height * scale
image.draw(in: NSRect(x: (1280 - width) / 2, y: (800 - height) / 2, width: width, height: height))
context.flushGraphics()
NSGraphicsContext.restoreGraphicsState()
guard let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("Could not encode PNG") }
try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
