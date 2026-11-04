package expo.modules.voiceloudness

import kotlin.math.*

/** BS.1770 K weighting with EBU R128 400 ms blocks / 100 ms hop and dual gate.
 * Channel weights are 1 for mono and stereo. No dual-mono compensation is used.
 * Only block energies and a 400 ms ring are kept; decoded audio is never retained.
 */
internal class LoudnessMeter(val sampleRate: Int, val channels: Int) {
  private class Biquad(
    private val b0: Double, private val b1: Double, private val b2: Double,
    private val a1: Double, private val a2: Double
  ) {
    private var z1 = 0.0
    private var z2 = 0.0
    fun next(x: Double): Double {
      val y = b0 * x + z1
      z1 = b1 * x - a1 * y + z2
      z2 = b2 * x - a2 * y
      return y
    }
  }

  private fun shelf(): Biquad {
    val k = tan(PI * 1681.974450955533 / sampleRate)
    val q = 0.7071752369554196
    val vh = 10.0.pow(3.999843853973347 / 20)
    val vb = vh.pow(0.4996667741545416)
    val d = 1 + k / q + k * k
    return Biquad((vh + vb * k / q + k * k) / d, 2 * (k * k - vh) / d,
      (vh - vb * k / q + k * k) / d, 2 * (k * k - 1) / d, (1 - k / q + k * k) / d)
  }

  private fun highPass(): Biquad {
    val k = tan(PI * 38.13547087602444 / sampleRate)
    val q = 0.5003270373238773
    val d = 1 + k / q + k * k
    // BS.1770's RLB numerator intentionally is NOT divided by d.
    return Biquad(1.0, -2.0, 1.0, 2 * (k * k - 1) / d, (1 - k / q + k * k) / d)
  }

  private val shelfFilters = Array(channels) { shelf() }
  private val highPassFilters = Array(channels) { highPass() }
  private val blockSize = (sampleRate * 0.4).roundToInt()
  private val hopSize = (sampleRate * 0.1).roundToInt()
  private val ring = DoubleArray(blockSize)
  private var ringIndex = 0
  private var sum = 0.0
  private val blocks = ArrayList<Double>()
  var frames = 0L
    private set
  var samplePeak = 0.0
    private set

  init {
    require(sampleRate in 8000..192000 && channels in 1..2) { "Unsupported audio format" }
  }

  fun addFrame(samples: DoubleArray) {
    var energy = 0.0
    for (c in 0 until channels) {
      val sample = samples[c]
      require(sample.isFinite()) { "Invalid audio samples" }
      samplePeak = max(samplePeak, abs(sample))
      val weighted = highPassFilters[c].next(shelfFilters[c].next(sample))
      energy += weighted * weighted
    }
    sum += energy - ring[ringIndex]
    ring[ringIndex] = energy
    ringIndex = (ringIndex + 1) % blockSize
    frames++
    // A finite bound also prevents unbounded block-energy arrays for damaged files.
    require(frames <= sampleRate.toLong() * 60 * 60 * 12) { "Audio is longer than 12 hours" }
    if (frames >= blockSize && (frames - blockSize) % hopSize == 0L) {
      blocks.add(max(0.0, sum / blockSize))
    }
  }

  fun integratedLufs(): Double? {
    val absoluteEnergy = 10.0.pow((-70.0 + 0.691) / 10)
    val absolute = blocks.filter { it > absoluteEnergy }
    if (absolute.isEmpty()) return null
    val relativeEnergy = absolute.average() / 10
    val gated = absolute.filter { it > relativeEnergy }
    if (gated.isEmpty()) return null
    return -0.691 + 10 * log10(gated.average())
  }

  fun result(): Map<String, Any?> = mapOf(
    "integratedLufs" to integratedLufs(), "samplePeak" to samplePeak,
    "duration" to frames.toDouble() / sampleRate, "sampleRate" to sampleRate,
    "channels" to channels
  )
}
