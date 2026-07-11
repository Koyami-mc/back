import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { createCanvas } from "@napi-rs/canvas";
import { writeClickWav } from "./audio/click.js";
import type { BeatGrid } from "./audio/beatgrid.js";
import { VideoEncoder } from "./pipeline/ffmpeg.js";
import { renderTestFrame } from "./scenes/m1test.js";
import { JourneyScene } from "./scenes/journey.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      scene: { type: "string", default: "m1" },
      audio: { type: "string", default: "click" },
      seed: { type: "string", default: "1" },
      out: { type: "string", default: "out/m1-test.mp4" },
      duration: { type: "string", default: "10" },
      bpm: { type: "string", default: "120" },
      offset: { type: "string", default: "0" },
      fps: { type: "string", default: "60" },
      width: { type: "string", default: "1920" },
      height: { type: "string", default: "1080" },
    },
  });

  const durationSec = Number(values.duration);
  const fps = Number(values.fps);
  const width = Number(values.width);
  const height = Number(values.height);
  const grid: BeatGrid = { bpm: Number(values.bpm), offsetSec: Number(values.offset) };
  const outPath = values.out!;
  mkdirSync(dirname(outPath), { recursive: true });

  // The synthesized metronome doubles as the sync-verification track;
  // --audio none renders silent footage.
  let audioPath: string | undefined;
  if (values.audio === "click") {
    audioPath = join(dirname(outPath), "click.wav");
    writeClickWav(audioPath, durationSec, grid);
  }

  const totalFrames = Math.round(durationSec * fps);
  console.log(`Rendering ${totalFrames} frames @ ${width}x${height} ${fps}fps (scene=${values.scene})`);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const encoder = new VideoEncoder({ width, height, fps, outPath, audioPath });

  const journey = values.scene === "journey" ? new JourneyScene(Number(values.seed)) : null;

  const startedAt = Date.now();
  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;
    if (journey) journey.render(ctx, t, width, height);
    else renderTestFrame(ctx, t, durationSec, grid, width, height);
    await encoder.writeFrame(ctx.getImageData(0, 0, width, height).data);
    if (frame % fps === 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      process.stdout.write(`\r  frame ${frame}/${totalFrames} (${elapsed.toFixed(1)}s elapsed)`);
    }
  }
  await encoder.finish();

  const totalSec = (Date.now() - startedAt) / 1000;
  console.log(`\nDone: ${outPath} (${totalSec.toFixed(1)}s, ${(totalFrames / totalSec).toFixed(1)} fps encode speed)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
