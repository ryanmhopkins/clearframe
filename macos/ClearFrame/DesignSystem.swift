import SwiftUI

enum CFStyle {
    static let background = Color(red: 16 / 255, green: 16 / 255, blue: 16 / 255)
    static let surface = Color(red: 21 / 255, green: 21 / 255, blue: 21 / 255)
    static let raised = Color(red: 28 / 255, green: 28 / 255, blue: 28 / 255)
    static let text = Color(red: 239 / 255, green: 239 / 255, blue: 236 / 255)
    static let muted = Color(red: 162 / 255, green: 162 / 255, blue: 158 / 255)
    static let blue = Color(red: 107 / 255, green: 159 / 255, blue: 255 / 255)
    static let blueStrong = Color(red: 57 / 255, green: 117 / 255, blue: 232 / 255)
    static let line = Color.white.opacity(0.09)

    static var backdrop: some View {
        ZStack {
            background
            RadialGradient(colors: [blueStrong.opacity(0.16), .clear], center: .topTrailing,
                           startRadius: 40, endRadius: 690)
            RadialGradient(colors: [Color(red: 0.18, green: 0.23, blue: 0.36).opacity(0.19), .clear],
                           center: .bottomLeading, startRadius: 20, endRadius: 590)
        }
        .ignoresSafeArea()
    }
}

struct DarkPanel: ViewModifier {
    var radius: CGFloat = 20
    func body(content: Content) -> some View {
        content
            .background(CFStyle.surface.opacity(0.92), in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(CFStyle.line))
    }
}

struct GlassPanel: ViewModifier {
    var radius: CGFloat = 24
    func body(content: Content) -> some View {
        if #available(macOS 26.0, *) {
            content
                .glassEffect(.regular.tint(CFStyle.blue.opacity(0.08)), in: RoundedRectangle(cornerRadius: radius))
                .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(.white.opacity(0.12)))
        } else {
            content
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius))
                .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(.white.opacity(0.12)))
        }
    }
}

extension View {
    func darkPanel(radius: CGFloat = 20) -> some View { modifier(DarkPanel(radius: radius)) }
    func clearFrameGlass(radius: CGFloat = 24) -> some View { modifier(GlassPanel(radius: radius)) }
}

struct BrandMark: View {
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28)
                .fill(LinearGradient(colors: [CFStyle.blue.opacity(0.25), CFStyle.blueStrong.opacity(0.08)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
            ClearFrameGlyph()
                .stroke(CFStyle.blue, style: StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round))
                .frame(width: size * 0.65, height: size * 0.65)
        }
        .frame(width: size, height: size)
        .overlay(RoundedRectangle(cornerRadius: size * 0.28).strokeBorder(CFStyle.blue.opacity(0.22)))
        .accessibilityLabel("ClearFrame")
    }
}

// Matches the #icon-frame mark used by the ClearFrame web app.
private struct ClearFrameGlyph: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let x = rect.width / 24
        let y = rect.height / 24
        path.move(to: CGPoint(x: 8 * x, y: 3 * y))
        path.addLine(to: CGPoint(x: 3 * x, y: 3 * y))
        path.addLine(to: CGPoint(x: 3 * x, y: 8 * y))
        path.move(to: CGPoint(x: 16 * x, y: 3 * y))
        path.addLine(to: CGPoint(x: 21 * x, y: 3 * y))
        path.addLine(to: CGPoint(x: 21 * x, y: 8 * y))
        path.move(to: CGPoint(x: 3 * x, y: 16 * y))
        path.addLine(to: CGPoint(x: 3 * x, y: 21 * y))
        path.addLine(to: CGPoint(x: 8 * x, y: 21 * y))
        path.move(to: CGPoint(x: 16 * x, y: 21 * y))
        path.addLine(to: CGPoint(x: 21 * x, y: 21 * y))
        path.addLine(to: CGPoint(x: 21 * x, y: 16 * y))
        path.addRoundedRect(in: CGRect(x: 8 * x, y: 8 * y, width: 8 * x, height: 8 * y),
                            cornerSize: CGSize(width: 2 * x, height: 2 * y))
        return path
    }
}
