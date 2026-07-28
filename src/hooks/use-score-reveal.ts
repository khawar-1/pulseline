"use client";

import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef } from "react";

/**
 * Motion 3 of 3 — the score reveal.
 *
 * Only fires the first time a lead acquires a score, which is the moment worth
 * marking: the agent has just made a judgment. Leads that were already scored
 * when the page loaded render at their final value, so a refresh is not a
 * fireworks display, and re-scoring an existing lead does not re-animate.
 *
 * Returns a MotionValue rather than React state so the count-up runs entirely
 * off the render loop — sixty commits per second across a couple of dozen rows
 * is exactly the cost this avoids.
 */
export function useScoreReveal(score: number | null): MotionValue<number> {
  const reduceMotion = useReducedMotion();
  const value = useMotionValue(score ?? 0);
  const rounded = useTransform(value, (current) => Math.round(current));
  const alreadyScored = useRef(score !== null);

  useEffect(() => {
    if (score === null) {
      alreadyScored.current = false;
      value.set(0);
      return;
    }

    if (alreadyScored.current || reduceMotion) {
      alreadyScored.current = true;
      value.set(score);
      return;
    }

    alreadyScored.current = true;
    const controls = animate(value, score, { duration: 0.5, ease: "easeOut" });
    return () => controls.stop();
  }, [score, reduceMotion, value]);

  return rounded;
}
