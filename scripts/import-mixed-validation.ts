import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parseMoveLabelCsv, segmentMoveLabels } from "../lib/motion/moveLabelCsv.ts";
import { validateManifest, type ValidationManifest } from "../lib/motion/validation.ts";

type ImportArgs = { csv: string; sourceId: string; cohort: string; durationSeconds: number; segmentSeconds: number; output: string };

function option(argv: string[], name: string, fallback?: string) {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : fallback;
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
  return value;
}

export function parseMixedImportArgs(argv: string[]): ImportArgs {
  const durationSeconds = Number(option(argv, "--duration-seconds"));
  const segmentSeconds = Number(option(argv, "--segment-seconds", "20"));
  const sourceId = option(argv, "--source-id");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceId) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(segmentSeconds) || segmentSeconds <= 0) {
    throw new Error("Invalid source ID or duration arguments.");
  }
  return {
    csv: option(argv, "--csv"), sourceId, cohort: option(argv, "--cohort", "controlled-front-camera-mixed"),
    durationSeconds, segmentSeconds,
    output: option(argv, "--output", `validation/local/manifests/${sourceId}.json`),
  };
}

function safeLocalOutput(path: string) {
  const localRoot = resolve("validation/local");
  const output = resolve(path);
  const fromRoot = relative(localRoot, output);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("Mixed validation manifest must stay under validation/local/.");
  return output;
}

export function importMixedValidation(args: ImportArgs) {
  const output = safeLocalOutput(args.output);
  const outputRoot = dirname(output);
  const durationMs = Math.round(args.durationSeconds * 1000);
  const segmentMs = Math.round(args.segmentSeconds * 1000);
  const labels = parseMoveLabelCsv(readFileSync(resolve(args.csv), "utf8"), durationMs);
  const { segments, boundaryExcluded } = segmentMoveLabels(labels, durationMs, segmentMs);
  const clips = segments.map((segment) => {
    const id = `${args.sourceId}-${String(segment.index).padStart(3, "0")}`;
    const video = resolve(`validation/local/videos/${args.sourceId}/${id}.mp4`);
    if (!existsSync(video)) throw new Error(`Prepared segment not found: ${video}`);
    return {
      id, sourceId: args.sourceId, segmentId: String(segment.index).padStart(3, "0"), cohort: args.cohort, split: "calibration" as const,
      video: relative(outputRoot, video).replaceAll("\\", "/"),
      observations: relative(outputRoot, resolve(`validation/observations/${id}.json`)).replaceAll("\\", "/"),
      expected: segment.expected,
    };
  });
  const manifest = validateManifest({ schemaVersion: 2, toleranceMs: 300, clips }) as ValidationManifest;
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const byClass = Object.fromEntries(["crossover", "between-the-legs", "behind-the-back"].map((move) => [move, labels.filter((label) => label.move === move).length]));
  const report = { output, clips: clips.length, labels: labels.length, byClass, boundaryExcluded };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1]?.endsWith("import-mixed-validation.ts")) importMixedValidation(parseMixedImportArgs(process.argv.slice(2)));
