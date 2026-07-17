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

function bgm(root, color) {
  const notes = [root, root * 1.25, root * 1.5, root * 2];
  return (time, duration) => {
    const step = Math.floor(time * 2) % notes.length;
    const note = notes[step];
    const pad = Math.sin(2 * Math.PI * root * time) * 0.07;
    const bell = Math.sin(2 * Math.PI * note * time) * 0.07;
    const shimmer = Math.sin(2 * Math.PI * (note * color) * time) * 0.025;
    return (pad + bell + shimmer) * fade(time, duration, 0.2);
  };
}

writeWav("bgm-home.wav", 8, bgm(110, 2));
writeWav("bgm-training.wav", 8, bgm(130.81, 3));
writeWav("bgm-diary.wav", 8, bgm(98, 1.5));
writeWav("bgm-system.wav", 8, bgm(82.41, 2.5));
writeWav("button.wav", 0.12, (t, d) => Math.sin(2 * Math.PI * 660 * t) * 0.3 * fade(t, d, 0.02));
writeWav("dialogue-next.wav", 0.18, (t, d) => Math.sin(2 * Math.PI * (520 + 700 * t) * t) * 0.25 * fade(t, d, 0.03));
writeWav("rhythm-hit.wav", 0.14, (t, d) => Math.sin(2 * Math.PI * 880 * t) * 0.32 * fade(t, d, 0.02));
writeWav("training-complete.wav", 0.8, (t, d) => {
  const notes = [523.25, 659.25, 783.99];
  return notes.reduce((sum, note, index) => sum + Math.sin(2 * Math.PI * note * t) * (index + 1 <= t * 6 + 1 ? 0.12 : 0), 0) * fade(t, d, 0.05);
});

console.log(`Generated audio assets in ${output}`);
