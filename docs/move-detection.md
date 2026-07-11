# Move Detection

Coordinates are normalized to video width/height. Lateral travel is normalized by hip width to reduce sensitivity to camera distance. Frames lacking a credible pose or ball are excluded from rule windows.

Before classification, `trackBallContinuity` fills only gaps bounded by detections no more than 300 ms apart and rejects motion faster than four normalized frame widths per second. Interpolated points receive 70% of the weaker endpoint confidence and are identified in exports. Leading, trailing, long, and implausible gaps remain missing.

## Implemented rules

- **Crossover:** ball changes sides across the hip centerline within 1.4 seconds, travels at least 0.7 hip widths, and remains near a wrist.
- **Between-the-legs:** crossover conditions plus a middle observation inside the region bounded horizontally by the knees and vertically below the hips.
- **Behind-the-back:** ball changes sides through a narrow hip-height band while avoiding the lower between-knee region.
- **Hesitation:** visible approach motion is followed by four observations over 0.45–1.6 seconds with little ball travel near either wrist. Requiring approach motion prevents a stationary hold from being labeled a hesitation.
- **In-and-out:** ball moves inward by at least 0.45 hip widths, reverses, returns to the original side, and finishes near the same-side wrist.

Confidence combines observation quality and rule margin; it is a heuristic score, not a calibrated probability. Evidence strings expose the triggering features.

Live mode evaluates the most recent four seconds after each 10 FPS inference sample. A move is emitted only near the end of its detected interval, then deduplicated for 900 ms. The live MVP prominently counts crossover, between-the-legs, and behind-the-back; hesitation and in-and-out remain available to the shared rule engine and upload benchmark.

## Configuration and limitations

Thresholds live in `DEFAULT_MOVE_DETECTION_CONFIG` and can be overridden by the validation/tuning workflow without modifying detector logic. Behind-the-back remains a conservative 2D proxy: true body-relative depth is unavailable from the current ball detector. In-and-out hand ownership is inferred from endpoint proximity rather than tracked hand contact.

## Accuracy definition

`npm run validate:moves` matches move name and event interval within a 300 ms tolerance. The 95% gate requires both micro-averaged precision and recall to be at least 0.95 across a fixed labeled manifest; synthetic unit tests do not count toward this gate.
