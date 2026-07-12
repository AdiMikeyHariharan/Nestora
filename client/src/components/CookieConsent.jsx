import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { consentState, grantConsent, denyConsent } from "../lib/analytics.js";

// Opt-in consent banner. Shown only until the visitor makes a choice.
export default function CookieConsent() {
  const [decided, setDecided] = useState(() => consentState() !== null);

  const accept = () => { grantConsent(); setDecided(true); };
  const decline = () => { denyConsent(); setDecided(true); };

  return (
    <AnimatePresence>
      {!decided && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed bottom-4 left-1/2 z-[80] w-[min(680px,94%)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur-xl sm:flex sm:items-center sm:gap-4"
          role="dialog" aria-label="Cookie consent"
        >
          <p className="text-sm text-slate-600">
            We use cookies to understand how visitors use Nestora and improve your experience.
            See our <a href="/#" className="font-semibold text-emerald-700 hover:underline">Privacy Policy</a>.
          </p>
          <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
            <button
              onClick={decline}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:flex-none"
            >Decline</button>
            <button
              onClick={accept}
              className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 hover:brightness-110 sm:flex-none"
            >Accept</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
