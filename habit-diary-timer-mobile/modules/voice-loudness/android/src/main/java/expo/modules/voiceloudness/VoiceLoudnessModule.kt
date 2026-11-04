package expo.modules.voiceloudness

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.*

class VoiceLoudnessModule : Module() {
  private val worker = Executors.newSingleThreadExecutor()
  private val jobs = ConcurrentHashMap<String, AtomicBoolean>()

  override fun definition() = ModuleDefinition {
    Name("VoiceLoudness")
    Events("progress")

    AsyncFunction("analyze") { uri: String, operationId: String, promise: Promise ->
      submit(operationId, promise) { cancelled ->
        analyzeFile(sourceFile(uri), cancelled, reporter(operationId, "analyzing")).result()
      }
    }

    AsyncFunction("normalizeM4a") { uri: String, targetLufs: Double, operationId: String, promise: Promise ->
      submit(operationId, promise) { cancelled ->
        require(targetLufs.isFinite() && targetLufs in -30.0..-20.0) { "Target must be between -30 and -20 LUFS" }
        val source = sourceFile(uri)
        val input = analyzeFile(source, cancelled, reporter(operationId, "analyzing"))
        val loudness = input.integratedLufs() ?: error("Audio is silent or shorter than 400 ms")
        val wantedGain = 10.0.pow((targetLufs - loudness) / 20)
        val ceiling = 10.0.pow(-1.0 / 20)
        var gain = min(wantedGain, ceiling / input.samplePeak)
        val directory = File(appContext.cacheDirectory, "voice-loudness")
        check(directory.isDirectory || directory.mkdirs()) { "Cannot create temporary audio directory" }
        val bitRate = if (input.channels == 1) 64000 else 128000
        val outputSize = ceil(input.frames.toDouble() / input.sampleRate * bitRate / 8 * 1.2).toLong()
        check(directory.usableSpace > outputSize + 2 * 1024 * 1024) { "Not enough space to adjust this audio" }
        val destination = File(directory, "normalized-${UUID.randomUUID()}.m4a")
        try {
          var output: LoudnessMeter? = null
          // AAC can reconstruct peaks above the PCM input. Re-encode once with
          // measured overshoot plus 0.2 dB headroom; never measure ideal PCM only.
          for (attempt in 0..1) {
            if (attempt > 0) check(destination.delete()) { "Cannot replace temporary audio" }
            var encodedFrames = 0L
            M4aWriter(destination, input.sampleRate, input.channels, bitRate) { checkCancelled(cancelled) }.use { writer ->
              decode(source, cancelled, reporter(operationId, "normalizing"), { sampleRate, channels ->
                require(sampleRate == input.sampleRate && channels == input.channels) { "Audio format changed during conversion" }
              }) { frame ->
                writer.frame(frame, gain)
                encodedFrames++
              }
              checkCancelled(cancelled)
              require(encodedFrames == input.frames) { "Audio changed during conversion" }
              writer.finish()
            }
            output = analyzeFile(destination, cancelled, reporter(operationId, "normalizing"))
            checkCancelled(cancelled)
            if (output.samplePeak <= ceiling + 1.0 / 32768) break
            if (attempt == 0) gain *= ceiling / output.samplePeak * 10.0.pow(-0.2 / 20)
          }
          val finalOutput = output ?: error("Audio encoding produced no result")
          check(finalOutput.samplePeak <= ceiling + 1.0 / 32768) { "Encoded audio exceeds the sample-peak ceiling" }
          check(finalOutput.integratedLufs() != null) { "Encoded audio has no measurable loudness" }
          mapOf("uri" to Uri.fromFile(destination).toString(), "format" to "m4a", "analysis" to finalOutput.result(),
            "targetLufs" to targetLufs, "appliedGainDb" to 20 * log10(gain),
            "peakLimited" to (gain < wantedGain - 1e-10))
        } catch (cause: Throwable) {
          destination.delete()
          throw cause
        }
      }
    }

    Function("cancel") { operationId: String -> jobs[operationId]?.set(true) }

    OnDestroy {
      jobs.values.forEach { it.set(true) }
      // The current worker observes cancellation and releases codec/file resources.
      worker.shutdown()
    }
  }

