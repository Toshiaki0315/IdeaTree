// アプリのアイコンの元絵（1024px PNG）を描く。
//
//     make icon   （= swift scripts/make_icon.swift && npx tauri icon …）
//
// 外部の画像編集ソフトに頼らず、macOS の CoreGraphics だけで描く（.icns を作れるのは macOS だけ）。
//
// デザインは「IdeaTree」— 濃い紺の角丸の台に、中心の白い楕円（セントラルイメージ）から、
// 色とりどりの枝が、先細りの曲線で放射状に広がり、先に小さな丸（ノード）が付く。
// 中心の楕円の中の3本の線は、題名のテキスト。トニー・ブザンのマインドマップの絵。

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size: CGFloat = 1024
let output = CommandLine.arguments.dropFirst().first ?? "src-tauri/icons/icon-source.png"

let space = CGColorSpace(name: CGColorSpace.sRGB)!

func color(_ hex: String, alpha: CGFloat = 1) -> CGColor {
    var value: UInt64 = 0
    Scanner(string: String(hex.dropFirst())).scanHexInt64(&value)
    let r = CGFloat((value >> 16) & 0xff) / 255
    let g = CGFloat((value >> 8) & 0xff) / 255
    let b = CGFloat(value & 0xff) / 255
    return CGColor(colorSpace: space, components: [r, g, b, alpha])!
}

guard let context = CGContext(
    data: nil, width: Int(size), height: Int(size), bitsPerComponent: 8, bytesPerRow: 0,
    space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
else { fatalError("描画の準備に失敗しました") }
context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)
// CoreGraphics は左下が原点。上下を返して、左上を原点にして描く
context.translateBy(x: 0, y: size)
context.scaleBy(x: 1, y: -1)

// 台（角丸の正方形）。縁に少し余白を残す（macOS のアイコンの流儀）
let inset = size * 0.06
let plate = CGRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let platePath = CGPath(roundedRect: plate, cornerWidth: size * 0.22, cornerHeight: size * 0.22, transform: nil)

context.saveGState()
// 台の影
context.setShadow(offset: CGSize(width: 0, height: -size * 0.012), blur: size * 0.03, color: color("#000000", alpha: 0.35))
context.addPath(platePath)
context.setFillColor(color("#1F2A4A"))
context.fillPath()
context.restoreGState()

// 台の塗り（上が明るく、下が暗い、紺のグラデーション）
context.saveGState()
context.addPath(platePath)
context.clip()
let gradient = CGGradient(
    colorsSpace: space, colors: [color("#33447A"), color("#1B2542")] as CFArray, locations: [0, 1])!
context.drawLinearGradient(
    gradient, start: CGPoint(x: size / 2, y: inset), end: CGPoint(x: size / 2, y: size - inset), options: [])
context.restoreGState()

// 台の縁（白い地に溶けないよう、細い線を引く）
context.addPath(platePath)
context.setStrokeColor(color("#0F1730", alpha: 0.9))
context.setLineWidth(size * 0.004)
context.strokePath()

let center = CGPoint(x: size / 2, y: size / 2)

