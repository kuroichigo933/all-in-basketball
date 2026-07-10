# Seven-day MVP Roadmap

1. **Day 1 — baseline:** install, build, inventory, docs, normalized observation contract.
2. **Day 2 — video path:** upload, decode at fixed cadence, pose/ball extraction, progress and errors.
3. **Day 3 — continuity:** nearest-neighbor/velocity ball tracking through short detector gaps; export observations.
4. **Day 4 — initial rules:** tune crossover, between-the-legs, and hesitation on labeled clips.
5. **Day 5 — remaining moves:** prototype behind-the-back and in-and-out only if evidence supports honest rules.
6. **Day 6 — validation/UI:** benchmark manifest, overlays, false-positive review, mobile browser check.
7. **Day 7 — hardening:** failure handling, documentation, clean install/build/run rehearsal.

Success means the app and pipeline complete, three moves work on controlled labeled clips, every result has time/confidence/evidence, empty clips remain empty, and the same validation command can be rerun. The present code establishes the path and synthetic rule tests; real-clip validation remains mandatory.
