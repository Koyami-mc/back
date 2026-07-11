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
      // segment rendering: emit only [from, to) seconds of the timeline
      from: { type: "string", default: "0" },
      to: { type: "string" },
    },
  });

  const durationSec = Number(values.duration);
  const fps = Number(values.fps);
  const width = Number(values.width);
  const height = Number(values.height);
  const grid: BeatGrid = { bpm: Number(values.bpm), offsetSec: Number(values.offset) };
  const outPath = values.out!;
  mkdirSync(dirname(outPath), { recursive: true });

  const fromSec = Number(values.from);
  const toSec = values.to !== undefined ? Number(values.to) : durationSec;
  const isSegment = fromSec > 0 || toSec < durationSec;

  // The synthesized metronome doubles as the sync-verification track;
  // --audio none renders silent footage. Segments are muxed silent —
  // audio is attached when the segments are concatenated.
  let audioPath: string | undefined;
  if (values.audio === "click" && !isSegment) {
    audioPath = join(dirname(outPath), "click.wav");
    writeClickWav(audioPath, durationSec, grid);
  }

  const startFrame = Math.round(fromSec * fps);
  const endFrame = Math.round(toSec * fps);
  // Stateful sub-systems (the Verlet scarf) need a short warm-up before
  // the first emitted frame of a mid-timeline segment.
  const prerollFrames = startFrame > 0 ? Math.round(1.5 * fps) : 0;
  console.log(
    `Rendering frames ${startFrame}..${endFrame - 1} of ${Math.round(durationSec * fps)} @ ${width}x${height} ${fps}fps (scene=${values.scene}, preroll=${prerollFrames})`,
  );

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const encoder = new VideoEncoder({ width, height, fps, outPath, audioPath });

  const journey = values.scene === "journey" ? new JourneyScene(Number(values.seed), durationSec) : null;

  const startedAt = Date.now();
  for (let frame = startFrame - prerollFrames; frame < endFrame; frame++) {
    const t = frame / fps;
    if (journey) journey.render(ctx, t, width, height);
    else renderTestFrame(ctx, t, durationSec, grid, width, height);
    if (frame < startFrame) continue; // warm-up only, don't emit
    await encoder.writeFrame(ctx.getImageData(0, 0, width, height).data);
    if ((frame - startFrame) % fps === 0) {
      const elapsed = (Date.now() - startedAt) / 1000;
      process.stdout.write(`\r  frame ${frame}/${endFrame} (${elapsed.toFixed(1)}s elapsed)`);
    }
  }
  await encoder.finish();

  const totalSec = (Date.now() - startedAt) / 1000;
  const emitted = endFrame - startFrame;
  console.log(`\nDone: ${outPath} (${totalSec.toFixed(1)}s, ${(emitted / totalSec).toFixed(1)} fps encode speed)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
