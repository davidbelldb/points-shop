/**
 * Relationship timeline data.
 *
 * Each milestone:
 *  - id: stable unique key
 *  - date: ISO-ish sortable date (use "YYYY" or "YYYY-MM" for fuzzy dates)
 *  - displayDate: human-readable date shown on the card
 *  - title: card heading (supports RichText markup: **bold**, *italic*, ++underline++, # H1-#####H5)
 *  - description: card body (same RichText markup, '\n' = new line, blank line = new paragraph)
 *  - icon: name from `components/timeline/icons.js` (`iconMap`)
 *  - media?: { url, type: 'image' | 'gif', alt?, size?: 'sm' | 'md' | 'lg' | 'full' }
 *      -> put files in /public/images/... and reference as /images/...
 *  - location?: { lat, lng } -> renders a small themed Google map on the card
 *      and adds a pin to the overview map. Coordinates below are
 *      approximate Cambridge UK placeholders - adjust to taste in the admin.
 */
const milestones = [
  {
    id: 'hidden-rooms',
    date: '2018-05-21',
    displayDate: '21 May 2018',
    title: 'The Hidden Rooms',
    description: '"We’ve met before, right? Just bought a flat, me."',
    icon: 'Home',
  },
  {
    id: 'the-triangle-mango',
    date: '2024-10-16',
    displayDate: '16 October 2024',
    title: 'The Triangle',
    description: '"Would you like some mango?"',
    icon: 'Apple',
    location: { lat: 52.2053, lng: 0.1218 },
  },
  {
    id: 'parkers-piece',
    date: '2025-12-05',
    displayDate: '5 December 2025',
    title: "Parker's Piece",
    description:
      '"We met before through Lorenza, right? It’s Katie, right? Katie James!\nDon’t tell me. BRB.\n\nKatie James! Which way ya walking home?"',
    icon: 'MapPin',
    location: { lat: 52.1988, lng: 0.1283 },
  },
  {
    id: 'the-triangle-twirl',
    date: '2026-01',
    displayDate: 'January 2026',
    title: 'The Triangle',
    description: 'Twirl Delivery — TBC\n*[Teams]*',
    icon: 'Truck',
    location: { lat: 52.2053, lng: 0.1218 },
  },
  {
    id: 'blinco-grove-wave',
    date: '2026-02-21',
    displayDate: '21 February 2026',
    title: 'Blinco Grove',
    description: '"thewrathofyarn waved at you" 👋\n\n*[Add the gif here!]*',
    icon: 'MessageCircle',
    media: {
      url: '/images/milestones/blinco-grove-wave.gif',
      type: 'gif',
      alt: 'thewrathofyarn waved at you',
      size: 'md',
    },
    location: { lat: 52.1908, lng: 0.139 },
  },
  {
    id: 'salisbury-arms',
    date: '2026-03-27',
    displayDate: '27 March 2026',
    title: 'The Salisbury Arms',
    description:
      '"This is definitely not a date but I should probably come and tuck you in... That’s a big TV! Oh, y-you’re being sick, oh no"',
    icon: 'Tv',
    location: { lat: 52.1923, lng: 0.1462 },
  },
  {
    id: 'bar-oh',
    date: '2026-04-03',
    displayDate: '3 April 2026',
    title: 'Bar-OH',
    description: '"Good date, this."',
    icon: 'Wine',
    location: { lat: 52.2025, lng: 0.1297 },
  },
  {
    id: 'al-pomodoro-tenpin',
    date: '2026-04-18',
    displayDate: '18 April 2026',
    title: 'Al Pomodoro & Tenpin',
    description: '"A dessert for your main then, yeah?"',
    icon: 'IceCream',
    location: { lat: 52.1929, lng: 0.1336 },
  },
  {
    id: 'leisure-park-travelodge',
    date: '2026-05-10',
    displayDate: '10 May 2026',
    title: 'Leisure Park Travelodge',
    description: '"Might just be the best 24 hours of 2026 so far…."',
    icon: 'BedDouble',
    location: { lat: 52.1929, lng: 0.1336 },
  },
];

export default milestones;
