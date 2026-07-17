import { isAbsolute, relative, resolve } from "node:path";
import type { ValidationClip } from "./validation.ts";

/** Confines regenerated observation overrides to ignored local validation data. */
export function resolveValidationObservationsDirectory(value: string, localRoot = resolve("validation/local")) {
  const directory = resolve(value); const fromRoot = relative(localRoot, directory);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("Validation observation overrides must stay under validation/local/.");
  }
  return directory;
}

export function validationObservationPath(
  manifestDirectory: string,
  clip: Pick<ValidationClip, "id" | "observations">,
  overrideDirectory?: string,
) {
  return overrideDirectory ? resolve(overrideDirectory, `${clip.id}.json`) : resolve(manifestDirectory, clip.observations);
}
