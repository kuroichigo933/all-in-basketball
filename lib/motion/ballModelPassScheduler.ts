export type BallModelPass = "primary" | "focus" | "skip";

/**
 * Bounds learned ball detection to one model invocation per observation.
 * A missed player crop schedules the tighter dribble-zone crop for the next
 * observation, avoiding a second synchronous inference on the current frame.
 */
export class BallModelPassScheduler {
  private nextPass: Exclude<BallModelPass, "skip"> = "primary";

  reset() {
    this.nextPass = "primary";
  }

  select(hasPlayerCrop: boolean, hasFocusCrop: boolean): BallModelPass {
    if (!hasPlayerCrop) return "skip";
    if (this.nextPass === "focus" && hasFocusCrop) return "focus";
    return "primary";
  }

  record(pass: BallModelPass, foundMeasurement: boolean) {
    if (pass === "skip" || foundMeasurement) {
      this.nextPass = "primary";
      return;
    }
    this.nextPass = pass === "primary" ? "focus" : "primary";
  }
}
