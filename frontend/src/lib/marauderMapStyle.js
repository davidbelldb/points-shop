// Shared "Marauder's Map" map styling (Snazzy Maps #101918), used by the crow
// tracker and the footprints map. Numeric styler values — Google Maps ignores
// string gamma/saturation/weight.

export const PARCHMENT = '#ebc876';   // page + map fallback background
export const ROUTE = '#5e1a13';       // oxblood — routes, nodes, footprints

export const MARAUDERS_STYLE = [
  { featureType: 'all', elementType: 'all', stylers: [{ color: '#4b0202' }, { gamma: 2.38 }, { saturation: 0 }, { visibility: 'simplified' }] },
  { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#ebc876' }] },
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ gamma: 0.01 }, { lightness: 20 }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ saturation: -31 }, { lightness: -33 }, { weight: 2 }, { gamma: 0.8 }] },
  { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'all', stylers: [{ color: '#a00404' }, { weight: 0.18 }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ color: '#980000' }] },
  { featureType: 'administrative.country', elementType: 'all', stylers: [{ color: '#690000' }] },
  { featureType: 'administrative.province', elementType: 'all', stylers: [{ color: '#950000' }] },
  { featureType: 'administrative.locality', elementType: 'all', stylers: [{ color: '#4b0202' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ lightness: 30 }, { saturation: 30 }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ saturation: 20 }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ lightness: 20 }, { saturation: -20 }] },
  { featureType: 'road', elementType: 'all', stylers: [{ color: '#fff0bc' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ lightness: 10 }, { saturation: -30 }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ saturation: 25 }, { lightness: 25 }] },
  { featureType: 'transit.line', elementType: 'all', stylers: [{ color: '#4b0202' }, { weight: 0.5 }] },
  { featureType: 'water', elementType: 'all', stylers: [{ lightness: -20 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d6a95d' }] },
  // Kill EVERY label — road/street names, house numbers, place & POI names,
  // water names (rivers, brooks), transit — the whole lot. Last rule wins.
  { featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

// Reject stray / null coordinates (they coerce to 0 and blow the fit out to a
// world view). Cambridge / UK bounding box.
export const inUK = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && p.lat > 49 && p.lat < 56 && p.lng > -6 && p.lng < 2;
