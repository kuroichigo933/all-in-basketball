import Image from "next/image";
import { PageTitle } from "@/components/ui";
import ReviewUpload from "./ReviewUpload";

export default function Review() {
  return (
    <>
      <PageTitle kicker="Film Room" title="Get coached on your film" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ReviewUpload />

        <section className="card overflow-hidden">
          <div className="p-5 pb-0">
            <p className="text-xs uppercase tracking-[0.2em] text-game">Sample breakdown</p>
            <h2 className="display mt-1 text-xl">What a coach review looks like</h2>
            <p className="mt-1 text-sm text-muted">
              Here&apos;s a real example. The shooter has good intent but a few mechanics costing them
              makes — see the notes below the clip.
            </p>
          </div>

          <div className="relative mt-4 aspect-[4/3] w-full bg-raised">
            <Image
              src="/bad-basketball-shot.gif"
              alt="Sample jump shot — slight balance and elbow issues"
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain"
            />
            <span className="absolute left-3 top-3 rounded-full bg-asphalt/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-chalk backdrop-blur">
              Sample clip
            </span>
          </div>

          <div className="p-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-wood">Coach notes</p>
            <ul className="mt-3 space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="mt-0.5 inline-block h-5 w-5 flex-none rounded-full bg-game/20 text-center text-xs font-bold leading-5 text-game">1</span>
                <span>
                  <span className="font-semibold text-chalk">Elbow flaring out.</span>{" "}
                  <span className="text-muted">Shooting elbow should sit under the ball, not out to the side. That sideways push is why shots are drifting left.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-block h-5 w-5 flex-none rounded-full bg-game/20 text-center text-xs font-bold leading-5 text-game">2</span>
                <span>
                  <span className="font-semibold text-chalk">Off-hand thumb is flicking.</span>{" "}
                  <span className="text-muted">Guide hand only — it shouldn&apos;t add any force. Watch the spin: it&apos;s wobbling because both hands are pushing.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-block h-5 w-5 flex-none rounded-full bg-game/20 text-center text-xs font-bold leading-5 text-game">3</span>
                <span>
                  <span className="font-semibold text-chalk">Landing forward.</span>{" "}
                  <span className="text-muted">You&apos;re drifting toward the rim. Jump straight up, land where you took off. That&apos;s where range comes from.</span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-block h-5 w-5 flex-none rounded-full bg-game/20 text-center text-xs font-bold leading-5 text-game">4</span>
                <span>
                  <span className="font-semibold text-chalk">Hold the follow-through.</span>{" "}
                  <span className="text-muted">Snap the wrist and hold it until the ball hits the rim. You&apos;re dropping the hand the second the ball leaves — costs you arc.</span>
                </span>
              </li>
            </ul>

            <div className="mt-5 rounded-card border border-line bg-raised p-4 text-sm">
              <p className="font-semibold text-game">Fix this week</p>
              <p className="mt-1 text-muted">
                100 form shots a day from inside the paint — one hand under the ball, off-hand off
                the ball, hold the follow-through. Get the elbow tucked before adding range.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