  private fun submit(id: String, promise: Promise, operation: (AtomicBoolean) -> Any?) {
    val cancelled = AtomicBoolean(false)
    if (id.isBlank() || jobs.putIfAbsent(id, cancelled) != null) {
      promise.reject("ERR_VOICE_LOUDNESS_BUSY", "An audio operation with this ID already exists", null)
      return
    }
    try {
      worker.execute {
        try {
          checkCancelled(cancelled)
          promise.resolve(operation(cancelled))
        } catch (cause: Exception) {
          promise.reject(if (cancelled.get()) "ERR_VOICE_LOUDNESS_CANCELLED" else "ERR_VOICE_LOUDNESS",
            cause.message ?: "Audio processing failed", cause)
        } finally { jobs.remove(id, cancelled) }
      }
    } catch (cause: Exception) {
      jobs.remove(id, cancelled)
      promise.reject("ERR_VOICE_LOUDNESS", "Audio processing is unavailable", cause)
    }
  }

  private fun reporter(id: String, phase: String): (Double) -> Unit {
    var last = 0L
    return { progress ->
      val now = System.nanoTime()
      if (progress >= 1 || now - last >= 100_000_000) {
        last = now
        sendEvent("progress", mapOf("operationId" to id, "phase" to phase, "progress" to progress.coerceIn(0.0, 1.0)))
      }
    }
  }

  private fun sourceFile(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Only local audio files can be processed" }
    val file = File(parsed.path ?: error("Invalid audio path"))
    require(file.isFile && file.length() > 0) { "Audio file does not exist" }
    return file
  }

  private fun checkCancelled(cancelled: AtomicBoolean) {
    check(!cancelled.get() && !Thread.currentThread().isInterrupted) { "Audio processing cancelled" }
  }

  private fun analyzeFile(file: File, cancelled: AtomicBoolean, progress: (Double) -> Unit): LoudnessMeter {
    var meter: LoudnessMeter? = null
    decode(file, cancelled, progress, { sampleRate, channels ->
      val previous = meter
      require(previous == null || (previous.sampleRate == sampleRate && previous.channels == channels)) { "Changing audio formats are unsupported" }
      if (previous == null) meter = LoudnessMeter(sampleRate, channels)
    }) { frame -> meter!!.addFrame(frame) }
    return meter?.takeIf { it.frames > 0 } ?: error("Audio contains no samples")
  }

