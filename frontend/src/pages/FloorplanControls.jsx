import { useState } from 'react';

/*
 * Admin-only calibration UI for the house floorplan overlay. Tap "Calibrate",
 * then DRAG the floorplan on the map to move it, and use the sliders to rotate,
 * scale (real width in metres) and fade it. The live numbers at the bottom are the
 * values to lock in — copy them to me and I'll bake them in as the permanent default
 * (so it's durable and Katie sees it too). Until then they're saved on this device.
 */

const ROUTE = '#5e1a13';
const CARD = '#f7db9b';

function Row({ label, value, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
        <span>{label}</span><span style={{ opacity: 0.7 }}>{value}</span>
      </div>
      {children}
    </label>
  );
}

export default function FloorplanControls({ cal, setCal, calibrating, setCalibrating, onGoToHouse, onCaptureView }) {
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setCal((c) => ({ ...c, [k]: Number(e.target.value) }));
  const nudge = (k, d) => () => setCal((c) => ({ ...c, [k]: Number((c[k] + d).toFixed(6)) }));

  const values = `lat: ${cal.lat.toFixed(6)}, lng: ${cal.lng.toFixed(6)}, widthM: ${cal.widthM}, rotationDeg: ${cal.rotationDeg}, opacity: ${cal.opacity}, mapHeading: ${cal.mapHeading ?? 0}, mapScale: ${cal.mapScale ?? 1}, viewLat: ${(cal.viewLat ?? 0).toFixed(6)}, viewLng: ${(cal.viewLng ?? 0).toFixed(6)}, viewZoom: ${cal.viewZoom ?? 0}`;

  if (!calibrating) {
    return (
      <button
        type="button"
        data-mm-controls
        onClick={() => setCalibrating(true)}
        style={{
          position: 'absolute', left: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 12,
          border: 'none', borderRadius: 999, padding: '10px 16px', cursor: 'pointer',
          background: CARD, color: '#000', fontSize: 13, fontWeight: 800,
          boxShadow: '0 6px 18px rgba(0,0,0,0.4)', WebkitTapHighlightColor: 'transparent',
        }}
      >
        Calibrate floorplan
      </button>
    );
  }

  return (
    <div data-mm-controls style={{
      position: 'absolute', left: 12, right: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 13,
      background: CARD, borderRadius: 18, padding: '12px 14px', color: '#000',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>Calibrate floorplan</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onGoToHouse} style={btn}>Go to house</button>
          <button type="button" onClick={() => setCalibrating(false)} style={{ ...btn, background: ROUTE, color: '#fff' }}>Done</button>
        </div>
      </div>

      <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>Drag the floorplan on the map to move it.</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, padding: '6px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.05)' }}>
        <span style={{ fontSize: 12 }}>
          Default view <span style={{ opacity: 0.6 }}>· zoom {(cal.viewZoom ?? 0).toFixed ? (cal.viewZoom ?? 0).toFixed(1) : cal.viewZoom}</span>
        </span>
        <button type="button" onClick={onCaptureView} style={{ ...mini, background: ROUTE, color: '#fff' }}>Set current view</button>
      </div>

      <Row label="Map rotation (whole map)" value={`${cal.mapHeading ?? 0}°`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={nudge('mapHeading', -0.5)} style={mini}>−</button>
          <input type="range" min="-180" max="180" step="0.5" value={cal.mapHeading ?? 0} onChange={set('mapHeading')} style={{ flex: 1 }} />
          <button type="button" onClick={nudge('mapHeading', 0.5)} style={mini}>+</button>
        </div>
      </Row>

      <Row label="Floorplan rotation" value={`${cal.rotationDeg}°`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={nudge('rotationDeg', -1)} style={mini}>−</button>
          <input type="range" min="0" max="359" step="1" value={cal.rotationDeg} onChange={set('rotationDeg')} style={{ flex: 1 }} />
          <button type="button" onClick={nudge('rotationDeg', 1)} style={mini}>+</button>
        </div>
      </Row>

      <Row label="Width (real metres)" value={`${cal.widthM} m`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={nudge('widthM', -0.2)} style={mini}>−</button>
          <input type="range" min="2" max="25" step="0.1" value={cal.widthM} onChange={set('widthM')} style={{ flex: 1 }} />
          <button type="button" onClick={nudge('widthM', 0.2)} style={mini}>+</button>
        </div>
      </Row>

      <Row label="Extra zoom (beyond map max)" value={`${(cal.mapScale ?? 1).toFixed(2)}×`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={nudge('mapScale', -0.1)} style={mini}>−</button>
          <input type="range" min="1" max="4" step="0.1" value={cal.mapScale ?? 1} onChange={set('mapScale')} style={{ flex: 1 }} />
          <button type="button" onClick={nudge('mapScale', 0.1)} style={mini}>+</button>
        </div>
      </Row>

      <Row label="Opacity" value={cal.opacity.toFixed(2)}>
        <input type="range" min="0.2" max="1" step="0.05" value={cal.opacity} onChange={set('opacity')} style={{ width: '100%' }} />
      </Row>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <code style={{ flex: 1, fontSize: 10.5, background: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: '6px 8px', overflowX: 'auto', whiteSpace: 'nowrap' }}>{values}</code>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(values).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}
          style={mini}
        >
          {copied ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

const btn = { border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', background: '#0000000f' };
const mini = { border: 'none', borderRadius: 8, padding: '4px 9px', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: '#00000012' };
