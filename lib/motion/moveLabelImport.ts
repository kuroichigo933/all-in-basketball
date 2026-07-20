import type { ExpectedMove } from "./evaluate.ts";
import { parseMoveLabelCsv } from "./moveLabelCsv.ts";
import type { MoveName } from "./types.ts";

const MOVE_NAMES = new Set<MoveName>(["crossover", "between-the-legs", "behind-the-back", "hesitation", "in-and-out"]);
export type MoveLabelImportResult = { labels: ExpectedMove[]; reviewFps?: number };

export function validateMoveLabels(value: unknown, durationMs: number): ExpectedMove[] {
  if (!Array.isArray(value)) throw new Error("Move labels must be an array.");
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error("A finite positive video duration is required.");
  const labels = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`Move label ${index + 1} must be an object.`);
    const label = candidate as Partial<ExpectedMove>;
    if (!MOVE_NAMES.has(label.move as MoveName)) throw new Error(`Move label ${index + 1} has an unsupported move.`);
    if (!Number.isFinite(label.startMs) || !Number.isFinite(label.endMs) || label.startMs! < 0 || label.endMs! <= label.startMs!) {
      throw new Error(`Move label ${index + 1} needs a non-negative start and a later end.`);
    }
    if (label.endMs! > durationMs) throw new Error(`Move label ${index + 1} ends after the loaded video.`);
    return { move: label.move as MoveName, startMs: Math.round(label.startMs!), endMs: Math.round(label.endMs!) };
  }).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let index = 1; index < labels.length; index += 1) {
    if (labels[index].startMs < labels[index - 1].endMs) {
      throw new Error(`Move labels overlap at ${labels[index - 1].startMs}-${labels[index - 1].endMs} and ${labels[index].startMs}-${labels[index].endMs} ms.`);
    }
  }
  return labels;
}

export function parseMoveLabelImportDocument(text: string, fileName: string, clipId: string, durationMs: number): MoveLabelImportResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (fileName.toLowerCase().endsWith(".csv") || trimmed.toLowerCase().startsWith("start,end,move")) {
    return { labels: parseMoveLabelCsv(trimmed, durationMs) };
  }
  let value: unknown;
  try { value = JSON.parse(trimmed); }
  catch { throw new Error("Move labels must be CSV or valid JSON."); }
  if (Array.isArray(value)) return { labels: validateMoveLabels(value, durationMs) };
  if (!value || typeof value !== "object") throw new Error("Move-label JSON must be an array, analysis export, sidecar, or manifest.");
  const document = value as { clipId?: unknown; labels?: unknown; expected?: unknown; clips?: unknown; reviewFps?: unknown; durationMs?: unknown };
  const reviewFps = document.reviewFps === undefined ? undefined : Number(document.reviewFps);
  if (reviewFps !== undefined && (!Number.isFinite(reviewFps) || reviewFps <= 0 || reviewFps > 240)) {
    throw new Error("Move-label reviewFps must be greater than zero and no more than 240.");
  }
  if (document.durationMs !== undefined && (!Number.isFinite(document.durationMs) || Number(document.durationMs) <= 0 ||
    Math.abs(Number(document.durationMs) - durationMs) > 100)) {
    throw new Error("Move-label sidecar duration does not match the loaded video.");
  }
  if (typeof document.clipId === "string" && clipId && document.clipId !== clipId) {
    throw new Error(`Move labels belong to ${document.clipId}, not ${clipId}.`);
  }
  if (Array.isArray(document.labels)) return { labels: validateMoveLabels(document.labels, durationMs), ...(reviewFps === undefined ? {} : { reviewFps }) };
  if (Array.isArray(document.expected)) return { labels: validateMoveLabels(document.expected, durationMs), ...(reviewFps === undefined ? {} : { reviewFps }) };
  if (Array.isArray(document.clips)) {
    if (!clipId) throw new Error("Enter a clip ID before importing a validation manifest.");
    const clip = document.clips.find((candidate) => candidate && typeof candidate === "object" &&
      (candidate as { id?: unknown }).id === clipId) as { expected?: unknown } | undefined;
    if (!clip) throw new Error(`Validation manifest has no clip named ${clipId}.`);
    return { labels: validateMoveLabels(clip.expected, durationMs) };
  }
  throw new Error("Move-label JSON contains no supported labels.");
}

export function parseMoveLabelImport(text: string, fileName: string, clipId: string, durationMs: number): ExpectedMove[] {
  return parseMoveLabelImportDocument(text, fileName, clipId, durationMs).labels;
}