  private fun decode(
    file: File, cancelled: AtomicBoolean, progress: (Double) -> Unit,
    onFormat: (Int, Int) -> Unit, onFrame: (DoubleArray) -> Unit
  ) {
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    try {
      extractor.setDataSource(file.absolutePath)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: error("File contains no audio track")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: error("Unknown audio format")
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var encoding = if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)) format.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
      var frame = DoubleArray(channels.coerceIn(1, 2))
      var frameCount = 0L
      val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION).coerceAtLeast(0L) else 0L

      fun applyFormat(next: MediaFormat) {
        val nextRate = next.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val nextChannels = next.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        require(nextRate in 8000..192000 && nextChannels in 1..2) { "Only mono or stereo audio from 8 to 192 kHz is supported" }
        require(frameCount == 0L || (nextRate == sampleRate && nextChannels == channels)) { "Changing audio formats are unsupported" }
        sampleRate = nextRate
        channels = nextChannels
        encoding = if (next.containsKey(MediaFormat.KEY_PCM_ENCODING)) next.getInteger(MediaFormat.KEY_PCM_ENCODING) else AudioFormat.ENCODING_PCM_16BIT
        require(encoding in setOf(AudioFormat.ENCODING_PCM_8BIT, AudioFormat.ENCODING_PCM_16BIT, AudioFormat.ENCODING_PCM_FLOAT, 21, 22)) { "Unsupported PCM encoding" }
        frame = DoubleArray(channels)
        onFormat(sampleRate, channels)
      }

      fun consume(bytes: ByteBuffer) {
        checkCancelled(cancelled)
        bytes.order(ByteOrder.LITTLE_ENDIAN)
        val sampleBytes = when (encoding) { AudioFormat.ENCODING_PCM_8BIT -> 1; AudioFormat.ENCODING_PCM_16BIT -> 2; 21 -> 3; else -> 4 }
        require(bytes.remaining() % (sampleBytes * channels) == 0) { "Incomplete audio frame" }
        while (bytes.remaining() >= sampleBytes * channels) {
          for (channel in 0 until channels) {
            frame[channel] = when (encoding) {
              AudioFormat.ENCODING_PCM_8BIT -> ((bytes.get().toInt() and 255) - 128) / 128.0
              AudioFormat.ENCODING_PCM_16BIT -> bytes.short / 32768.0
              AudioFormat.ENCODING_PCM_FLOAT -> bytes.float.toDouble()
              21 -> {
                val value = (bytes.get().toInt() and 255) or ((bytes.get().toInt() and 255) shl 8) or (bytes.get().toInt() shl 16)
                value / 8388608.0
              }
              else -> bytes.int / 2147483648.0
            }
            require(frame[channel].isFinite()) { "Invalid audio samples" }
          }
          onFrame(frame)
          frameCount++
          require(frameCount <= sampleRate.toLong() * 60 * 60 * 12) { "Audio is longer than 12 hours" }
        }
        if (durationUs > 0) progress(min(0.99, frameCount.toDouble() * 1_000_000 / sampleRate / durationUs))
      }

      if (mime == "audio/raw") {
        applyFormat(format)
        val capacity = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE).coerceAtLeast(262144) else 1048576
        require(capacity <= 16 * 1024 * 1024) { "Audio chunk exceeds supported size" }
        val buffer = ByteBuffer.allocateDirect(capacity)
        while (true) {
          checkCancelled(cancelled)
          buffer.clear()
          val size = extractor.readSampleData(buffer, 0)
          if (size < 0) break
          buffer.position(0)
          buffer.limit(size)
          consume(buffer)
          extractor.advance()
        }
      } else {
        val decoder = MediaCodec.createDecoderByType(mime)
        codec = decoder
        decoder.configure(format, null, null, 0)
        decoder.start()
        val info = MediaCodec.BufferInfo()
        var inputEnded = false
        var outputEnded = false
        var outputFormatKnown = false
        var stalledSince = System.nanoTime()
        while (!outputEnded) {
          checkCancelled(cancelled)
          var advanced = false
          if (!inputEnded) {
            val inputIndex = decoder.dequeueInputBuffer(10000)
            if (inputIndex >= 0) {
              val input = decoder.getInputBuffer(inputIndex) ?: error("Decoder input unavailable")
              input.clear()
              val size = extractor.readSampleData(input, 0)
              if (size < 0) {
                decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputEnded = true
              } else {
                decoder.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime.coerceAtLeast(0L), 0)
                extractor.advance()
              }
              advanced = true
            }
          }
          when (val outputIndex = decoder.dequeueOutputBuffer(info, 10000)) {
            MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              applyFormat(decoder.outputFormat)
              outputFormatKnown = true
              advanced = true
            }
            else -> if (outputIndex >= 0) {
              try {
                if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                  if (!outputFormatKnown) { applyFormat(decoder.outputFormat); outputFormatKnown = true }
                  val output = decoder.getOutputBuffer(outputIndex) ?: error("Decoder output unavailable")
                  output.position(info.offset)
                  output.limit(info.offset + info.size)
                  consume(output.slice())
                }
                outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
              } finally { decoder.releaseOutputBuffer(outputIndex, false) }
              advanced = true
            }
          }
          if (advanced) stalledSince = System.nanoTime()
          check(System.nanoTime() - stalledSince < 30_000_000_000L) { "Audio decoder timed out" }
        }
      }
      require(frameCount > 0) { "Audio contains no samples" }
      progress(1.0)
    } finally {
      try { codec?.stop() } catch (_: Exception) { /* release still must run */ }
      try { codec?.release() } finally { extractor.release() }
    }
  }
}

