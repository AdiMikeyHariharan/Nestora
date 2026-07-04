// Lucide-style stroke icons — replaces emoji glyphs for a modern, consistent look.
const I = ({ children, size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

export const BedIcon = p => <I {...p}><path d="M2 9V4" /><path d="M2 17v-4h20v4" /><path d="M2 13V9c0-1 .9-2 2-2h5c1.1 0 2 1 2 2v4" /><path d="M22 13v-2c0-1.1-.9-2-2-2h-7" /><path d="M2 21v-4" /><path d="M22 21v-4" /></I>;
export const BathIcon = p => <I {...p}><path d="M2 12h20" /><path d="M4 12V5a2 2 0 0 1 2-2h1.5a2 2 0 0 1 2 2" /><path d="M4 12v3a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-3" /><path d="M7 21l-1 1" /><path d="M17 21l1 1" /></I>;
export const RulerIcon = p => <I {...p}><path d="M21.3 8.7l-6-6a1 1 0 0 0-1.4 0l-11.2 11.2a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0l11.2-11.2a1 1 0 0 0 0-1.4z" /><path d="M7.5 10.5l1.5 1.5" /><path d="M10.5 7.5l1.5 1.5" /><path d="M13.5 4.5l1.5 1.5" /></I>;
export const PinIcon = p => <I {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></I>;
export const HeartIcon = ({ filled, ...p }) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true">
    <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />
  </svg>
);
export const SparkIcon = p => <I {...p}><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></I>;
export const ChatIcon = p => <I {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></I>;
export const WaIcon = p => (
  <svg width={p?.size || 22} height={p?.size || 22} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={p?.className}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.1-.7l.5-.6c.1-.2.1-.4 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.8-1 1.8-.7 2.9.5 1.6 1.6 3.1 3.1 4.3 1.9 1.4 3.4 1.9 4.6 1.9.7 0 1.5-.3 2-.9.3-.4.5-.9.4-1.4-.1-.2-.3-.3-.5-.5z" />
  </svg>
);
export const ArrowIcon = p => <I {...p}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></I>;
