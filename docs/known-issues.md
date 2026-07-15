# Known Issues

## Ball identity is the main blocker

- The generic EfficientDet `sports ball` class detects the basketball only sparsely in the supplied recordings, especially when the ball is small, blurred, black, or occluded. A validated basketball-specific model is still needed for reliable identity.
- Top-K orange and color-independent motion candidates improve recall, but heuristics can still attach to hands, shorts, knees, shoes, shadows, or unrelated moving objects. Pose/body priors demote common distractors; they do not prove object identity.
- Online prediction bridges about 500 ms of loss. It can preserve the wrong identity after an incorrect association, so tracked coverage may remain high while localization is wrong.
- Two-frame automatic acquisition blocks one-frame distractors but cannot reject a stable body/shadow blob that remains coherent across frames. It also adds about 100 ms of automatic startup/recovery latency.
- A custom basketball detector can now be configured and its artifact contract can be verified, but no trained, licensed, representative artifact is included yet. Passing the verifier does not establish MediaPipe graph compatibility or accuracy, so the system continues to use the sparse generic detector by default.
- Tap-to-lock gives the tracker an initial point but does not create a persistent visual template. It is an acquisition aid, not a guarantee.
- The representative calibration schedule is complete at 60 independently labeled frames: 56 visible and four fully occluded. Current tracked and raw identity F1 are both 0.428571 (24/56 localized). All four occlusion frames followed measured distractors and none used valid prediction persistence. The slice contains no true absent-ball frames, black-ball footage, varied players, or hard no-ball distractors.
- A larger generic EfficientDet-Lite2 diagnostic was rejected because decoded frames drifted by as much as 166.667 ms against the 50 ms validation limit. Its slight localization change is not valid tuning evidence and it is not the default.
- The new detector export contains only 54 training-eligible positives from two recordings and no absent-ball negatives. It exercises the data path but is far too small and homogeneous for a production detector.
- The mixed 84-second calibration source adds 23 visible ball boxes, one absent frame, and one occlusion. Calibration-selected learned overrides raise tracked/raw identity precision/recall/F1 to 0.666667/0.695652/0.680851, while reported track coverage remains 0.991142. Candidate-oracle recall is 0.913043 and the absent frame still has candidates, demonstrating that candidate generation and negative rejection now limit association tuning.
- Candidate-scale scoring, learned overrides, and guarded challenges reduce some hand/body locks, but repeated browser runs remain sensitive to sparse or mislocalized generic-model detections. A representative basketball-specific detector and substantially denser positive, negative, blur, and occlusion labels are required.

## Move accuracy is below the gate

- Current calibration precision is 0.658537 and recall is 0.490909 after two-frame reacquisition. The prior configuration's once-only holdout precision is 0.705882 and recall is 0.507042, so the required 0.95/0.95 controlled gate remains failed.
- The current holdout has already served its one evaluation. Further tuning must not use it; a materially changed detector needs a new independently collected validation round.
- Between-the-legs and behind-the-back are difficult to separate from one frontal 2D view. The provisional stance-aware transfer cue uses knee spread, but the ball itself has no depth estimate.
- Incorrect ball identity directly corrupts temporal move features. Further threshold tuning cannot compensate for a tracker following the player's body instead of the ball.
- Crossover, hesitation, and in-and-out lack independent labeled holdout clips. The five-class release gate is blocked regardless of synthetic-test performance.
- The mixed calibration source covers crossover but is not holdout data. Its selected three-move configuration reaches precision 0.430769, recall 0.394366, and F1 0.411765; crossover recall is 0.200000 and behind-the-back recall is 0.227273. It does not unblock any release gate.

## Browser and data limitations

- MediaPipe model assets require network access on first load. WebAssembly/WebGL and GPU delegate support vary by browser/device; CPU fallback may be substantially slower.
- Browser camera access requires a secure context on a phone (HTTPS, except for browser-defined localhost exceptions) and user permission. `facingMode: "user"` is a preference; device/browser camera selection behavior can vary.
- Preview frame rate and inference rate are independent. The preview can remain smooth while analyzed frames run near the 10 FPS target.
- Paced upload analysis is deliberately slower than simple playback because every target slot waits for a decoded frame and inference. A 20-second clip has taken roughly 40 seconds on the development machine.
- Upload evaluation rejects missing slots, large gaps, and excessive decoded-frame offsets. This favors reliable benchmarks over fastest processing.
- Current real recordings are one controlled frontal-view cohort. They do not cover varied lighting, camera angle, clothing, backgrounds, multiple players, prolonged occlusion, or no-ball negatives.
- The authenticated `/ai-tracker` route requires configured Supabase credentials; there is no anonymous local demo route.
- `npm install` reports dependency advisories, including the pinned Next.js version. A framework/dependency upgrade needs a separate compatibility and security pass.