/** AAC-LC encoder with a small PCM input buffer; no intermediate WAV is written. */
private class M4aWriter(
  file: File, private val sampleRate: Int, private val channels: Int, bitRate: Int,
  private val checkCancelled: () -> Unit
) : AutoCloseable {
  private var codec: MediaCodec? = null
  private var muxer: MediaMuxer? = null
  private var muxerStarted = false
  private var track = -1
  private val buffer = ByteArray(1024 * channels * 2)
  private var used = 0
  private var queuedFrames = 0L
  private var outputEnded = false
  private var finished = false
  private var packets = 0L
  private var timestampOffsetUs: Long? = null
  private var lastTimestampUs = -1L
  private var lastProgress = System.nanoTime()
  private val info = MediaCodec.BufferInfo()

  init {
    try {
      val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channels).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
        setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, buffer.size)
      }
      val encoderName = MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format)
        ?: error("AAC encoding is unavailable for this sample rate")
      val encoder = MediaCodec.createByCodecName(encoderName)
      codec = encoder
      encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      encoder.start()
    } catch (cause: Exception) { close(); throw cause }
  }

  fun frame(samples: DoubleArray, gain: Double) {
    check(!finished) { "Encoder already completed" }
    for (sample in samples) {
      val value = floor((sample * gain).coerceIn(-1.0, 32767.0 / 32768) * 32768 + 0.5).toInt().coerceIn(-32768, 32767)
      buffer[used++] = (value and 255).toByte()
      buffer[used++] = ((value shr 8) and 255).toByte()
    }
    if (used == buffer.size) flush()
  }

  private fun inputBuffer(): Pair<Int, ByteBuffer> {
    val encoder = codec ?: error("Encoder is closed")
    while (true) {
      checkCancelled()
      val index = encoder.dequeueInputBuffer(10000)
      if (index >= 0) {
        val input = encoder.getInputBuffer(index) ?: error("Encoder input unavailable")
        input.clear()
        return index to input
      }
      drain(false)
      check(System.nanoTime() - lastProgress < 30_000_000_000L) { "Audio encoder timed out" }
    }
  }

  private fun flush() {
    val encoder = codec ?: error("Encoder is closed")
    var offset = 0
    while (offset < used) {
      val (index, input) = inputBuffer()
      val bytes = min(used - offset, input.remaining() / (channels * 2) * channels * 2)
      require(bytes > 0) { "Encoder input is too small" }
      input.put(buffer, offset, bytes)
      encoder.queueInputBuffer(index, 0, bytes, queuedFrames * 1_000_000L / sampleRate, 0)
      queuedFrames += bytes / (channels * 2)
      offset += bytes
      lastProgress = System.nanoTime()
      drain(false)
    }
    used = 0
  }

  private fun drain(waitForEnd: Boolean) {
    val encoder = codec ?: error("Encoder is closed")
    val output = muxer ?: error("Muxer is closed")
    while (!outputEnded) {
      checkCancelled()
      when (val index = encoder.dequeueOutputBuffer(info, if (waitForEnd) 10000 else 0)) {
        MediaCodec.INFO_TRY_AGAIN_LATER -> {
          if (!waitForEnd) return
          check(System.nanoTime() - lastProgress < 30_000_000_000L) { "Audio encoder timed out" }
        }
        MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          check(!muxerStarted) { "AAC encoder changed its output format" }
          track = output.addTrack(encoder.outputFormat)
          output.start()
          muxerStarted = true
          lastProgress = System.nanoTime()
        }
        else -> if (index >= 0) {
          try {
            if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
              check(muxerStarted) { "AAC encoder did not publish its format" }
              val bytes = encoder.getOutputBuffer(index) ?: error("Encoder output unavailable")
              bytes.position(info.offset)
              bytes.limit(info.offset + info.size)
              // Some encoders report a negative priming timestamp. Translate the
              // whole stream once, instead of clamping multiple packets to zero.
              val offset = timestampOffsetUs ?: max(0L, -info.presentationTimeUs).also { timestampOffsetUs = it }
              val timestamp = info.presentationTimeUs + offset
              check(timestamp >= 0 && timestamp >= lastTimestampUs) { "AAC encoder returned invalid timestamps" }
              info.presentationTimeUs = timestamp
              output.writeSampleData(track, bytes, info)
              lastTimestampUs = timestamp
              packets++
            }
            outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
          } finally { encoder.releaseOutputBuffer(index, false) }
          lastProgress = System.nanoTime()
        }
      }
    }
  }

  fun finish() {
    check(!finished) { "Encoder already completed" }
    flush()
    require(queuedFrames > 0) { "Audio contains no samples" }
    val (index, _) = inputBuffer()
    codec!!.queueInputBuffer(index, 0, 0, queuedFrames * 1_000_000L / sampleRate, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
    lastProgress = System.nanoTime()
    drain(true)
    check(muxerStarted && packets > 0) { "AAC encoding produced no audio" }
    muxer!!.stop()
    muxerStarted = false
    finished = true
  }

  override fun close() {
    try { codec?.stop() } catch (_: Exception) { /* Preserve original failure. */ }
    try { codec?.release() } catch (_: Exception) { /* Release the muxer too. */ }
    codec = null
    if (muxerStarted) try { muxer?.stop() } catch (_: Exception) { /* Incomplete files are deleted by the caller. */ }
    try { muxer?.release() } catch (_: Exception) { /* Best-effort cleanup on cancellation. */ }
    muxer = null
    muxerStarted = false
  }
}
