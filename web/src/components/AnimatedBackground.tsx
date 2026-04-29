"use client";

import { motion } from "framer-motion";

export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-black to-zinc-950" />

      <motion.div
        className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-fuchsia-500/20 blur-3xl"
        animate={{
          x: ["-50%", "-44%", "-52%"],
          y: [-40, -10, -40],
          opacity: [0.35, 0.55, 0.35],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute top-32 right-[-140px] h-[520px] w-[520px] rounded-full bg-cyan-400/20 blur-3xl"
        animate={{
          x: [0, -60, 0],
          y: [0, 40, 0],
          opacity: [0.35, 0.6, 0.35],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute bottom-[-220px] left-[-140px] h-[560px] w-[560px] rounded-full bg-emerald-400/15 blur-3xl"
        animate={{
          x: [0, 80, 0],
          y: [0, -60, 0],
          opacity: [0.25, 0.5, 0.25],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.06),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(255,255,255,0.05),transparent_45%)]" />
    </div>
  );
}
