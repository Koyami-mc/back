import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { type BeatGrid, beatIntervalSec, beatTimes } from "../audio/beatgrid.js";

const execFileP = promisify(execFile);
const MAX_BUF = 512 * 1024 * 1024;

/**
 * Objective A/V sync check for the M1 test video.
 *
 * Decodes the rendered MP4 twice: the video track as tiny grayscale
 * frames (mean luma per frame → flash peaks) and the audio track as PCM
 * (click onsets). For every expected beat it compares where the flash
 * and the click actually landed and reports the offsets.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      in: { type: "string", default: "out/m1-test.mp4" },
      bpm: { type: "string", default: "120" },
      offset: { type: "string", default: "0" },
      fps: { type: "string", default: "60" },
      toleranceMs: { type: "string", default: "30" },
    },
  });
  const input = values.in!;
  const fps = Number(values.fps);
  const grid: BeatGrid = { bpm: Number(values.bpm), offsetSec: Number(values.offset) };
  const toleranceMs = Number(values.toleranceMs);

  // --- container/stream sanity ---
  const { stdout: probeOut } = await execFileP("ffprobe", [
    "-v", "error", "-print_format", "json",
    "-show_streams", "-show_format", input,
  ]);
  const probe = JSON.parse(probeOut);
  const vStream = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  const aStream = probe.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  if (!vStream) throw new Error("no video stream");
  if (!aStream) throw new Error("no audio stream");
  console.log(`container: ${probe.format.duration}s`);
  console.log(`video: ${vStream.codec_name} ${vStream.width}x${vStream.height} ${vStream.avg_frame_rate} nb_frames=${vStream.nb_frames} duration=${vStream.duration}s`);
  console.log(`audio: ${aStream.codec_name} ${aStream.sample_rate}Hz duration=${aStream.duration}s`);

  // --- per-frame brightness (video decoded to 8x8 gray) ---
  const { stdout: videoRaw } = await execFileP(
    "ffmpeg",
    ["-v", "error", "-i", input, "-map", "0:v", "-vf", "scale=8:8", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"],
    { encoding: "buffer", maxBuffer: MAX_BUF },
  );
  const frameBytes = 64;
  const numFrames = Math.floor(videoRaw.length / frameBytes);
  const brightness = new Float64Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    let sum = 0;
    for (let i = 0; i < frameBytes; i++) sum += videoRaw[f * frameBytes + i];
    brightness[f] = sum / frameBytes;
  }

  // --- audio PCM ---
  const sampleRate = 44100;
  const { stdout: audioRaw } = await execFileP(
    "ffmpeg",
    ["-v", "error", "-i", input, "-map", "0:a", "-f", "s16le", "-ac", "1", "-ar", String(sampleRate), "pipe:1"],
    { encoding: "buffer", maxBuffer: MAX_BUF },
  );
  const numSamples = Math.floor(audioRaw.length / 2);
  const durationSec = numFrames / fps;

  // --- compare flash vs click around every expected beat ---
  const beats = beatTimes(grid, durationSec);
  const halfWin = beatIntervalSec(grid) * 0.4;
  const offsets: { beat: number; flashSec: number; clickSec: number; offsetMs: number }[] = [];
  for (let b = 0; b < beats.length; b++) {
    const expected = beats[b];

    // flash = brightest frame in the window
    const f0 = Math.max(0, Math.round((expected - halfWin) * fps));
    const f1 = Math.min(numFrames - 1, Math.round((expected + halfWin) * fps));
    let flashFrame = f0;
    for (let f = f0; f <= f1; f++) if (brightness[f] > brightness[flashFrame]) flashFrame = f;

    // click = first sample in the window exceeding the onset threshold
    const s0 = Math.max(0, Math.round((expected - halfWin) * sampleRate));
    const s1 = Math.min(numSamples - 1, Math.round((expected + halfWin) * sampleRate));
    let clickSample = -1;
    for (let s = s0; s <= s1; s++) {
      if (Math.abs(audioRaw.readInt16LE(s * 2)) > 3000) { clickSample = s; break; }
    }
    if (clickSample < 0) {
      console.log(`beat ${b} @${expected.toFixed(3)}s: NO CLICK FOUND`);
      continue;
    }

    const flashSec = flashFrame / fps;
    const clickSec = clickSample / sampleRate;
    offsets.push({ beat: b, flashSec, clickSec, offsetMs: (flashSec - clickSec) * 1000 });
  }

  console.log(`\nbeat  expected   flash      click      offset(flash-click)`);
  for (const o of offsets) {
    console.log(
      `${String(o.beat).padStart(4)}  ${beats[o.beat].toFixed(3).padStart(8)}s ${o.flashSec.toFixed(3).padStart(8)}s ${o.clickSec.toFixed(3).padStart(8)}s ${o.offsetMs.toFixed(1).padStart(8)}ms`,
    );
  }

  const maxAbs = Math.max(...offsets.map((o) => Math.abs(o.offsetMs)));
  const missing = beats.length - offsets.length;
  const pass = missing === 0 && maxAbs <= toleranceMs;
  console.log(`\nbeats=${beats.length} matched=${offsets.length} max|offset|=${maxAbs.toFixed(1)}ms tolerance=${toleranceMs}ms`);
  console.log(pass ? "SYNC OK" : "SYNC FAIL");
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
