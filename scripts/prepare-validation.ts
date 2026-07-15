import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ALL_MOVE_NAMES } from "../lib/motion/validation.ts";
import type { MoveName } from "../lib/motion/types.ts";

export type PrepareArgs = { input: string; id: string; move: MoveName | "mixed"; segmentSeconds: number; durationSeconds?: number };
export function buildValidationSegmentArgs(input: string, target: string, startSeconds: number, durationSeconds: number) {
  return [
    "-y", "-ss", String(startSeconds), "-i", input, "-t", String(durationSeconds), "-map", "0:v:0", "-an",
    "-vf", "setpts=PTS-STARTPTS,scale=-2:720,fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-preset", "fast", "-crf", "23", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0", "-movflags", "+faststart", target,
  ];
}

export function parsePrepareArgs(argv: string[]): PrepareArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) values.set(argv[i], argv[i + 1]);
  const input = values.get("--input"); const id = values.get("--id"); const move = values.get("--move") as MoveName | "mixed";
  const segmentSeconds = Number(values.get("--segment-seconds") ?? 20);
  const durationValue = values.get("--duration-seconds");
  const durationSeconds = durationValue === undefined ? undefined : Number(durationValue);
  if (!input || !id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || !(move === "mixed" || ALL_MOVE_NAMES.includes(move)) || !Number.isFinite(segmentSeconds) || segmentSeconds <= 0 || (durationSeconds !== undefined && (!Number.isFinite(durationSeconds) || durationSeconds <= 0))) {
    throw new Error("Usage: --input <path> --id <source-id> --move <move-name|mixed> [--segment-seconds 20] [--duration-seconds N]");
  }
  return { input, id, move, segmentSeconds, ...(durationSeconds === undefined ? {} : { durationSeconds }) };
}

if (process.argv[1]?.endsWith("prepare-validation.ts")) {
  const args = parsePrepareArgs(process.argv.slice(2));
  if (!existsSync(args.input)) throw new Error(`Input not found: ${args.input}`);
  const output = resolve("validation/local/videos", args.id); mkdirSync(output, { recursive: true });
  for (const file of readdirSync(output)) if (file.endsWith(".mp4")) unlinkSync(resolve(output, file));
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", args.input], { encoding: "utf8" });
  const probedDuration = Number(probe.stdout?.trim());
  if (probe.status !== 0 || !Number.isFinite(probedDuration)) throw new Error("ffprobe could not read input duration.");
  const duration = Math.min(probedDuration, args.durationSeconds ?? probedDuration);
  for (let index = 0, start = 0; start < duration; index += 1, start += args.segmentSeconds) {
    const target = resolve(output, `${args.id}-${String(index).padStart(3, "0")}.mp4`);
    const run = spawnSync("ffmpeg", buildValidationSegmentArgs(args.input, target, start, Math.min(args.segmentSeconds, duration - start)), { stdio: "inherit" });
    if (run.status !== 0) throw new Error(`ffmpeg failed at segment ${index}.`);
  }
  writeFileSync(resolve(output, "source.json"), JSON.stringify({ sourceId: args.id, sourceFile: basename(args.input), move: args.move, segmentSeconds: args.segmentSeconds, durationSeconds: duration }, null, 2));
}
