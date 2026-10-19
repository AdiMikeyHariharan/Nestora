import { youTubeId, youTubeEmbedUrl } from "../lib/youtube.js";

// A listing's video: an uploaded file plays in <video>, a YouTube link in YouTube's player.
export default function VideoPlayer({ src, title = "Property video tour" }) {
  const id = youTubeId(src);
  if (id) return (
    <div className="aspect-video overflow-hidden rounded-xl bg-slate-900">
      <iframe
        src={youTubeEmbedUrl(id)} title={title} loading="lazy" className="h-full w-full"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen
      />
    </div>
  );
  return <video controls className="w-full rounded-xl" src={src} />;
}
