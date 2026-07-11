import { writeFileSync } from "node:fs";
import { type BeatGrid, beatTimes } from "./beatgrid.js";

/**
 * Synthesizes a metronome click track as a 16-bit mono WAV file.
 * Used by M1 to verify audio/video sync; each beat is a short decaying
 * sine burst (accented every 4th beat).
 */
export function writeClickWav(
  path: string,
  durationSec: number,
  grid: BeatGrid,
  sampleRate = 44100,
): void {
  const numSamples = Math.round(durationSec * sampleRate);
  const samples = new Float32Array(numSamples);

  const clickLenSec = 0.03;
  const clickLen = Math.round(clickLenSec * sampleRate);
  beatTimes(grid, durationSec).forEach((t, i) => {
    const start = Math.round(t * sampleRate);
    const freq = i % 4 === 0 ? 1500 : 1000;
    for (let s = 0; s < clickLen && start + s < numSamples; s++) {
      const time = s / sampleRate;
      const env = Math.exp(-time / 0.008);
      samples[start + s] += 0.8 * env * Math.sin(2 * Math.PI * freq * time);
    }
  });

  writeFileSync(path, encodeWav16(samples, sampleRate));
}

function encodeWav16(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}
