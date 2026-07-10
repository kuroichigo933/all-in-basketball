import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ALL_MOVE_NAMES } from "../lib/motion/validation.ts";
import type { MoveName } from "../lib/motion/types.ts";

export type PrepareArgs = { input: string; id: string; move: MoveName; segmentSeconds: number };
export function parsePrepareArgs(argv: string[]): PrepareArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) values.set(argv[i], argv[i + 1]);
  const input = values.get("--input"); const id = values.get("--id"); const move = values.get("--move") as MoveName;
  const segmentSeconds = Number(values.get("--segment-seconds") ?? 20);
  if (!input || !id || !ALL_MOVE_NAMES.includes(move) || !Number.isFinite(segmentSeconds) || segmentSeconds <= 0) {
    throw new Error("Usage: --input <path> --id <source-id> --move <move-name> [--segment-seconds 20]");
  }
  return { input, id, move, segmentSeconds };
}

if (process.argv[1]?.endsWith("prepare-validation.ts")) {
  const args = parsePrepareArgs(process.argv.slice(2));
  if (!existsSync(args.input)) throw new Error(`Input not found: ${args.input}`);
  const output = resolve("validation/local/videos", args.id); mkdirSync(output, { recursive: true });
  for (const file of readdirSync(output)) if (file.endsWith(".mp4")) unlinkSync(resolve(output, file));
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", args.input], { encoding: "utf8" });
  const duration = Number(probe.stdout?.trim());
  if (probe.status !== 0 || !Number.isFinite(duration)) throw new Error("ffprobe could not read input duration.");
  for (let index = 0, start = 0; start < duration; index += 1, start += args.segmentSeconds) {
    const target = resolve(output, `${args.id}-${String(index).padStart(3, "0")}.mp4`);
    const run = spawnSync("ffmpeg", ["-y", "-ss", String(start), "-i", args.input, "-t", String(Math.min(args.segmentSeconds, duration - start)), "-map", "0:v:0", "-an", "-vf", "setpts=PTS-STARTPTS,scale=-2:720,fps=30", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-movflags", "+faststart", target], { stdio: "inherit" });
    if (run.status !== 0) throw new Error(`ffmpeg failed at segment ${index}.`);
  }
  writeFileSync(resolve(output, "source.json"), JSON.stringify({ sourceId: args.id, sourceFile: basename(args.input), move: args.move, segmentSeconds: args.segmentSeconds }, null, 2));
}
