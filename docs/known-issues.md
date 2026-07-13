# Known Issues

## Ball identity is the main blocker

- The generic EfficientDet `sports ball` class detects the basketball only sparsely in the supplied recordings, especially when the ball is small, blurred, black, or occluded. A validated basketball-specific model is still needed for reliable identity.
- Top-K orange and color-independent motion candidates improve recall, but heuristics can still attach to hands, shorts, knees, shoes, shadows, or unrelated moving objects. Pose/body priors demote common distractors; they do not prove object identity.
- Online prediction bridges about 500 ms of loss. It can preserve the wrong identity after an incorrect association, so tracked coverage may remain high while localization is wrong.
- Tap-to-lock gives the tracker an initial point but does not create a persistent visual template. It is an acquisition aid, not a guarantee.
- The current fixed ball-identity slice has only seven visible labels and no absent-ball frames. Its 71.4% F1 and 0.23-radii median error are useful diagnostics but cannot establish general accuracy or no-ball false-positive behavior.

## Move accuracy is below the gate

- Final consistent calibration precision is 0.666667 and recall is 0.545455. The once-only holdout precision is 0.705882 and recall is 0.507042, so the required 0.95/0.95 controlled gate failed.
- The current holdout has already served its one evaluation. Further tuning must not use it; a materially changed detector needs a new independently collected validation round.
- Between-the-legs and behind-the-back are difficult to separate from one frontal 2D view. The provisional stance-aware transfer cue uses knee spread, but the ball itself has no depth estimate.
- Incorrect ball identity directly corrupts temporal move features. Further threshold tuning cannot compensate for a tracker following the player's body instead of the ball.
- Crossover, hesitation, and in-and-out lack independent labeled holdout clips. The five-class release gate is blocked regardless of synthetic-test performance.

## Browser and data limitations

- MediaPipe model assets require network access on first load. WebAssembly/WebGL and GPU delegate support vary by browser/device; CPU fallback may be substantially slower.
- Browser camera access requires a secure context on a phone (HTTPS, except for browser-defined localhost exceptions) and user permission. `facingMode: "user"` is a preference; device/browser camera selection behavior can vary.
- Preview frame rate and inference rate are independent. The preview can remain smooth while analyzed frames run near the 10 FPS target.
- Paced upload analysis is deliberately slower than simple playback because every target slot waits for a decoded frame and inference. A 20-second clip has taken roughly 40 seconds on the development machine.
- Upload evaluation rejects missing slots, large gaps, and excessive decoded-frame offsets. This favors reliable benchmarks over fastest processing.
- Current real recordings are one controlled frontal-view cohort. They do not cover varied lighting, camera angle, clothing, backgrounds, multiple players, prolonged occlusion, or no-ball negatives.
- The authenticated `/ai-tracker` route requires configured Supabase credentials; there is no anonymous local demo route.
- `npm install` reports dependency advisories, including the pinned Next.js version. A framework/dependency upgrade needs a separate compatibility and security pass.
