"use client";

import { motion } from "framer-motion";
import { useDocumentTheme } from "@/hooks/useDocumentTheme";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const isDark = useDocumentTheme() === "dark";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={
        (isDark
          ? "rounded-2xl border border-white/5 bg-[#191922] p-6 shadow-xl "
          : "rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/40 text-slate-900 ") +
        className
      }
    >
      {children}
    </motion.div>
  );
}
