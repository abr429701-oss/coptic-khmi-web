import Foundation
import Vision
import AppKit
let path = CommandLine.arguments[1]
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
