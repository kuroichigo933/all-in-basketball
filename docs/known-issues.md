# Known Issues

- EfficientDet's generic `sports ball` class can miss a small, blurred, or occluded basketball. The tracker fills only bounded gaps up to 300 ms and intentionally leaves longer gaps missing.
- Browser analysis requires WebAssembly/WebGL and network access on first model load. GPU delegate support varies.
- GPU initialization falls back to CPU, which is more compatible but may be considerably slower.
- Sampling uses repeated seeks at 10 fps; long/GOP-heavy clips may process slowly and visual overlay shows the latest analyzed frame only.
- Rule thresholds are tested on synthetic observations, not calibrated on labeled basketball clips.
- Between-the-legs uses a 2D knee rectangle and can confuse a low crossover from a frontal view.
- Behind-the-back is inferred from a 2D hip-height trajectory; no true ball depth signal is available.
- In-and-out hand ownership is inferred from wrist proximity and needs real-clip calibration.
- Existing `npm install` reports dependency advisories, including the pinned Next.js version; upgrade needs a separate compatibility/security pass.
- The app requires Supabase credentials for authenticated routes. No local anonymous demo route exists.
