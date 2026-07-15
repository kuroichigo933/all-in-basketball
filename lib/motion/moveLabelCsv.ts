import type { ExpectedMove } from "./evaluate.ts";
import type { MoveName } from "./types.ts";

const MOVE_ALIASES: Record<string, MoveName> = {
  crossover: "crossover",
  "between-the-legs": "between-the-legs",
  "behind-the-back": "behind-the-back",
};

export function parseMoveTimestamp(value: string) {
  const parts = value.trim().split(":").map(Number);
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new Error(`Invalid move timestamp: ${value}`);
  }
  const seconds = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.at(-1)! >= 60 || (parts.length === 3 && parts[1] >= 60)) throw new Error(`Invalid move timestamp: ${value}`);
  return Math.round(seconds * 1000);
}

export function normalizeCsvMove(value: string): MoveName {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
  const move = MOVE_ALIASES[normalized];
  if (!move) throw new Error(`Unsupported mixed-video move: ${value}`);
  return move;
}

export function parseMoveLabelCsv(csv: string, durationMs: number): ExpectedMove[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length || lines[0].split(",").slice(0, 3).map((value) => value.trim().toLowerCase()).join(",") !== "start,end,move") {
    throw new Error("Move CSV must start with start,end,move.");
  }
  const labels = lines.slice(1).map((line, index) => {
    const [start, end, move] = line.split(",");
    if (!start || !end || !move) throw new Error(`Invalid move CSV row ${index + 2}.`);
    const label = { startMs: parseMoveTimestamp(start), endMs: parseMoveTimestamp(end), move: normalizeCsvMove(move) };
    if (label.startMs >= label.endMs) throw new Error(`Move CSV row ${index + 2} must end after it starts.`);
    if (label.endMs > durationMs) throw new Error(`Move CSV row ${index + 2} ends after the requested duration.`);
    return label;
  }).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  for (let index = 1; index < labels.length; index += 1) {
    if (labels[index].startMs < labels[index - 1].endMs) {
      throw new Error(`Overlapping move labels at ${labels[index - 1].startMs}-${labels[index - 1].endMs} and ${labels[index].startMs}-${labels[index].endMs} ms.`);
    }
  }
  return labels;
}

export function segmentMoveLabels(labels: ExpectedMove[], durationMs: number, segmentMs: number) {
  const count = Math.ceil(durationMs / segmentMs);
  const boundaryExcluded: ExpectedMove[] = [];
  const segments = Array.from({ length: count }, (_, index) => {
    const startMs = index * segmentMs;
    const endMs = Math.min(durationMs, startMs + segmentMs);
    const expected = labels.flatMap((label) => {
      if (label.startMs >= startMs && label.endMs <= endMs) return [{ ...label, startMs: label.startMs - startMs, endMs: label.endMs - startMs }];
      if (label.startMs < endMs && label.endMs > endMs) boundaryExcluded.push(label);
      return [];
    });
    return { index, startMs, endMs, expected };
  });
  return { segments, boundaryExcluded };
}
