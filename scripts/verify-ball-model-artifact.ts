import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parseBallModelArtifact, isSafeRepoRelativePath, type BallModelArtifact } from "../lib/motion/ballModelArtifact.ts";

export type BallModelArtifactFileAccess = {
  isFile(path: string): boolean;
  readFile(path: string): Uint8Array;
  realpath(path: string): string;
};

export type BallModelArtifactVerification = {
  artifact: BallModelArtifact;
  modelPath: string;
  evidencePaths: string[];
};

const NODE_FILE_ACCESS: BallModelArtifactFileAccess = {
  isFile(path) { try { return statSync(path).isFile(); } catch { return false; } },
  readFile: (path) => readFileSync(path),
  realpath: (path) => realpathSync(path),
};

function repositoryFile(repoRoot: string, repoRelativePath: string, files: BallModelArtifactFileAccess): string {
  if (!isSafeRepoRelativePath(repoRelativePath)) throw new Error(`Unsafe repo-relative path: ${repoRelativePath}`);
  const root = resolve(repoRoot); const target = resolve(root, repoRelativePath);
  const lexicalRelative = relative(root, target);
  if (!lexicalRelative || lexicalRelative.startsWith("..") || isAbsolute(lexicalRelative)) throw new Error(`Path must name a file below the repository root: ${repoRelativePath}`);
  if (!files.isFile(target)) throw new Error(`Required repository file does not exist: ${repoRelativePath}`);
  const realRoot = files.realpath(root); const realTarget = files.realpath(target); const realRelative = relative(realRoot, realTarget);
  if (!realRelative || realRelative.startsWith("..") || isAbsolute(realRelative)) throw new Error(`Repository path escapes through a symlink: ${repoRelativePath}`);
  return target;
}

export function readInstalledMediaPipeVersion(
  repoRoot: string,
  files: BallModelArtifactFileAccess = NODE_FILE_ACCESS,
): string {
  const packagePath = repositoryFile(repoRoot, "node_modules/@mediapipe/tasks-vision/package.json", files);
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(files.readFile(packagePath)).toString("utf8")); }
  catch { throw new Error("Installed @mediapipe/tasks-vision package.json is not valid JSON."); }
  const version = parsed && typeof parsed === "object" && "version" in parsed ? (parsed as { version?: unknown }).version : undefined;
  if (typeof version !== "string" || !version) throw new Error("Installed @mediapipe/tasks-vision package.json has no version.");
  return version;
}

export function verifyBallModelArtifact(
  value: unknown,
  options: { repoRoot: string; installedMediaPipeVersion: string; files?: BallModelArtifactFileAccess },
): BallModelArtifactVerification {
  const artifact = parseBallModelArtifact(value); const files = options.files ?? NODE_FILE_ACCESS;
  if (artifact.runtime.version !== options.installedMediaPipeVersion) {
    throw new Error(`Artifact requires ${artifact.runtime.package} ${artifact.runtime.version}, but ${options.installedMediaPipeVersion} is installed.`);
  }
  const modelPath = repositoryFile(options.repoRoot, artifact.model.path, files);
  const model = files.readFile(modelPath);
  if (model.byteLength !== artifact.model.bytes) throw new Error(`Model byte count mismatch: expected ${artifact.model.bytes}, found ${model.byteLength}.`);
  const sha256 = createHash("sha256").update(model).digest("hex");
  if (sha256 !== artifact.model.sha256) throw new Error(`Model SHA-256 mismatch: expected ${artifact.model.sha256}, found ${sha256}.`);
  if (model.byteLength < 8 || Buffer.from(model.subarray(4, 8)).toString("ascii") !== "TFL3") {
    throw new Error("Model does not contain the TFL3 FlatBuffer identifier at bytes 4-7.");
  }
  const evidencePaths = Object.values(artifact.evidence).map((path) => repositoryFile(options.repoRoot, path, files));
  return { artifact, modelPath, evidencePaths };
}

export function parseVerifyBallModelArtifactArgs(argv: string[]): { manifest: string } {
  if (argv.length !== 2 || argv[0] !== "--manifest" || !isSafeRepoRelativePath(argv[1])) {
    throw new Error("Usage: --manifest <safe-repo-relative-artifact.json>");
  }
  return { manifest: argv[1] };
}

if (process.argv[1]?.endsWith("verify-ball-model-artifact.ts")) {
  const { manifest } = parseVerifyBallModelArtifactArgs(process.argv.slice(2)); const repoRoot = process.cwd();
  const manifestPath = repositoryFile(repoRoot, manifest, NODE_FILE_ACCESS);
  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  const installedMediaPipeVersion = readInstalledMediaPipeVersion(repoRoot);
  const verified = verifyBallModelArtifact(raw, { repoRoot, installedMediaPipeVersion });
  console.log(`Verified ${verified.artifact.id} (${verified.artifact.status}); ${verified.artifact.model.bytes} bytes; ${verified.artifact.runtime.package} ${installedMediaPipeVersion}.`);
  console.log("TFL3 confirms only the FlatBuffer container identifier; a real browser smoke test is still required.");
}
