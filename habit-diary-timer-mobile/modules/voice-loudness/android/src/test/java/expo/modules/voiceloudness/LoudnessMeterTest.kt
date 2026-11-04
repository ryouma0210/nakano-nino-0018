package expo.modules.voiceloudness

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin

class LoudnessMeterTest {
  private fun tone(rate: Int, channels: Int, frequency: Double, seconds: Double = 3.0, amplitude: Double = 0.1): LoudnessMeter {
    val meter = LoudnessMeter(rate, channels)
    val frame = DoubleArray(channels)
    repeat((rate * seconds).toInt()) { index ->
      frame.fill(amplitude * sin(2 * PI * frequency * index / rate))
      meter.addFrame(frame)
    }
    return meter
  }

  @Test fun agreesWithIndependentFfmpeg48kReference() {
    // FFmpeg 8.1.2: aevalsrc=0.1*sin(2*PI*1000*t):s=48000:d=3, ebur128=metadata=1
    val result = tone(48000, 1, 1000.0)
    assertEquals(-23.010, result.integratedLufs()!!, 0.02)
    assertEquals(0.1, result.samplePeak, 1e-12)
    assertEquals(144000L, result.frames)
  }

  @Test fun agreesWithIndependentFfmpeg44kBassReference() {
    // FFmpeg 8.1.2: aevalsrc=0.1*sin(2*PI*50*t):s=44100:d=3, ebur128=metadata=1
    assertEquals(-27.642, tone(44100, 1, 50.0).integratedLufs()!!, 0.02)
  }

  @Test fun stereoSumsChannelEnergyWithoutDoublingSamplePeak() {
    val mono = tone(48000, 1, 1000.0)
    val stereo = tone(48000, 2, 1000.0)
    assertEquals(3.01029995664, stereo.integratedLufs()!! - mono.integratedLufs()!!, 1e-8)
    assertEquals(mono.samplePeak, stereo.samplePeak, 0.0)
  }

  @Test fun silenceAndSub400msAudioHaveNoIntegratedValue() {
    assertNull(tone(48000, 1, 1000.0, amplitude = 0.0).integratedLufs())
    val short = tone(48000, 1, 1000.0, seconds = 0.399)
    assertNull(short.integratedLufs())
    assertTrue(short.samplePeak > 0.09)
    assertNotNull(tone(48000, 1, 1000.0, seconds = 0.4).integratedLufs())
  }

  @Test fun longTrailingSilenceDoesNotDiluteLoudness() {
    val meter = tone(48000, 1, 1000.0)
    val before = meter.integratedLufs()!!
    repeat(48000 * 6) { meter.addFrame(doubleArrayOf(0.0)) }
    assertEquals(before, meter.integratedLufs()!!, 0.3)
  }

  @Test fun subThresholdTonesAreExcludedByAbsoluteGate() {
    assertNull(tone(48000, 1, 1000.0, amplitude = 0.00001).integratedLufs())
  }

  @Test fun refusesInvalidSamplesAndUnsupportedFormats() {
    assertThrows(IllegalArgumentException::class.java) { LoudnessMeter(48000, 6) }
    assertThrows(IllegalArgumentException::class.java) { LoudnessMeter(1000, 1) }
    assertThrows(IllegalArgumentException::class.java) { LoudnessMeter(48000, 1).addFrame(doubleArrayOf(Double.NaN)) }
  }
}
