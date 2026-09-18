import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

/** Frame ranges of client/src/assets/face-unlock.json (60 fps, Face ID-style scanner). */
const INTRO: [number, number] = [0, 27]; // pill → square, scanner fades in
const SCAN: [number, number] = [27, 72]; // scanning circles, looped while waiting for the credentials
const TICK_END = 118; // checkmark drawn at 76–94 and held until here

export type FaceUnlockPhase = "scan" | "success";

/**
 * Face ID-style scanner. Plays the intro once, then loops the scanning segment; when `phase` becomes
 * "success" it finishes the current sweep, draws the checkmark and calls `onDone`.
 * The player (lottie-web, svg build) and the animation data are loaded lazily on first use.
 */
export function FaceUnlock({ phase, onDone, className = "" }: { phase: FaceUnlockPhase; onDone?: () => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const anim = useRef<AnimationItem | null>(null);
  const phaseRef = useRef(phase);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const succeed = (a: AnimationItem) => {
    const at = Math.round(a.firstFrame + a.currentFrame); // absolute frame inside the looped segment
    a.loop = false;
    a.playSegments(at < SCAN[1] ? [[at, SCAN[1]], [SCAN[1], TICK_END]] : [SCAN[1], TICK_END], true);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ default: lottie }, { default: data }] = await Promise.all([
        import("lottie-web/build/player/lottie_svg"),
        import("@/assets/face-unlock.json"),
      ]);
      if (!alive || !box.current) return;
      const a = lottie.loadAnimation({
        container: box.current, renderer: "svg", loop: false, autoplay: false, animationData: data,
        rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false },
      });
      a.addEventListener("complete", () => {
        if (phaseRef.current === "success") { doneRef.current?.(); return; }
        a.loop = true; // intro finished → keep scanning until the phase changes
        a.playSegments(SCAN, true);
      });
      anim.current = a;
      if (phaseRef.current === "success") succeed(a); else a.playSegments(INTRO, true);
    })();
    return () => { alive = false; anim.current?.destroy(); anim.current = null; };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === "success" && anim.current) succeed(anim.current);
  }, [phase]);

  return <div ref={box} className={className} aria-hidden="true" />;
}
