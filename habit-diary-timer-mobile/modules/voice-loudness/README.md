# Voice loudness native module

Local Expo module, discovered from `modules/` by Expo Autolinking. Android/iOS
must be rebuilt to include it; Expo Go and older binaries do not contain it.
This module never runs on import or when a voice starts playing.

- `analyze(uri, operationId)` returns `integratedLufs` (nullable), linear
  `samplePeak`, `duration` in seconds, `sampleRate`, and `channels`.
- `normalizeM4a(uri, targetLufs, operationId)` accepts targets from -30 to -20 LUFS
  and returns `{uri, format: "m4a", analysis, targetLufs, appliedGainDb, peakLimited}`.
  The URI refers to a new AAC-LC/M4A in the app's cache directory. The caller owns
  that temporary file and must delete it after saving, rejecting or canceling.
- `cancel(operationId)` cooperatively cancels a pending/running job.
- The `progress` event contains `{operationId, phase, progress}`; phase is
  `analyzing` or `normalizing`, and progress runs from 0 to 1 for each pass.

Processing is offline on a native worker queue. Android decodes with
MediaExtractor/MediaCodec and encodes AAC with MediaCodec/MediaMuxer; iOS uses
AVAssetReader and AVAudioFile's AAC encoder. Encoding is 64 kbps for mono or
128 kbps for stereo and preserves the source sample rate and channel count.
Unsupported platform AAC sample rates fail without changing the stored audio.
Analysis supports mono and stereo at 8–192 kHz. Audio samples are streamed;
a 400 ms energy ring and
100 ms block-energy entries are retained. The maximum duration is 12 hours.
Estimated encoded size and available disk capacity are checked before writing.
No intermediate WAV is created. `normalizeM4a` and its explicit format marker
allow JavaScript to reject older binaries that only implement WAV conversion.

The meter uses BS.1770 K weighting and EBU R128 integrated loudness: 400 ms
blocks, 100 ms hop, -70 LUFS absolute gate, then a relative -10 LU gate. Mono
uses a single channel with weight 1, without dual-mono compensation. Shorter
than 400 ms and fully gated/silent audio returns null and cannot be normalized.
The incomplete last block is excluded from loudness but included in duration
and sample-peak measurement.

Normalization applies one constant gain. To preserve the source dynamics,
gain is limited to a -1 dBFS **sample-peak** ceiling. This is not a true-peak
limiter; peaks between samples are not measured. When the ceiling prevents
reaching the requested target, `peakLimited` is true and the output's actual
measured loudness is returned. The completed M4A is decoded and analyzed again,
so the UI displays the encoded audio's loudness instead of the ideal PCM value.
If AAC reconstruction exceeds the sample-peak ceiling, the original is encoded
one more time with reduced gain and 0.2 dB extra headroom. A second overshoot
fails without saving; both attempts retain the same requested target.
The original file is never modified by this module, including on failure.
