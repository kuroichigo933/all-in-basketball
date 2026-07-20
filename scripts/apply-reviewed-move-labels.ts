import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { applyMoveLabelReviews } from "../lib/motion/moveLabelReview.ts";

function option(argv: string[], name: string) {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Missing ${name}.`);
  return argv[index + 1];
}

export function parseApplyReviewedLabelArgs(argv: string[]) {
  const manifest = option(argv, "--manifest");
  const labels = option(argv, "--labels").split(",").map((path) => path.trim()).filter(Boolean);
  const output = option(argv, "--output");
  if (!labels.length) throw new Error("--labels requires at least one sidecar path.");
  const localRoot = resolve("validation/local");
  const outputPath = resolve(output);
  const outputRelative = relative(localRoot, outputPath);
  if (!outputRelative || outputRelative.startsWith("..") || resolve(dirname(outputPath)) === resolve("validation")) {
    throw new Error("Reviewed manifests must use a new path under validation/local.");
  }
  if (resolve(manifest) === outputPath) throw new Error("Reviewed labels must not overwrite the source manifest.");
  return { manifest, labels, output };
}

if (process.argv[1] && process.argv[1].endsWith("apply-reviewed-move-labels.ts")) {
  const args = parseApplyReviewedLabelArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(resolve(args.manifest), "utf8"));
  const sidecars = args.labels.map((path) => JSON.parse(readFileSync(resolve(path), "utf8")));
  const reviewed = applyMoveLabelReviews(manifest, sidecars);
  writeFileSync(resolve(args.output), `${JSON.stringify(reviewed, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(args.output), reviewedClips: reviewed.clips.filter((clip) => clip.labelReview).map((clip) => ({
    id: clip.id, labels: clip.expected.length, reviewFps: clip.labelReview!.reviewFps,
  })) }, null, 2));
}
