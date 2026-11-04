import ExpoModulesCore
import AVFoundation
import CoreMedia
import AudioToolbox

public final class VoiceLoudnessModule: Module {
  private let worker = DispatchQueue(label: "jp.local.habitdiarytimer.voice-loudness", qos: .utility)
  private let jobLock = NSLock()
  private var jobs: [String: LoudnessCancellation] = [:]

  public func definition() -> ModuleDefinition {
    Name("VoiceLoudness")
    Events("progress")

    AsyncFunction("analyze") { (uri: String, operationId: String, promise: Promise) in
      self.submit(operationId, promise: promise) { cancellation in
        try self.analyzeFile(self.sourceURL(uri), cancellation: cancellation,
          progress: self.reporter(operationId, phase: "analyzing")).result
      }
    }

    AsyncFunction("normalizeM4a") { (uri: String, targetLufs: Double, operationId: String, promise: Promise) in
      self.submit(operationId, promise: promise) { cancellation in
        guard targetLufs.isFinite, (-30.0 ... -20.0).contains(targetLufs) else {
          throw LoudnessError("Target must be between -30 and -20 LUFS")
        }
        let source = try self.sourceURL(uri)
        let input = try self.analyzeFile(source, cancellation: cancellation,
          progress: self.reporter(operationId, phase: "analyzing"))
        guard let loudness = input.integratedLufs else { throw LoudnessError("Audio is silent or shorter than 400 ms") }
        let wantedGain = pow(10.0, (targetLufs - loudness) / 20)
        let ceiling = pow(10.0, -1.0 / 20)
        var gain = min(wantedGain, ceiling / input.samplePeak)
        guard let cache = self.appContext?.config.cacheDirectory else { throw LoudnessError("Application cache unavailable") }
        let base = cache.appendingPathComponent("voice-loudness", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        let bitRate = input.channels == 1 ? 64000 : 128000
        let outputSize = Int64(ceil(Double(input.frames) / Double(input.sampleRate) * Double(bitRate) / 8 * 1.2))
        let capacity = try base.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage
        if let capacity, capacity <= outputSize + 2 * 1024 * 1024 { throw LoudnessError("Not enough space to adjust this audio") }
        let destination = base.appendingPathComponent("normalized-\(UUID().uuidString).m4a")
        var succeeded = false
        defer { if !succeeded { try? FileManager.default.removeItem(at: destination) } }
        var finalOutput: LoudnessMeter?
        // AAC reconstruction can overshoot. Inspect the finished file and,
        // if necessary, re-encode from the original once with extra headroom.
        for attempt in 0...1 {
          if attempt > 0 { try FileManager.default.removeItem(at: destination) }
          let writer = try LoudnessM4aWriter(destination, sampleRate: input.sampleRate, channels: input.channels, bitRate: bitRate)
          do {
            var encodedFrames: Int64 = 0
            try self.decode(source, cancellation: cancellation, progress: self.reporter(operationId, phase: "normalizing"),
              onFormat: { sampleRate, channels in
                guard sampleRate == input.sampleRate, channels == input.channels else {
                  throw LoudnessError("Audio format changed during conversion")
                }
              }, onFrame: { frame in
                try writer.frame(frame, gain: gain)
                encodedFrames += 1
              })
            try cancellation.check()
            guard encodedFrames == input.frames else { throw LoudnessError("Audio changed during conversion") }
            try writer.finish()
          } catch { writer.close(); throw error }
          let output = try self.analyzeFile(destination, cancellation: cancellation, progress: self.reporter(operationId, phase: "normalizing"))
          finalOutput = output
          try cancellation.check()
          if output.samplePeak <= ceiling + 1.0 / 32768 { break }
          if attempt == 0 { gain *= ceiling / output.samplePeak * pow(10.0, -0.2 / 20) }
        }
        guard let output = finalOutput, output.integratedLufs != nil else { throw LoudnessError("Encoded audio has no measurable loudness") }
        guard output.samplePeak <= ceiling + 1.0 / 32768 else { throw LoudnessError("Encoded audio exceeds the sample-peak ceiling") }
        try cancellation.check()
        succeeded = true
        return ["uri": destination.absoluteString, "format": "m4a", "analysis": output.result,
          "targetLufs": targetLufs, "appliedGainDb": 20 * log10(gain),
          "peakLimited": gain < wantedGain - 1e-10] as [String: Any]
      }
    }

    Function("cancel") { (operationId: String) in
      self.jobLock.lock()
      let job = self.jobs[operationId]
      self.jobLock.unlock()
      job?.cancel()
    }

    OnDestroy {
      self.jobLock.lock()
      let active = Array(self.jobs.values)
      self.jobLock.unlock()
      active.forEach { $0.cancel() }
    }
  }

  private func submit(_ id: String, promise: Promise, operation: @escaping (LoudnessCancellation) throws -> Any) {
    let cancellation = LoudnessCancellation()
    jobLock.lock()
    guard !id.isEmpty, jobs[id] == nil else {
      jobLock.unlock()
      promise.reject("ERR_VOICE_LOUDNESS_BUSY", "An audio operation with this ID already exists")
      return
    }
    jobs[id] = cancellation
    jobLock.unlock()
    worker.async {
      defer {
        self.jobLock.lock()
        self.jobs.removeValue(forKey: id)
        self.jobLock.unlock()
      }
      do {
        try cancellation.check()
        promise.resolve(try operation(cancellation))
      } catch {
        promise.reject(cancellation.isCancelled ? "ERR_VOICE_LOUDNESS_CANCELLED" : "ERR_VOICE_LOUDNESS", error.localizedDescription)
      }
    }
  }

  private func reporter(_ id: String, phase: String) -> (Double) -> Void {
    var last = 0.0
    return { progress in
      let now = ProcessInfo.processInfo.systemUptime
      if progress >= 1 || now - last >= 0.1 {
        last = now
        self.sendEvent("progress", ["operationId": id, "phase": phase, "progress": min(1, max(0, progress))])
      }
    }
  }

  private func sourceURL(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL else { throw LoudnessError("Only local audio files can be processed") }
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, (values.fileSize ?? 0) > 0 else { throw LoudnessError("Audio file does not exist") }
    return url
  }

  private func analyzeFile(_ url: URL, cancellation: LoudnessCancellation, progress: @escaping (Double) -> Void) throws -> LoudnessMeter {
    var meter: LoudnessMeter?
    try decode(url, cancellation: cancellation, progress: progress, onFormat: { sampleRate, channels in
      if let previous = meter {
        guard previous.sampleRate == sampleRate, previous.channels == channels else { throw LoudnessError("Changing audio formats are unsupported") }
      } else { meter = try LoudnessMeter(sampleRate: sampleRate, channels: channels) }
    }, onFrame: { frame in try meter!.addFrame(frame) })
    guard let result = meter, result.frames > 0 else { throw LoudnessError("Audio contains no samples") }
    return result
  }

  private func decode(_ url: URL, cancellation: LoudnessCancellation, progress: (Double) -> Void,
    onFormat: (Int, Int) throws -> Void, onFrame: (inout [Double]) throws -> Void) throws {
    try cancellation.check()
    // File-backed asset loading and sample decoding run only on the utility queue.
    let asset = AVURLAsset(url: url)
    guard let track = asset.tracks(withMediaType: .audio).first else { throw LoudnessError("File contains no audio track") }
    let duration = asset.duration.seconds
    let reader = try AVAssetReader(asset: asset)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false
    ]
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw LoudnessError("Audio format cannot be decoded") }
    reader.add(output)
    guard reader.startReading() else { throw reader.error ?? LoudnessError("Audio decoder could not start") }
    defer { if reader.status == .reading { reader.cancelReading() } }
    var sampleRate = 0
    var channels = 0
    var frames: Int64 = 0
    var frame: [Double] = []
    while reader.status == .reading {
      try cancellation.check()
      let hasSample = try autoreleasepool { () throws -> Bool in
        guard let sample = output.copyNextSampleBuffer() else { return false }
        guard let format = CMSampleBufferGetFormatDescription(sample),
              let description = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
              let block = CMSampleBufferGetDataBuffer(sample) else { throw LoudnessError("Decoder returned invalid audio") }
        let rate = Int(description.mSampleRate.rounded())
        let count = Int(description.mChannelsPerFrame)
        guard (8000...192000).contains(rate), (1...2).contains(count),
              description.mFormatID == kAudioFormatLinearPCM, description.mBitsPerChannel == 32,
              description.mFormatFlags & kAudioFormatFlagIsFloat != 0,
              description.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0 else {
          throw LoudnessError("Only mono or stereo audio from 8 to 192 kHz is supported")
        }
        if sampleRate == 0 {
          sampleRate = rate; channels = count; frame = Array(repeating: 0, count: count)
          try onFormat(rate, count)
        } else if rate != sampleRate || count != channels { throw LoudnessError("Changing audio formats are unsupported") }
        let length = CMBlockBufferGetDataLength(block)
        guard length > 0, length <= 16 * 1024 * 1024, length % (channels * 4) == 0 else {
          throw LoudnessError("Invalid decoded audio chunk")
        }
        var bytes = Data(count: length)
        let status = bytes.withUnsafeMutableBytes { buffer in
          CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: buffer.baseAddress!)
        }
        guard status == kCMBlockBufferNoErr else { throw LoudnessError("Could not read decoded audio") }
        try bytes.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) in
          for offset in stride(from: 0, to: length, by: channels * 4) {
            for channel in 0..<channels {
              let raw = buffer.loadUnaligned(fromByteOffset: offset + channel * 4, as: UInt32.self)
              frame[channel] = Double(Float(bitPattern: UInt32(littleEndian: raw)))
              guard frame[channel].isFinite else { throw LoudnessError("Invalid audio samples") }
            }
            try onFrame(&frame)
            frames += 1
            guard frames <= Int64(sampleRate) * 60 * 60 * 12 else { throw LoudnessError("Audio is longer than 12 hours") }
          }
        }
        if duration.isFinite && duration > 0 { progress(min(0.99, Double(frames) / Double(sampleRate) / duration)) }
        return true
      }
      if !hasSample { break }
    }
    try cancellation.check()
    guard reader.status == .completed, frames > 0 else {
      throw reader.error ?? LoudnessError("Audio decoding did not complete")
    }
    progress(1)
  }
}