/// 先細りの枝（中心から外へ向かう、S 字の曲線）を、塗りつぶしの図形として描く
func branch(angle: CGFloat, length: CGFloat, bend: CGFloat, width: (start: CGFloat, end: CGFloat), color fill: CGColor) {
    let direction = CGPoint(x: cos(angle), y: sin(angle))
    let normal = CGPoint(x: -direction.y, y: direction.x)
    func point(_ distance: CGFloat, _ offset: CGFloat) -> CGPoint {
        CGPoint(
            x: center.x + direction.x * distance + normal.x * offset,
            y: center.y + direction.y * distance + normal.y * offset)
    }
    // 3次ベジェ曲線の制御点（S 字になるよう、手前と先で、逆向きにふくらませる）
    let p0 = point(80, 0)
    let p1 = point(80 + length * 0.35, bend)
    let p2 = point(80 + length * 0.7, -bend)
    let p3 = point(80 + length, 0)

    func bezier(_ t: CGFloat) -> CGPoint {
        let u = 1 - t
        return CGPoint(
            x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
            y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y)
    }

    let steps = 48
    var left: [CGPoint] = []
    var right: [CGPoint] = []
    for i in 0...steps {
        let t = CGFloat(i) / CGFloat(steps)
        let here = bezier(t)
        let ahead = bezier(min(1, t + 0.01))
        let behind = bezier(max(0, t - 0.01))
        var tangent = CGPoint(x: ahead.x - behind.x, y: ahead.y - behind.y)
        let norm = max(0.0001, hypot(tangent.x, tangent.y))
        tangent = CGPoint(x: tangent.x / norm, y: tangent.y / norm)
        let half = (width.start + (width.end - width.start) * t) / 2
        left.append(CGPoint(x: here.x - tangent.y * half, y: here.y + tangent.x * half))
        right.append(CGPoint(x: here.x + tangent.y * half, y: here.y - tangent.x * half))
    }
    let path = CGMutablePath()
    path.move(to: left[0])
    for p in left.dropFirst() { path.addLine(to: p) }
    for p in right.reversed() { path.addLine(to: p) }
    path.closeSubpath()
    context.addPath(path)
    context.setFillColor(fill)
    context.fillPath()

    // 枝の先の、小さな丸（ノード）
    let tip = bezier(1)
    context.setFillColor(fill)
    context.fillEllipse(in: CGRect(x: tip.x - 30, y: tip.y - 30, width: 60, height: 60))
    context.setStrokeColor(color("#FFFFFF", alpha: 0.9))
    context.setLineWidth(8)
    context.strokeEllipse(in: CGRect(x: tip.x - 30, y: tip.y - 30, width: 60, height: 60))
}

// 7本の枝（色は、アプリのメインブランチのパレットを、濃い地に映えるよう、明るくしたもの）
let colors = ["#FF5A67", "#FF9A3D", "#FFD04D", "#3DDC97", "#4DA3FF", "#9B8CFF", "#FF7AC0"]
let branchCount = colors.count
for index in 0..<branchCount {
    let angle = -CGFloat.pi / 2 + CGFloat(index) * 2 * CGFloat.pi / CGFloat(branchCount) + 0.18
    let sign: CGFloat = index.isMultiple(of: 2) ? 1 : -1
    branch(
        angle: angle, length: 255, bend: 60 * sign, width: (start: 68, end: 20), color: color(colors[index]))
}

// 中心の楕円（セントラルイメージ）
let ellipseRect = CGRect(x: center.x - 165, y: center.y - 122, width: 330, height: 244)
context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: color("#000000", alpha: 0.4))
context.setFillColor(color("#FFFFFF"))
context.fillEllipse(in: ellipseRect)
context.restoreGState()
context.setStrokeColor(color("#2B3A67"))
context.setLineWidth(14)
context.strokeEllipse(in: ellipseRect.insetBy(dx: 7, dy: 7))

// 楕円の中の、テキストの線（見出しと、本文の2行）。中心のノードが、題名を持っていることを表す
func bar(width: CGFloat, y: CGFloat, fill: CGColor) {
    let rect = CGRect(x: center.x - width / 2, y: center.y + y - 13, width: width, height: 26)
    context.addPath(CGPath(roundedRect: rect, cornerWidth: 13, cornerHeight: 13, transform: nil))
    context.setFillColor(fill)
    context.fillPath()
}
bar(width: 190, y: -38, fill: color("#2B3A67"))
bar(width: 140, y: 0, fill: color("#2B3A67", alpha: 0.45))
bar(width: 92, y: 38, fill: color("#FF9A3D"))

guard let image = context.makeImage() else { fatalError("画像の生成に失敗しました") }
let url = URL(fileURLWithPath: output)
guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("出力先を開けません: \(output)") }
CGImageDestinationAddImage(destination, image, nil)
guard CGImageDestinationFinalize(destination) else { fatalError("PNG の書き出しに失敗しました") }
print("アイコンの元絵: \(output)")
