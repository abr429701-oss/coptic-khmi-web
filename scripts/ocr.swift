import Foundation
import Vision
import AppKit
let path = CommandLine.arguments[1]
if CommandLine.arguments.count >= 7 && CommandLine.arguments[2] == "green" {
  guard let img0 = NSImage(contentsOfFile: path), let cg0 = img0.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print(0); exit(0) }
  let w = cg0.width, h = cg0.height
  var buf = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(cg0, in: CGRect(x: 0, y: 0, width: w, height: h))
  let x0 = Int(CommandLine.arguments[3])!, y0 = Int(CommandLine.arguments[4])!, x1 = min(Int(CommandLine.arguments[5])!, w), y1 = min(Int(CommandLine.arguments[6])!, h)
  var n = 0
  var y = y0
  while y < y1 { var x = x0; while x < x1 { let i = (y * w + x) * 4; let r = Int(buf[i]), g = Int(buf[i+1]), b = Int(buf[i+2]); if g > r + 40 && g > b + 25 && g > 110 { n += 1 }; x += 2 }; y += 2 }
  print(n); exit(0)
}
guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(2) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
let h = VNImageRequestHandler(cgImage: cg, options: [:])
try? h.perform([req])
for o in (req.results ?? []) {
  guard let c = o.topCandidates(1).first else { continue }
  let b = o.boundingBox
  let x = (b.minX + b.width/2) * 440.0
  let y = (1.0 - (b.minY + b.height/2)) * 956.0
  print(String(format: "%.0f\t%.0f\t%@", x, y, c.string.replacingOccurrences(of: "\t", with: " ")))
}
