/* global __dirname, Buffer */
const fs = require("fs");
const path = require("path");

const sampleRate = 22050;
const output = path.join(__dirname, "..", "assets", "audio");
fs.mkdirSync(output, { recursive: true });

function writeWav(name, duration, sample) {
  const count = Math.floor(sampleRate * duration);
  const dataSize = count * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < count; i += 1) {
    const time = i / sampleRate;
    const value = Math.max(-1, Math.min(1, sample(time, duration)));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(output, name), buffer);
}

function fade(time, duration, edge = 0.08) {
  return Math.min(1, time / edge, (duration - time) / edge);
}

writeWav("button.wav", 0.12, (t, d) => Math.sin(2 * Math.PI * 660 * t) * 0.3 * fade(t, d, 0.02));
writeWav("dialogue-next.wav", 0.18, (t, d) => Math.sin(2 * Math.PI * (520 + 700 * t) * t) * 0.25 * fade(t, d, 0.03));
writeWav("rhythm-hit.wav", 0.14, (t, d) => Math.sin(2 * Math.PI * 880 * t) * 0.32 * fade(t, d, 0.02));
writeWav("training-rhythm.wav", 0.28, (t, d) => {
  const sweep = 115 + 85 * Math.sin(Math.PI * t / d);
  const friction = Math.sin(2 * Math.PI * sweep * t) * 0.16;
  const softNoise = Math.sin(t * 17341) * Math.sin(t * 7919) * 0.07;
  return (friction + softNoise) * fade(t, d, 0.035);
});
writeWav("punishment-hit.wav", 0.24, (t, d) => {
  const crack = Math.sin(t * 44100 * 1.73) * Math.exp(-35 * t) * 0.52;
  const body = Math.sin(2 * Math.PI * 105 * t) * Math.exp(-18 * t) * 0.38;
  return (crack + body) * fade(t, d, 0.006);
});
writeWav("ejaculation.wav", 1.15, (t, d) => {
  const burstPhase = t % 0.22;
  const burst = Math.exp(-15 * burstPhase);
  const wet = Math.sin(2 * Math.PI * (145 + 55 * Math.sin(t * 31)) * t) * 0.17;
  const liquidNoise = Math.sin(t * 23891) * Math.sin(t * 11027) * 0.1;
  return (wet + liquidNoise) * burst * fade(t, d, 0.025);
});
writeWav("training-complete.wav", 0.8, (t, d) => {
  const notes = [523.25, 659.25, 783.99];
  return notes.reduce((sum, note, index) => sum + Math.sin(2 * Math.PI * note * t) * (index + 1 <= t * 6 + 1 ? 0.12 : 0), 0) * fade(t, d, 0.05);
});

console.log(`Generated audio assets in ${output}`);
