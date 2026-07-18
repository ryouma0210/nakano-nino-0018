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

function darkDrone(root, tension = 1) {
  return (time) => {
    const breath = 0.65 + Math.sin(2 * Math.PI * time / 8) * 0.2;
    const low = Math.sin(2 * Math.PI * root * time) * 0.055;
    const fifth = Math.sin(2 * Math.PI * root * 1.5 * time + 0.7) * 0.035;
    const dissonance = Math.sin(2 * Math.PI * root * (1.059 + tension * 0.008) * time) * 0.025;
    const pulse = Math.sin(2 * Math.PI * 0.5 * time) > 0.82 ? Math.sin(2 * Math.PI * root * 2 * time) * 0.018 : 0;
    return (low + fifth + dissonance + pulse) * breath;
  };
}

function musicBox(root, quiet = false) {
  const notes = [1, 1.2, 1.5, 1.125, 1, 1.334, 1.2, 1.059];
  return (time) => {
    const beat = Math.floor(time * 2);
    const local = (time * 2) % 1;
    const note = root * notes[beat % notes.length];
    const decay = Math.exp(-5.2 * local);
    const bell = Math.sin(2 * Math.PI * note * time) + 0.42 * Math.sin(2 * Math.PI * note * 2.01 * time);
    const shadow = Math.sin(2 * Math.PI * root / 4 * time) * 0.035;
    return bell * decay * (quiet ? 0.055 : 0.085) + shadow;
  };
}

function dungeonSynth(time) {
  const roots = [55, 55, 51.91, 46.25];
  const root = roots[Math.floor(time / 3) % roots.length];
  const gate = Math.sin(2 * Math.PI * 2 * time) > -0.2 ? 1 : 0.25;
  return Math.sin(2 * Math.PI * root * time) * 0.06
    + Math.sin(2 * Math.PI * root * 2 * time) * 0.025
    + Math.sin(2 * Math.PI * root * 3 * time) * 0.016 * gate;
}

function tensePulse(time) {
  const pulse = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 1.5 * time)), 5);
  return darkDrone(43.65, 1.8)(time) + Math.sin(2 * Math.PI * 87.3 * time) * pulse * 0.055;
}

function creepyAtmosphere(time) {
  const scrape = Math.sin(2 * Math.PI * (185 + Math.sin(time * 0.7) * 18) * time) * 0.018;
  return darkDrone(38.89, 2.4)(time) + scrape * (0.5 + 0.5 * Math.sin(time * 1.3));
}

writeWav("bgm-start.wav", 12, musicBox(392));
writeWav("bgm-home.wav", 12, darkDrone(55, 1.2));
writeWav("bgm-preparation.wav", 12, dungeonSynth);
writeWav("bgm-training.wav", 12, tensePulse);
writeWav("bgm-punishment.wav", 12, creepyAtmosphere);
writeWav("bgm-diary.wav", 12, musicBox(329.63, true));
writeWav("bgm-system.wav", 12, darkDrone(49, 0.8));
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
