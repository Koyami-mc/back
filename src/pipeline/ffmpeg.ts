import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  outPath: string;
  /** Optional audio file muxed into the output. */
  audioPath?: string;
  crf?: number;
  preset?: string;
}

/**
 * Encodes a video by piping raw RGBA frames into an ffmpeg child process.
 * No intermediate image files are written.
 */
export class VideoEncoder {
  private proc: ChildProcessByStdio<Writable, null, Readable>;
  private exitPromise: Promise<void>;
  private stderrBuf = "";

  constructor(opts: EncodeOptions) {
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      // video: raw RGBA frames from stdin
      "-f", "rawvideo",
      "-pix_fmt", "rgba",
      "-video_size", `${opts.width}x${opts.height}`,
      "-framerate", String(opts.fps),
      "-i", "pipe:0",
    ];
    if (opts.audioPath) {
      args.push("-i", opts.audioPath);
    }
    args.push("-map", "0:v");
    if (opts.audioPath) {
      args.push("-map", "1:a", "-c:a", "aac", "-b:a", "192k");
    }
    args.push(
      "-c:v", "libx264",
      "-preset", opts.preset ?? "medium",
      "-crf", String(opts.crf ?? 18),
      "-pix_fmt", "yuv420p",
      // Frame timing is authoritative from the input framerate; -shortest
      // guards against a click track slightly longer than the video.
      "-shortest",
      opts.outPath,
    );

    this.proc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    this.proc.stderr.on("data", (d: Buffer) => {
      this.stderrBuf += d.toString();
    });
    this.exitPromise = new Promise((resolve, reject) => {
      this.proc.on("error", reject);
      this.proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}:\n${this.stderrBuf}`));
      });
    });
  }

  /** Writes one RGBA frame, respecting stdin backpressure. */
  writeFrame(rgba: Uint8Array | Uint8ClampedArray): Promise<void> {
    const buf = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    return new Promise((resolve, reject) => {
      const ok = this.proc.stdin.write(buf, (err) => {
        if (err) reject(err);
      });
      if (ok) resolve();
      else this.proc.stdin.once("drain", () => resolve());
    });
  }

  /** Closes stdin and waits for ffmpeg to finish encoding. */
  async finish(): Promise<void> {
    this.proc.stdin.end();
    await this.exitPromise;
  }
}
