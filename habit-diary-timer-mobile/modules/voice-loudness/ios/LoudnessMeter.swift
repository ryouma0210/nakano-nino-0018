import Foundation

// BS.1770 K weighting, 400 ms blocks with 100 ms hop, -70 LUFS and -10 LU gates.
// Mono has weight 1 (no dual-mono compensation); stereo is the sum of both channels.
final class LoudnessMeter {
  private struct Biquad {
    let b0: Double, b1: Double, b2: Double, a1: Double, a2: Double
    var z1 = 0.0, z2 = 0.0
    mutating func next(_ x: Double) -> Double {
      let y = b0 * x + z1
      z1 = b1 * x - a1 * y + z2
      z2 = b2 * x - a2 * y
      return y
    }
  }

  let sampleRate: Int
  let channels: Int
  private let blockSize: Int
  private let hopSize: Int
  private var shelves: [Biquad]
  private var highPasses: [Biquad]
  private var ring: [Double]
  private var ringIndex = 0
  private var sum = 0.0
  private var blocks: [Double] = []
  private(set) var frames: Int64 = 0
  private(set) var samplePeak = 0.0

  init(sampleRate: Int, channels: Int) throws {
    guard (8000...192000).contains(sampleRate), (1...2).contains(channels) else {
      throw LoudnessError("Only mono or stereo audio from 8 to 192 kHz is supported")
    }
    self.sampleRate = sampleRate
    self.channels = channels
    blockSize = Int((Double(sampleRate) * 0.4).rounded())
    hopSize = Int((Double(sampleRate) * 0.1).rounded())
    ring = Array(repeating: 0, count: blockSize)
    let k = tan(.pi * 1681.974450955533 / Double(sampleRate))
    let q = 0.7071752369554196
    let vh = pow(10.0, 3.999843853973347 / 20)
    let vb = pow(vh, 0.4996667741545416)
    let d = 1 + k / q + k * k
    let shelf = Biquad(b0: (vh + vb * k / q + k * k) / d,
      b1: 2 * (k * k - vh) / d, b2: (vh - vb * k / q + k * k) / d,
      a1: 2 * (k * k - 1) / d, a2: (1 - k / q + k * k) / d)
    let hk = tan(.pi * 38.13547087602444 / Double(sampleRate))
    let hq = 0.5003270373238773
    let hd = 1 + hk / hq + hk * hk
    // RLB numerator intentionally is not normalized by hd.
    let highPass = Biquad(b0: 1, b1: -2, b2: 1,
      a1: 2 * (hk * hk - 1) / hd, a2: (1 - hk / hq + hk * hk) / hd)
    shelves = Array(repeating: shelf, count: channels)
    highPasses = Array(repeating: highPass, count: channels)
  }

  func addFrame(_ samples: [Double]) throws {
    var energy = 0.0
    for channel in 0..<channels {
      let sample = samples[channel]
      guard sample.isFinite else { throw LoudnessError("Invalid audio samples") }
      samplePeak = max(samplePeak, abs(sample))
      let shelf = shelves[channel].next(sample)
      let weighted = highPasses[channel].next(shelf)
      energy += weighted * weighted
    }
    sum += energy - ring[ringIndex]
    ring[ringIndex] = energy
    ringIndex = (ringIndex + 1) % blockSize
    frames += 1
    guard frames <= Int64(sampleRate) * 60 * 60 * 12 else { throw LoudnessError("Audio is longer than 12 hours") }
    if frames >= blockSize && (frames - Int64(blockSize)) % Int64(hopSize) == 0 {
      blocks.append(max(0, sum / Double(blockSize)))
    }
  }

  var integratedLufs: Double? {
    let absoluteEnergy = pow(10.0, (-70 + 0.691) / 10)
    let absolute = blocks.filter { $0 > absoluteEnergy }
    guard !absolute.isEmpty else { return nil }
    let relativeEnergy = absolute.reduce(0, +) / Double(absolute.count) / 10
    let gated = absolute.filter { $0 > relativeEnergy }
    guard !gated.isEmpty else { return nil }
    return -0.691 + 10 * log10(gated.reduce(0, +) / Double(gated.count))
  }

  var result: [String: Any] {
    ["integratedLufs": integratedLufs.map { $0 as Any } ?? NSNull(),
     "samplePeak": samplePeak, "duration": Double(frames) / Double(sampleRate),
     "sampleRate": sampleRate, "channels": channels]
  }
}

struct LoudnessError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}
