export interface BeatGrid {
  bpm: number;
  /** Time of beat 0 in seconds. */
  offsetSec: number;
}

export function beatIntervalSec(grid: BeatGrid): number {
  return 60 / grid.bpm;
}

/** All beat times within [0, durationSec). */
export function beatTimes(grid: BeatGrid, durationSec: number): number[] {
  const interval = beatIntervalSec(grid);
  const times: number[] = [];
  for (let t = grid.offsetSec; t < durationSec; t += interval) {
    if (t >= 0) times.push(t);
  }
  return times;
}

export interface BeatPhase {
  /** Index of the most recent beat at or before t (-1 before the first beat). */
  index: number;
  /** Seconds elapsed since that beat. */
  sinceSec: number;
}

export function beatPhase(grid: BeatGrid, t: number): BeatPhase {
  const interval = beatIntervalSec(grid);
  const index = Math.floor((t - grid.offsetSec) / interval);
  if (index < 0) return { index: -1, sinceSec: Number.POSITIVE_INFINITY };
  const beatTime = grid.offsetSec + index * interval;
  return { index, sinceSec: t - beatTime };
}
