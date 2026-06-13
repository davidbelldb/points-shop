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
} from 'lucide-react';

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
};

export const iconNames = Object.keys(iconMap);

export function getMilestoneIcon(name) {
  return iconMap[name] || Heart;
}
