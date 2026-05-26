import { Link } from 'react-router-dom';

function Card({ slide }) {
  const inner = (
    <div className="relative aspect-[16/7] overflow-hidden rounded-2xl bg-neutral-100 shadow-sm">
      <img src={slide.image_url} alt={slide.title ?? ''} className="h-full w-full object-cover" />
      {(slide.title || slide.code || slide.subtitle) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          {slide.title && <p className="text-lg font-bold leading-tight">{slide.title}</p>}
          {slide.subtitle && <p className="mt-0.5 text-sm">{slide.subtitle}</p>}
          {slide.code && (
            <p className="mt-1 inline-block rounded bg-white/15 px-2 py-0.5 font-mono text-xs font-semibold backdrop-blur">
              {slide.code}
            </p>
          )}
        </div>
      )}
    </div>
  );
  if (slide.link_url) {
    if (slide.link_url.startsWith('/')) return <Link to={slide.link_url} className="block">{inner}</Link>;
    return <a href={slide.link_url} className="block">{inner}</a>;
  }
  return inner;
}

export default function StackedCards({ slides }) {
  if (!slides || slides.length === 0) return null;
  return (
    <div className="space-y-3">
      {slides.map((s) => <Card key={s.id} slide={s} />)}
    </div>
  );
}
