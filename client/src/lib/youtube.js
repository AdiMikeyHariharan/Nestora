// YouTube links pasted by admins as a listing's video. Mirrored in
// server/src/properties.controller.ts (youTubeId) — keep the two in sync.
const HOSTS = /^(www\.|m\.|music\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;

// The 11-character video id from watch?v=, youtu.be/, shorts/, live/ or embed/ links; else null.
export function youTubeId(url) {
  let u;
  try { u = new URL(String(url || "").trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.test(u.hostname)) return null;
  const id = /youtu\.be$/i.test(u.hostname)
    ? u.pathname.slice(1)
    : u.searchParams.get("v") || u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1];
  return /^[\w-]{11}$/.test(id || "") ? id : null;
}

export const youTubeWatchUrl = id => `https://www.youtube.com/watch?v=${id}`;
// youtube-nocookie: YouTube's privacy-enhanced embed (no tracking cookies until play).
export const youTubeEmbedUrl = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