private final class LoudnessCancellation {
  private let lock = NSLock()
  private var cancelled = false
  var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }
  func cancel() { lock.lock(); cancelled = true; lock.unlock() }
  func check() throws { if isCancelled { throw LoudnessError("Audio processing cancelled") } }
}

/// AVAudioFile streams PCM through the system AAC-LC encoder into an M4A file.
/// Releasing the file finalizes encoder packets and the MPEG-4 container.
private final class LoudnessM4aWriter {
  private var output: AVAudioFile?
  private let buffer: AVAudioPCMBuffer
  private let channels: Int
  private var used: AVAudioFrameCount = 0
  private var frames: Int64 = 0
  init(_ url: URL, sampleRate: Int, channels: Int, bitRate: Int) throws {
    self.channels = channels
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: channels,
      AVEncoderBitRateKey: bitRate,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
    ]
    let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
    guard Int(file.processingFormat.sampleRate.rounded()) == sampleRate,
          Int(file.processingFormat.channelCount) == channels,
          let pcm = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 1024),
          pcm.floatChannelData != nil else {
      throw LoudnessError("AAC encoding is unavailable for this sample rate")
    }
    output = file
    buffer = pcm
  }
  func frame(_ samples: [Double], gain: Double) throws {
    guard output != nil, let pointers = buffer.floatChannelData else { throw LoudnessError("AAC encoder is closed") }
    for channel in 0..<channels {
      pointers[channel][Int(used)] = Float(min(1, max(-1, samples[channel] * gain)))
    }
    used += 1
    frames += 1
    if used == buffer.frameCapacity { try flush() }
  }
  private func flush() throws {
    guard used > 0 else { return }
    guard let file = output else { throw LoudnessError("AAC encoder is closed") }
    buffer.frameLength = used
    try file.write(from: buffer)
    used = 0
  }
  func finish() throws {
    guard frames > 0 else { throw LoudnessError("Audio contains no samples") }
    try flush()
    close()
  }
  func close() {
    if #available(iOS 18.0, *) { output?.close() }
    output = nil
  }
}
