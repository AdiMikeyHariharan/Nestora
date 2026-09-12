import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { usePageMeta } from "../seo.js";

export default function NotFound() {
  usePageMeta({
    title: "Page not found",
    description: "The page you're looking for doesn't exist on Nestora.",
    noIndex: true
  });

  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
        className="text-center"
      >
        <p className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-6xl font-extrabold tracking-tight text-transparent sm:text-7xl">404</p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">This nest is empty</h1>
        <p className="mx-auto mt-2.5 max-w-md text-slate-500">
          The page you're looking for doesn't exist or may have moved. Let's get you back to finding a home.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/listings"
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110"
          >Browse properties</Link>
          <Link
            to="/"
            className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
          >Back to home</Link>
        </div>
      </motion.div>
    </div>
  );
}
