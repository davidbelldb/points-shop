import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HeroCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => { setIndex(0); }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 4000);
    return () => clearInterval(id);
  }, [slides.length]);

  if (!slides.length) return null;

  function handleClick() {
    const slide = slides[index];
    const link = slide?.link_url;
    if (link) {
      if (link.startsWith('/')) navigate(link);
      else window.location.href = link;
      return;
    }
    setIndex((i) => (i + 1) % slides.length);
  }

  return (
    <div
      className="relative aspect-[16/7] cursor-pointer overflow-hidden rounded-2xl bg-neutral-100"
      onClick={handleClick}
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-700 ${i === index ? 'opacity-100' : 'opacity-0'}`}
        >
          <img
            src={slide.image_url}
            alt={slide.title ?? ''}
            className="h-full w-full object-cover"
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={i === 0 ? 'high' : 'auto'}
          />
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
      ))}

      {slides.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
