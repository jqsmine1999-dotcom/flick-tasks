// Encodes a recorded frame sequence (frames.json + JPEGs) into an H.264 MP4 at a constant frame rate.
//   swift scripts/encode.swift <framesDir> <out.mp4> [fps]
// Screencast frames arrive only when the screen changes, so each output frame shows
// the latest captured frame at that moment.
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

struct Frame: Decodable { let file: String; let t: Double }

let args = CommandLine.arguments
guard args.count >= 3 else { fatalError("usage: encode.swift <framesDir> <out.mp4> [fps]") }
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let fps = Int32(args.count > 3 ? Int(args[3])! : 60)

let frames = try JSONDecoder().decode([Frame].self, from: Data(contentsOf: dir.appendingPathComponent("frames.json")))
guard let first = frames.first, let last = frames.last else { fatalError("no frames") }

func load(_ f: Frame) -> CGImage {
  let src = CGImageSourceCreateWithURL(dir.appendingPathComponent(f.file) as CFURL, nil)!
  return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}

let size = { let i = load(first); return (w: i.width & ~1, h: i.height & ~1) }()
try? FileManager.default.removeItem(at: out)
let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: size.w,
  AVVideoHeightKey: size.h,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 24_000_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoExpectedSourceFrameRateKey: fps,
  ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: size.w,
  kCVPixelBufferHeightKey as String: size.h,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func buffer(for image: CGImage) -> CVPixelBuffer {
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  let buf = pb!
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(
    data: CVPixelBufferGetBaseAddress(buf), width: size.w, height: size.h, bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: size.w, height: size.h))
  CVPixelBufferUnlockBaseAddress(buf, [])
  return buf
}

let total = Int((last.t - first.t) * Double(fps)) + 1
var idx = 0
var current: (index: Int, buf: CVPixelBuffer)? = nil
for n in 0..<total {
  let t = first.t + Double(n) / Double(fps)
  while idx + 1 < frames.count && frames[idx + 1].t <= t { idx += 1 }
  if current?.index != idx { current = (idx, buffer(for: load(frames[idx]))) }
  while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
  adaptor.append(current!.buf, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: fps))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fatalError("encode failed: \(String(describing: writer.error))") }
print("wrote \(out.path) \(size.w)x\(size.h) \(total) frames @\(fps)fps (\(String(format: "%.1f", Double(total) / Double(fps)))s)")
