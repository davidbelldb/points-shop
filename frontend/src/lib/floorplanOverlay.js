/*
 * Georeferenced floorplan overlay for Google Maps.
 *
 * Pins an SVG (Katie's house floorplan) to a real lat/lng, sizes it to a real
 * width in METRES (so it scales/pins correctly as you zoom and pan), and rotates
 * it to match the building's true orientation. This is the piece Google's built-in
 * GroundOverlay can't do (it has no rotation), so we roll a custom OverlayView.
 *
 * Layering: normally the floorplan sits in `mapPane` (the lowest overlay pane, above
 * the tiles) so the footprint trail draws ON TOP of it — footsteps inside the house.
 * During calibration we temporarily move it up to `overlayMouseTarget` (the pane that
 * receives DOM events) so it can be dragged, then drop it back down when done.
 *
 * `state` = { lat, lng, widthM, rotationDeg, opacity }.
 */

const MPP0 = 156543.03392;   // metres-per-pixel at zoom 0, equator

export function createFloorplanOverlay(map, { svgUrl, aspect, initial, onChange }) {
  const g = window.google;
  const overlay = new g.maps.OverlayView();
  let div = null;
  let state = { ...initial };
  let interactive = false;
  let drag = null;

  function place(panes) {
    if (!div || !panes) return;
    (interactive ? panes.overlayMouseTarget : panes.mapPane).appendChild(div);
  }

  overlay.onAdd = function onAdd() {
    div = document.createElement('div');
    Object.assign(div.style, {
      position: 'absolute', transformOrigin: 'center center',
      touchAction: 'none', userSelect: 'none', willChange: 'left, top, width, height, transform',
    });
    const img = document.createElement('img');
    img.src = svgUrl; img.draggable = false;
    Object.assign(img.style, { width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
    div.appendChild(img);
    div.addEventListener('pointerdown', onPointerDown);
    place(this.getPanes());
  };

  function onPointerDown(e) {
    if (!interactive) return;
    e.preventDefault(); e.stopPropagation();
    const proj = overlay.getProjection(); if (!proj) return;
    try { div.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    map.set('draggable', false);
    drag = { x: e.clientX, y: e.clientY, px: proj.fromLatLngToDivPixel(new g.maps.LatLng(state.lat, state.lng)) };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }
  function onPointerMove(e) {
    if (!drag) return;
    const proj = overlay.getProjection(); if (!proj) return;
    const np = new g.maps.Point(drag.px.x + (e.clientX - drag.x), drag.px.y + (e.clientY - drag.y));
    const ll = proj.fromDivPixelToLatLng(np);
    state = { ...state, lat: ll.lat(), lng: ll.lng() };
    draw();
    if (onChange) onChange({ ...state });
  }
  function onPointerUp() {
    drag = null;
    map.set('draggable', true);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }

  function draw() {
    const proj = overlay.getProjection();
    if (!proj || !div) return;
    const c = proj.fromLatLngToDivPixel(new g.maps.LatLng(state.lat, state.lng));
    if (!c) return;
    const mpp = (MPP0 * Math.cos((state.lat * Math.PI) / 180)) / 2 ** map.getZoom();
    const wPx = Math.max(1, state.widthM / mpp);
    const hPx = wPx * aspect;
    div.style.left = `${c.x - wPx / 2}px`;
    div.style.top = `${c.y - hPx / 2}px`;
    div.style.width = `${wPx}px`;
    div.style.height = `${hPx}px`;
    div.style.transform = `rotate(${state.rotationDeg}deg)`;
    div.style.opacity = String(state.opacity);
    div.style.cursor = interactive ? 'move' : 'default';
    div.style.pointerEvents = interactive ? 'auto' : 'none';
  }
  overlay.draw = draw;

  overlay.onRemove = function onRemove() {
    if (div) { div.removeEventListener('pointerdown', onPointerDown); div.remove(); div = null; }
  };

  overlay.setMap(map);

  return {
    update(cal) { state = { ...state, ...cal }; draw(); },
    setInteractive(on) { interactive = on; place(overlay.getPanes()); draw(); },
    getState() { return { ...state }; },
    destroy() { overlay.setMap(null); },
  };
}
