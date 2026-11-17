"use client";

import { motion, useReducedMotion } from "motion/react";
import { ProofConsole } from "@/components/proof-console";

export function LiveProof() {
  const reduce = useReducedMotion();
  return (
    <section id="try" className="relative bg-ink px-4 py-24 md:px-8 md:py-36">
      <div className="mx-auto max-w-[1240px]">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="micro text-ember">Live, not a mockup</p>
          <h2 className="type-display mt-4 max-w-[16ch] text-[10.5vw] text-bone md:text-[4.6vw]">Ask a sealed model</h2>
          <p className="mt-5 max-w-[56ch] text-base leading-relaxed text-bone-dim md:text-lg">
            This console talks to the Eclipseal gateway. Every answer comes back signed by the enclave key. Edit a single word and watch the proof break.
          </p>
        </motion.div>
        <motion.div
          className="mt-12 md:mt-16"
          initial={reduce ? false : { opacity: 0, y: 48, rotateX: 8 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformPerspective: 1200 }}
        >
          <ProofConsole className="border border-line" />
        </motion.div>
      </div>
    </section>
  );
}
