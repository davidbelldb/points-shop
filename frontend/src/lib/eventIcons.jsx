/* Icon registry for calendar events. Each entry exposes a small React
   component that takes `size`. The wrapping <svg> sets stroke="currentColor"
   so the parent's `style={{ color: '#ed70bd' }}` (or any other) tints the
   strokes uniformly across both light and dark mode.

   Keep paths simple and Lucide-inspired so they read well at ~16-20px.
   Add new icons by extending EVENT_ICONS — no other code changes needed. */

function SvgWrap({ size = 20, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const Calendar = (p) => (
  <SvgWrap {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </SvgWrap>
);

const Food = (p) => (
  <SvgWrap {...p}>
    <path d="M3 2v7c0 1.1.9 2 2 2h0c1.1 0 2-.9 2-2V2" />
    <path d="M5 11v11" />
    <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z" />
    <path d="M21 15v7" />
  </SvgWrap>
);

const Coffee = (p) => (
  <SvgWrap {...p}>
    <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
    <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
    <line x1="6" y1="2" x2="6" y2="5" />
    <line x1="10" y1="2" x2="10" y2="5" />
    <line x1="14" y1="2" x2="14" y2="5" />
  </SvgWrap>
);

const Cinema = (p) => (
  <SvgWrap {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <line x1="7" y1="4" x2="7" y2="20" />
    <line x1="17" y1="4" x2="17" y2="20" />
    <line x1="2" y1="9" x2="7" y2="9" />
    <line x1="17" y1="9" x2="22" y2="9" />
    <line x1="2" y1="15" x2="7" y2="15" />
    <line x1="17" y1="15" x2="22" y2="15" />
  </SvgWrap>
);

const Cake = (p) => (
  <SvgWrap {...p}>
    <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
    <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
    <path d="M2 21h20" />
    <path d="M7 8v3" /><path d="M12 8v3" /><path d="M17 8v3" />
    <path d="M7 4l.5 1L7 6" /><path d="M12 4l.5 1-.5 1" /><path d="M17 4l.5 1-.5 1" />
  </SvgWrap>
);

const Gift = (p) => (
  <SvgWrap {...p}>
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" />
  </SvgWrap>
);

const Heart = (p) => (
  <SvgWrap {...p}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </SvgWrap>
);

const Music = (p) => (
  <SvgWrap {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </SvgWrap>
);

const Camera = (p) => (
  <SvgWrap {...p}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </SvgWrap>
);

const Football = (p) => (
  <SvgWrap {...p}>
    <circle cx="12" cy="12" r="10" />
    <polygon points="12 7 15.6 9.6 14.2 13.8 9.8 13.8 8.4 9.6" />
    <line x1="12" y1="7" x2="12" y2="2" />
    <line x1="15.6" y1="9.6" x2="20.5" y2="8" />
    <line x1="14.2" y1="13.8" x2="17" y2="18" />
    <line x1="9.8" y1="13.8" x2="7" y2="18" />
    <line x1="8.4" y1="9.6" x2="3.5" y2="8" />
  </SvgWrap>
);

const Tennis = (p) => (
  <SvgWrap {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M5 4.5C7.5 8 7.5 16 5 19.5" />
    <path d="M19 4.5C16.5 8 16.5 16 19 19.5" />
  </SvgWrap>
);

const Basketball = (p) => (
  <SvgWrap {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2v20" />
    <path d="M5 5c3 3 3 11 0 14" />
    <path d="M19 5c-3 3-3 11 0 14" />
  </SvgWrap>
);

const Boat = (p) => (
  <SvgWrap {...p}>
    <path d="M2 21c2 0 4-1 6-1s4 1 6 1 4-1 6-1" />
    <path d="M3 16h18l-2 4H5z" />
    <path d="M12 4v12" />
    <path d="M12 4l-6 8h12z" />
  </SvgWrap>
);

const Hiking = (p) => (
  <SvgWrap {...p}>
    <path d="M3 20l5-9 4 6 4-8 5 11z" />
    <circle cx="14" cy="6" r="1.5" />
  </SvgWrap>
);

const Bicycle = (p) => (
  <SvgWrap {...p}>
    <circle cx="6" cy="17" r="3" />
    <circle cx="18" cy="17" r="3" />
    <path d="M6 17l4-8h5l3 8" />
    <path d="M10 9l-2-4h2" />
    <path d="M15 9l2-4" />
  </SvgWrap>
);

const Beach = (p) => (
  <SvgWrap {...p}>
    <path d="M12 3v18" />
    <path d="M3 11a9 9 0 0 1 18 0z" />
    <path d="M12 3a9 9 0 0 0-2 8" />
    <path d="M12 3a9 9 0 0 1 2 8" />
  </SvgWrap>
);

const Car = (p) => (
  <SvgWrap {...p}>
    <path d="M5 17H3v-5l2-5h14l2 5v5h-2" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </SvgWrap>
);

const Plane = (p) => (
  <SvgWrap {...p}>
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9 0-1.2.3L2 8l8 4-3 3-3-1-1 1 4 2 2 4 1-1-1-3 3-3 4 8 1.5-1.6c.3-.3.4-.7.3-1.2z" />
  </SvgWrap>
);

const Paw = (p) => (
  <SvgWrap {...p}>
    <circle cx="5" cy="11" r="2" />
    <circle cx="19" cy="11" r="2" />
    <circle cx="9" cy="6" r="2" />
    <circle cx="15" cy="6" r="2" />
    <path d="M12 13c-3.5 0-6 2.5-6 5 0 1.5 1.5 2.5 3 2 1-.3 2-1 3-1s2 .7 3 1c1.5.5 3-.5 3-2 0-2.5-2.5-5-6-5z" />
  </SvgWrap>
);

const Book = (p) => (
  <SvgWrap {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </SvgWrap>
);

/* Ordered list — order is what the picker strip displays. The first entry
   acts as the default fallback when an event has no icon stored. */
export const EVENT_ICONS = [
  { key: 'calendar',    label: 'Default',     Icon: Calendar },
  { key: 'food',        label: 'Food',        Icon: Food },
  { key: 'coffee',      label: 'Coffee',      Icon: Coffee },
  { key: 'cinema',      label: 'Cinema',      Icon: Cinema },
  { key: 'cake',        label: 'Cake',        Icon: Cake },
  { key: 'gift',        label: 'Gift',        Icon: Gift },
  { key: 'heart',       label: 'Heart',       Icon: Heart },
  { key: 'music',       label: 'Music',       Icon: Music },
  { key: 'camera',      label: 'Camera',      Icon: Camera },
  { key: 'football',    label: 'Football',    Icon: Football },
  { key: 'tennis',      label: 'Tennis',      Icon: Tennis },
  { key: 'basketball',  label: 'Basketball',  Icon: Basketball },
  { key: 'boat',        label: 'Boating',     Icon: Boat },
  { key: 'hiking',      label: 'Hiking',      Icon: Hiking },
  { key: 'bicycle',     label: 'Bicycle',     Icon: Bicycle },
  { key: 'beach',       label: 'Beach',       Icon: Beach },
  { key: 'car',         label: 'Driving',     Icon: Car },
  { key: 'plane',       label: 'Travel',      Icon: Plane },
  { key: 'paw',         label: 'Pets',        Icon: Paw },
  { key: 'book',        label: 'Reading',     Icon: Book },
];

export function getEventIcon(key) {
  return EVENT_ICONS.find((i) => i.key === key) ?? EVENT_ICONS[0];
}

/* Convenience renderer — picks the right component and sizes it. The
   colour is whatever the parent sets via CSS `color` / Tailwind `text-*`,
   defaulting to the pink we use across the menu and accent UI. */
export function EventIcon({ iconKey, size = 20 }) {
  const { Icon } = getEventIcon(iconKey);
  return <Icon size={size} />;
}

export const EVENT_ICON_COLOR = '#ed70bd';
