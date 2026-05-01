import { useState, useEffect } from 'react';

export default function ProductGallery({ product }) {
  const items = [];
  if (product.thumbnail_url) {
    items.push({ id: 'thumb', media_type: 'image', url: product.thumbnail_url });
  }
  for (const m of product.media ?? []) {
    items.push(m);
  }

  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setActiveIdx(0);
  }, [product.id]);

  if (items.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-neutral-400">
        <span className="text-sm">No image yet</span>
      </div>
    );
  }

  const active = items[Math.min(activeIdx, items.length - 1)];

  return (
    <div className="space-y-2">
      <div className="aspect-square overflow-hidden rounded-2xl bg-neutral-100">
        {active.media_type === 'video' ? (
          <video
            key={active.id}
            src={active.url}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={active.url}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setActiveIdx(idx)}
              aria-label={`View ${item.media_type} ${idx + 1}`}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                idx === activeIdx ? 'border-amber-500' : 'border-transparent'
              }`}
            >
              {item.media_type === 'video' ? (
                <>
                  <video
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </>
              ) : (
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
