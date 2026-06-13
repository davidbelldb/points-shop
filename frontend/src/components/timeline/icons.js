import { createElement } from 'react';
import {
  Home,
  Apple,
  MapPin,
  Truck,
  MessageCircle,
  Tv,
  Wine,
  IceCream,
  BedDouble,
  Heart,
  Sparkles,
  Camera,
  Gift,
  Music,
  Plane,
  Cake,
  PartyPopper,
  Star,
  Sun,
  Moon,
  Pizza,
  Gamepad2,
} from 'lucide-react';

/**
 * Lucide doesn't ship a bowling pin icon, so this is a small hand-drawn one
 * matching lucide's conventions (24x24 viewBox, stroke-based, `currentColor`,
 * accepts the same props such as `className`). Built with `createElement`
 * (no JSX) so this file can stay a plain `.js` module.
 */
function BowlingPin(props) {
  return createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ...props,
    },
    createElement('path', {
      d: 'M12 2c-1.1 0-2 1.3-2 3 0 1.2.5 2.1 1 2.8-1.8 1.7-3 4.6-3 7.7 0 3 1.5 5.5 4 5.5s4-2.5 4-5.5c0-3.1-1.2-6-3-7.7.5-.7 1-1.6 1-2.8 0-1.7-.9-3-2-3Z',
    }),
    createElement('path', { d: 'M9.3 9.5h5.4' }),
    createElement('path', { d: 'M8.7 12h6.6' })
  );
}

/**
 * Map of icon name (string, as stored on a milestone) -> lucide-react component.
 * Add new entries here as new icons are referenced from milestone data or the
 * admin page's icon picker. Unknown names fall back to `Heart`.
 */
export const iconMap = {
  Home,
  Apple,
  MapPin,
  Truck,
  MessageCircle,
  Tv,
  Wine,
  IceCream,
  BedDouble,
  Heart,
  Sparkles,
  Camera,
  Gift,
  Music,
  Plane,
  Cake,
  PartyPopper,
  Star,
  Sun,
  Moon,
  Pizza,
  BowlingPin,
  Gamepad2,
};

export const iconNames = Object.keys(iconMap);

export function getMilestoneIcon(name) {
  return iconMap[name] || Heart;
}
