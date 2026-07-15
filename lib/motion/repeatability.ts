export type RepeatabilityRange = {
  samples: number;
  minimum: number;
  maximum: number;
  mean: number;
  spread: number;
};

export function summarizeRepeatability(values: number[]): RepeatabilityRange {
  if (!values.length) throw new Error("Repeatability summary requires at least one sample.");
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Repeatability samples must be finite numbers.");
  const minimum = Math.min(...values); const maximum = Math.max(...values);
  return { samples: values.length, minimum, maximum,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    spread: maximum - minimum };
}

export function repeatabilityPasses(range: RepeatabilityRange, maximumSpread: number) {
  if (!Number.isFinite(maximumSpread) || maximumSpread < 0) throw new Error("Maximum repeatability spread must be non-negative.");
  return range.samples >= 2 && range.spread <= maximumSpread;
}
