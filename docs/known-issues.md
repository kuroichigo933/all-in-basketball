# Known Issues

## Ball identity is the main blocker

- The generic EfficientDet `sports ball` class detects the basketball only sparsely in the supplied recordings, especially when the ball is small, blurred, black, or occluded. A validated basketball-specific model is still needed for reliable identity.
- Top-K orange and color-independent motion candidates improve recall, but heuristics can still attach to hands, shorts, knees, shoes, shadows, or unrelated moving objects. Pose/body priors demote common distractors; they do not prove object identity.
- Online prediction bridges about 500 ms of loss. It can preserve the wrong identity after an incorrect association, so tracked coverage may remain high while localization is wrong.
- Two-frame automatic acquisition blocks one-frame distractors but cannot reject a stable body/shadow blob that remains coherent across frames. It also adds about 100 ms of automatic startup/recovery latency.
- A custom basketball detector can now be configured and its artifact contract can be verified, but no trained, licensed, representative artifact is included yet. Passing the verifier does not establish MediaPipe graph compatibility or accuracy, so the system continues to use the sparse generic detector by default.
- Tap-to-lock gives the tracker an initial point but does not create a persistent visual template. It is an acquisition aid, not a guarantee.
- The representative calibration schedule is complete at 60 independently labeled frames: 56 visible and four fully occluded. Balanced appearance/dynamics replay localizes 44/56 for 0.785714 tracked F1. All four occlusion frames still attach to measurements and none use valid prediction persistence. The slice contains no true absent-ball frames, black-ball footage, varied players, or hard no-ball distractors.
- A larger generic EfficientDet-Lite2 diagnostic was rejected because decoded frames drifted by as much as 166.667 ms against the 50 ms validation limit. Its slight localization change is not valid tuning evidence and it is not the default.
- The combined calibration detector export contains 77 training-eligible positives, two difficult positives, one absent frame, and five excluded occlusions across three source IDs, two players, and two indoor setups. It still lacks black-ball coverage, source-diverse negatives, and verified hard-negative footage, so it remains far too small and homogeneous for a production detector.
- The source-aware combined calibration report covers 79 visible boxes, one absent frame, and five occlusions. Appearance-aware, move-constrained dynamics replay reaches 0.772152-0.777070 ball F1 with a 0.004918 spread while candidate-oracle recall remains 0.974684. The one absent frame is rejected, but it is far too little negative evidence; black-ball behavior remains unmeasured on real footage.
- Adaptive focused inference raises learned-candidate frame coverage to 0.854438-0.860355 and improves move output, but it does not fix the selected ball-identity spread. It adds a second model call only after a primary miss; sustained live-device inference and thermal behavior still require phone testing.
- Candidate-scale scoring, learned overrides, and guarded challenges reduce some hand/body locks, but repeated browser runs remain sensitive to sparse or mislocalized generic-model detections. A representative basketball-specific detector and substantially denser positive, negative, blur, and occlusion labels are required.

## Move accuracy is below the gate

- Current calibration precision is 0.658537 and recall is 0.490909 after two-frame reacquisition. The consumed holdout's controlled precision is 0.705882 and recall is 0.507042, so the required 0.95/0.95 controlled gate remains failed and new release evidence needs another source.
- The current holdout has already served its one evaluation. Further tuning must not use it; a materially changed detector needs a new independently collected validation round.
- Between-the-legs and behind-the-back are difficult to separate from one frontal 2D view. The provisional stance-aware transfer cue uses knee spread, but the ball itself has no depth estimate.
- Incorrect ball identity directly corrupts temporal move features. Further threshold tuning cannot compensate for a tracker following the player's body instead of the ball.
- Crossover, hesitation, and in-and-out lack independent labeled holdout clips. The five-class release gate is blocked regardless of synthetic-test performance.
- The mixed calibration source covers crossover but is not holdout data. Balanced dynamics yields combined move F1 0.536170-0.538462; this remains far below 95%, and no release gate is unblocked.
- Isolated development live smokes varied from 4.6-8.2 analyzed FPS versus the approximate 10 FPS target. Expanded-view inference continued, with 98-99% measured and 99% tracked coverage on the generated feed, but coverage is not ball-identity accuracy.
- Generic-model candidate confidence and location vary across otherwise valid browser regenerations. Ball F1 spread is 0.043478 and fails the 0.03 diagnostic; promoted-default move spread is 0.039056 and also fails. More runs and more varied data are needed before treating stability as established.

## Browser and data limitations

- MediaPipe model assets require network access on first load. WebAssembly/WebGL and GPU delegate support vary by browser/device; CPU fallback may be substantially slower.
- Browser camera access requires a secure context on a phone (HTTPS, except for browser-defined localhost exceptions) and user permission. `facingMode: "user"` is a preference; device/browser camera selection behavior can vary.
- Preview frame rate and inference rate are independent. The preview can remain smooth while analyzed frames run near the 10 FPS target.
- Paced upload analysis is deliberately slower than simple playback because every target slot waits for a decoded frame and inference. A 20-second clip has taken roughly 40 seconds on the development machine.
- Upload evaluation rejects missing slots, large gaps, and excessive decoded-frame offsets. This favors reliable benchmarks over fastest processing.
- Current real recordings are one controlled frontal-view cohort. They do not cover varied lighting, camera angle, clothing, backgrounds, multiple players, prolonged occlusion, or no-ball negatives.
- The authenticated `/ai-tracker` route requires configured Supabase credentials; there is no anonymous local demo route.
- `npm install` reports dependency advisories, including the pinned Next.js version. A framework/dependency upgrade needs a separate compatibility and security pass.
