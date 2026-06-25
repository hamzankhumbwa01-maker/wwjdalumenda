import { useState, useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIVE BREAKPOINT HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const FARM_URLS = {
  'Farm 61': 'https://hamza-nkhumbwa.github.io/galanwra/Farm61.geojson',
  'Farm 62': 'https://hamza-nkhumbwa.github.io/galanwra/Farm62.geojson',
  'Farm 71': 'https://hamza-nkhumbwa.github.io/galanwra/Farm71.geojson',
  'Farm 72': 'https://hamza-nkhumbwa.github.io/galanwra/Farm72.geojson',
}
const FARM_COLORS = {
  'Farm 61': '#2176ff',
  'Farm 62': '#00d084',
  'Farm 71': '#f5a623',
  'Farm 72': '#e040fb',
}
const ACTIVITY_CSV  = 'https://hamza-nkhumbwa.github.io/galanwra/Activity.csv'
const PIE_CSV       = 'https://hamza-nkhumbwa.github.io/galanwra/PieChat.csv'
const BAR_CSV       = 'https://hamza-nkhumbwa.github.io/galanwra/Bargraph.csv'
const WEEK_CSV      = 'https://hamza-nkhumbwa.github.io/galanwra/Week.csv'
const VILLAGES_URL  = 'https://hamza-nkhumbwa.github.io/galanwra/Alumendavillages.geojson'
const DAMS_URL      = 'https://hamza-nkhumbwa.github.io/galanwra/damz.geojson'
const ROUTES_URL    = 'https://hamza-nkhumbwa.github.io/galanwra/route.geojson'

const LULC_TILES = {
  '2005': 'https://earthengine.googleapis.com/v1/projects/ee-gis-021-20/maps/bc79a77a7f5ad3ea9eddf2e583589073-87c86102bfaaab46b560a9fd8f252ce7/tiles/{z}/{x}/{y}',
  '2015': 'https://earthengine.googleapis.com/v1/projects/ee-gis-021-20/maps/dc191c4dd5c74646c729f082068f87c0-02c11939c2b497aabee9eb2ee5640070/tiles/{z}/{x}/{y}',
  '2025': 'https://earthengine.googleapis.com/v1/projects/ee-gis-021-20/maps/4f4b200fa2f5da6cdab0277a5a823391-60eb3ad7c8aa75c04dff7d27d0e29436/tiles/{z}/{x}/{y}',
}
const LULC_LEGEND = [
  { color: '#3264d6', label: 'Water'      },
  { color: '#98ff00', label: 'Cropland'   },
  { color: '#fd7912', label: 'Built-up'   },
  { color: '#212020', label: 'Bare Soil'  },
  { color: '#8c8e8c', label: 'Impervious' },
  { color: '#3af7ee', label: 'Wetland'    },
  { color: '#7e5937', label: 'Soil'       },
  { color: '#006600', label: 'Forest'     },
  { color: '#eded51', label: 'Grassland'  },
]
const ACT_TYPES  = ['Select All','Intruders','Sweepers','Fish-Mongers','Fuel Mongers','Others']
const DL_PASS    = 'WWJD2026'
const LAYERS = [
  { id: 'Fields',               abbr: 'FLD' },
  { id: 'Activity',             abbr: 'ACT', badge: true },
  { id: 'Villages',             abbr: 'VLG' },
  { id: 'Transition Statistics',abbr: 'TRN', external: true },
  { id: 'LULC Maps',            abbr: 'LUL' },
  { id: 'Dams-Pumps',           abbr: 'DAM' },
  { id: 'Buffer Distance',      abbr: 'BUF' },
  { id: 'Hotspot Fields',       abbr: 'HOT', badge: true },
  { id: 'Theft Routes',         abbr: 'THF', badge: true },
]
const BASE_MAPS = {
  'Google Hybrid':    { url: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',  sub: ['mt0','mt1','mt2','mt3'], maxZoom: 22 },
  'Google Satellite': { url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',  sub: ['mt0','mt1','mt2','mt3'], maxZoom: 22 },
  'Google Streets':   { url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',  sub: ['mt0','mt1','mt2','mt3'], maxZoom: 22 },
  'OpenStreetMap':    { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',   sub: ['a','b','c'],             maxZoom: 19 },
  'CartoDB Dark':     { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', sub: ['a','b','c','d'], maxZoom: 20 },
}

// Security-grade color palette — no emojis used as iconsf
const THREAT_RED    = '#e63946'
const THREAT_AMBER  = '#f4a261'
const SAFE_GREEN    = '#2ec4b6'
const INTEL_BLUE    = '#2176ff'
const NIGHT_VIOLET  = '#7b5ea7'
const DAM_CYAN      = '#00b4d8'

// ─────────────────────────────────────────────────────────────────────────────
// UTM ZONE 36S → WGS84  (EPSG:32736 — correct for Illovo Nchalo, Malawi)
// Validated: E~704000, N~8197000  =>  lat -16.30, lon 34.91
// ─────────────────────────────────────────────────────────────────────────────
function utm36sToLatLon(easting, northing) {
  const a  = 6378137.0
  const f  = 1 / 298.257223563
  const b  = a * (1 - f)
  const e2 = 1 - (b / a) ** 2
  const k0 = 0.9996
  const lon0 = 33  // central meridian zone 36

  const N_adj = northing - 10000000.0
  const E_adj = easting  - 500000.0

  const M  = N_adj / k0
  const mu = M / (a * (1 - e2/4 - 3*e2**2/64 - 5*e2**3/256))

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  let phi1 = mu
    + (3*e1/2   - 27*e1**3/32)  * Math.sin(2*mu)
    + (21*e1**2/16 - 55*e1**4/32) * Math.sin(4*mu)
    + (151*e1**3/96)             * Math.sin(6*mu)
    + (1097*e1**4/512)           * Math.sin(8*mu)

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1)**2)
  const T1 = Math.tan(phi1) ** 2
  const C1 = (e2 / (1 - e2)) * Math.cos(phi1) ** 2
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1)**2) ** 1.5
  const D  = E_adj / (N1 * k0)

  let lat = phi1
    - (N1 * Math.tan(phi1) / R1) * (
        D**2/2
        - (5 + 3*T1 + 10*C1 - 4*C1**2 - 9*e2/(1-e2)) * D**4/24
      )
    + (N1 * Math.tan(phi1) / R1) * (
        (61 + 90*T1 + 298*C1 + 45*T1**2 - 252*e2/(1-e2) - 3*C1**2) * D**6/720
      )

  let lon = (
      D
      - (1 + 2*T1 + C1) * D**3/6
      + (5 - 2*C1 + 28*T1 - 3*C1**2 + 8*e2/(1-e2) + 24*T1**2) * D**5/120
    ) / Math.cos(phi1)

  return [lat * (180 / Math.PI), lon * (180 / Math.PI) + lon0]
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim())
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG ICON COMPONENTS  (no emoji, clean geometric icons)
// ─────────────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 14, color = 'currentColor' }) => {
  const s = size
  const paths = {
    fields:     <><rect x={2} y={10} width={20} height={2} rx={1} fill={color} opacity={.4}/><rect x={2} y={6} width={20} height={2} rx={1} fill={color} opacity={.65}/><rect x={2} y={2} width={20} height={2} rx={1} fill={color}/><line x1={7} y1={0} x2={7} y2={14} stroke={color} strokeWidth={1} opacity={.3}/><line x1={13} y1={0} x2={13} y2={14} stroke={color} strokeWidth={1} opacity={.3}/></>,
    activity:   <><polygon points="12,1 15,9 23,9 17,14 19,22 12,17 5,22 7,14 1,9 9,9" fill={color} opacity={.9}/></>,
    villages:   <><rect x={4} y={10} width={6} height={4} rx={.5} fill={color} opacity={.6}/><rect x={14} y={8} width={6} height={6} rx={.5} fill={color} opacity={.6}/><polygon points="7,10 4,10 7,5 10,10" fill={color}/><polygon points="17,8 14,8 17,2 20,8" fill={color}/></>,
    transition: <><polyline points="2,16 7,10 12,13 17,5 22,8" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"/><circle cx={22} cy={8} r={1.5} fill={color}/></>,
    lulc:       <><rect x={2} y={2} width={20} height={20} rx={2} fill="none" stroke={color} strokeWidth={1.2} opacity={.5}/><rect x={2} y={8} width={20} height={1} fill={color} opacity={.3}/><rect x={2} y={14} width={20} height={1} fill={color} opacity={.3}/><rect x={8} y={2} width={1} height={20} fill={color} opacity={.3}/><rect x={14} y={2} width={1} height={20} fill={color} opacity={.3}/></>,
    dams:       <><path d="M4 20 Q12 8 20 20" fill="none" stroke={color} strokeWidth={1.8}/><line x1={2} y1={20} x2={22} y2={20} stroke={color} strokeWidth={1.5}/><path d="M10 14 Q12 10 14 14" fill={color} opacity={.4}/></>,
    buffer:     <><circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray="3 2"/><circle cx={12} cy={12} r={5} fill="none" stroke={color} strokeWidth={1.4} opacity={.6}/><circle cx={12} cy={12} r={2} fill={color}/></>,
    hotspot:    <><path d="M12 2 C8 6 6 9 9 12 C7 12 6 15 8 17 C7 18 7 20 10 21 C10 19 11 18 13 18 C15 18 17 16 16 14 C18 14 19 11 17 9 C16 12 14 12 14 10 C14 7 13 4 12 2Z" fill={color} opacity={.85}/></>,
    routes:     <><line x1={3} y1={18} x2={9} y2={12} stroke={color} strokeWidth={1.6} strokeLinecap="round"/><line x1={9} y1={12} x2={15} y2={15} stroke={color} strokeWidth={1.6} strokeLinecap="round"/><line x1={15} y1={15} x2={21} y2={6} stroke={color} strokeWidth={1.6} strokeLinecap="round"/><circle cx={3}  cy={18} r={1.5} fill={color}/><circle cx={21} cy={6}  r={1.5} fill={color}/><circle cx={9}  cy={12} r={1.2} fill={color} opacity={.5}/><circle cx={15} cy={15} r={1.2} fill={color} opacity={.5}/></>,
    close:      <><line x1={4} y1={4} x2={20} y2={20} stroke={color} strokeWidth={2} strokeLinecap="round"/><line x1={20} y1={4} x2={4} y2={20} stroke={color} strokeWidth={2} strokeLinecap="round"/></>,
    search:     <><circle cx={10} cy={10} r={7} fill="none" stroke={color} strokeWidth={1.8}/><line x1={15} y1={15} x2={21} y2={21} stroke={color} strokeWidth={1.8} strokeLinecap="round"/></>,
    chevdown:   <><polyline points="5,8 12,15 19,8" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></>,
    lock:       <><rect x={5} y={11} width={14} height={10} rx={2} fill={color} opacity={.7}/><path d="M8 11 V7 A4 4 0 0 1 16 7 V11" fill="none" stroke={color} strokeWidth={1.8}/></>,
    map:        <><polygon points="1,4 8,2 16,6 23,3 23,20 16,22 8,18 1,21" fill="none" stroke={color} strokeWidth={1.5} opacity={.8}/><line x1={8} y1={2} x2={8} y2={18} stroke={color} strokeWidth={1} opacity={.4}/><line x1={16} y1={6} x2={16} y2={22} stroke={color} strokeWidth={1} opacity={.4}/></>,
    layers:     <><polygon points="12,2 22,8 12,14 2,8" fill="none" stroke={color} strokeWidth={1.5}/><polyline points="2,12 12,18 22,12" fill="none" stroke={color} strokeWidth={1.5} opacity={.6}/><polyline points="2,16 12,22 22,16" fill="none" stroke={color} strokeWidth={1.5} opacity={.35}/></>,
    drone:      <><circle cx={12} cy={12} r={3} fill={color}/><line x1={12} y1={9} x2={12} y2={4} stroke={color} strokeWidth={1.4}/><line x1={12} y1={15} x2={12} y2={20} stroke={color} strokeWidth={1.4}/><line x1={9} y1={12} x2={4} y2={12} stroke={color} strokeWidth={1.4}/><line x1={15} y1={12} x2={20} y2={12} stroke={color} strokeWidth={1.4}/><circle cx={12} cy={4}  r={2} fill={color} opacity={.6}/><circle cx={12} cy={20} r={2} fill={color} opacity={.6}/><circle cx={4}  cy={12} r={2} fill={color} opacity={.6}/><circle cx={20} cy={12} r={2} fill={color} opacity={.6}/></>,
    signal:     <><path d="M2 10 Q12 2 22 10" fill="none" stroke={color} strokeWidth={1.5} opacity={.35}/><path d="M5 14 Q12 7 19 14" fill="none" stroke={color} strokeWidth={1.5} opacity={.6}/><path d="M8 18 Q12 13 16 18" fill="none" stroke={color} strokeWidth={1.5} opacity={.85}/><circle cx={12} cy={20} r={1.5} fill={color}/></>,
  }
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
         style={{ display:'inline-block', flexShrink:0, verticalAlign:'middle' }}>
      {paths[name] || paths.map}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PIE / DONUT CHART  (NWRA-style with legend, hover tooltips, centre label)
// ─────────────────────────────────────────────────────────────────────────────
function PieChart({ data, title = 'ACT' }) {
  const [hov, setHov] = useState(null)
  if (!data.length) return <div style={{color:'rgba(255,255,255,0.25)',fontSize:11,textAlign:'center',padding:8}}>Awaiting data…</div>

  const grouped = {}
  data.forEach(d => {
    const k = (d.Activity || d.activity || 'Other').trim()
    grouped[k] = (grouped[k] || 0) + (parseFloat(d.Frequency) || 1)
  })
  const entries = Object.entries(grouped).sort((a,b) => b[1]-a[1])
  const total   = entries.reduce((s,[,v]) => s+v, 0)
  const cols    = [INTEL_BLUE, SAFE_GREEN, THREAT_AMBER, THREAT_RED, NIGHT_VIOLET, '#00b4d8', '#f4d35e', '#ee6c4d', '#98ff00', '#fd7912']

  const R = 48, r = 28   // outer / inner radius → donut
  let angle = -Math.PI / 2
  const slices = entries.map(([label, val], i) => {
    const sweep = (val / total) * 2 * Math.PI
    const x1 = Math.cos(angle)*R, y1 = Math.sin(angle)*R
    const xi1 = Math.cos(angle)*r, yi1 = Math.sin(angle)*r
    angle += sweep
    const x2 = Math.cos(angle)*R, y2 = Math.sin(angle)*R
    const xi2 = Math.cos(angle)*r, yi2 = Math.sin(angle)*r
    const big = sweep > Math.PI ? 1 : 0
    return {
      path: `M${xi1.toFixed(2)},${yi1.toFixed(2)} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${big},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${r},${r} 0 ${big},0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z`,
      color: cols[i % cols.length], label,
      val, pct: ((val/total)*100).toFixed(1)
    }
  })

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
        <svg width={110} height={110} viewBox="-56,-56,112,112" style={{ overflow:'visible' }}>
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color}
              stroke="#060c16" strokeWidth={hov===i ? 0 : 2}
              opacity={hov === null || hov === i ? 1 : 0.45}
              transform={hov===i ? `scale(1.06)` : ''}
              style={{ transition:'all .15s', cursor:'pointer' }}
              onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
              <title>{s.label}: {s.pct}%  ({s.val})</title>
            </path>
          ))}
          {/* Centre label */}
          <text x={0} y={-5} textAnchor="middle" fill="rgba(255,255,255,0.6)"
                fontSize={9} fontWeight="700" fontFamily="DM Mono,monospace">
            {hov !== null ? slices[hov].pct+'%' : title}
          </text>
          <text x={0} y={8} textAnchor="middle" fill="rgba(255,255,255,0.28)"
                fontSize={7} fontFamily="DM Sans">
            {hov !== null ? slices[hov].label.slice(0,10) : `n=${total}`}
          </text>
        </svg>
      </div>
      {/* Legend rows */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 8px' }}>
        {slices.map((s,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:5, cursor:'default' }}
               onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
            <div style={{ width:8, height:8, borderRadius:2, background:s.color, flexShrink:0,
                          boxShadow: hov===i ? `0 0 6px ${s.color}` : 'none' }}/>
            <div style={{ fontSize:9, color: hov===i ? '#fff' : 'rgba(255,255,255,0.4)',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, transition:'color .1s' }}>
              {s.label}
            </div>
            <div style={{ fontSize:9, color:s.color, fontWeight:700, flexShrink:0 }}>{s.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BAR / SCATTER / LINE / BOX CHART  (NWRA-style, axes + hover values)
// ─────────────────────────────────────────────────────────────────────────────
function FieldChart({ data, type }) {
  const [hov, setHov] = useState(null)
  if (!data.length) return <div style={{color:'rgba(255,255,255,0.25)',fontSize:11,textAlign:'center',padding:8}}>Awaiting data…</div>

  const cols = [INTEL_BLUE, SAFE_GREEN, THREAT_AMBER, THREAT_RED, NIGHT_VIOLET, DAM_CYAN, '#f4d35e', '#ee6c4d', '#98ff00', '#fd7912']
  const pts  = data.slice(0, 14)
  const vals = pts.map(d => parseFloat(d.Frequency) || 0)
  const max  = Math.max(...vals, 1)
  const W = 248, H = 100, pL = 26, pB = 16, iH = H - pB

  // ── BOX PLOT ──────────────────────────────────────────────────────────────
  if (type === 'box') {
    const sorted = [...vals].sort((a,b)=>a-b)
    const q1  = sorted[Math.floor(sorted.length*0.25)]
    const med = sorted[Math.floor(sorted.length*0.5)]
    const q3  = sorted[Math.floor(sorted.length*0.75)]
    const lo  = sorted[0], hi = sorted[sorted.length-1]
    const sc  = v => H - pB - ((v/max)*iH)
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:'visible' }}>
        {/* Y-axis */}
        <line x1={pL} y1={0} x2={pL} y2={H-pB} stroke="rgba(255,255,255,0.08)" strokeWidth={.5}/>
        <line x1={pL} y1={H-pB} x2={W} y2={H-pB} stroke="rgba(255,255,255,0.08)" strokeWidth={.5}/>
        {[0,0.25,0.5,0.75,1].map(f=>(
          <text key={f} x={pL-3} y={sc(max*f)+3} textAnchor="end"
                fill="rgba(255,255,255,0.2)" fontSize={7}>{Math.round(max*f)}</text>
        ))}
        {/* Whisker */}
        <line x1={W/2} y1={sc(hi)} x2={W/2} y2={sc(lo)} stroke={INTEL_BLUE} strokeWidth={1.5}/>
        <line x1={W/2-15} y1={sc(hi)} x2={W/2+15} y2={sc(hi)} stroke={INTEL_BLUE} strokeWidth={1.5}/>
        <line x1={W/2-15} y1={sc(lo)} x2={W/2+15} y2={sc(lo)} stroke={INTEL_BLUE} strokeWidth={1.5}/>
        {/* IQR box */}
        <rect x={W/2-22} y={sc(q3)} width={44} height={sc(q1)-sc(q3)}
              fill={`${INTEL_BLUE}30`} stroke={INTEL_BLUE} strokeWidth={1.5}/>
        {/* Median */}
        <line x1={W/2-22} y1={sc(med)} x2={W/2+22} y2={sc(med)} stroke={SAFE_GREEN} strokeWidth={2}/>
        {/* Labels */}
        <text x={W/2} y={H} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={8}>
          Q1:{q1.toFixed(1)}  Med:{med.toFixed(1)}  Q3:{q3.toFixed(1)}
        </text>
      </svg>
    )
  }

  // ── LINE / SCATTER ────────────────────────────────────────────────────────
  if (type === 'line' || type === 'scatter') {
    const iW = (W - pL) / (pts.length - 1 || 1)
    const points = pts.map((d,i) => ({
      x: pL + i*iW,
      y: H - pB - ((parseFloat(d.Frequency)||0)/max)*iH,
      v: parseFloat(d.Frequency)||0,
      label: d.Field || ''
    }))
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:'visible' }}>
        {/* Grid lines */}
        {[0.25,0.5,0.75,1].map(f=>(
          <line key={f} x1={pL} y1={H-pB-f*iH} x2={W} y2={H-pB-f*iH}
                stroke="rgba(255,255,255,0.05)" strokeWidth={.5}/>
        ))}
        <line x1={pL} y1={0} x2={pL} y2={H-pB} stroke="rgba(255,255,255,0.1)" strokeWidth={.5}/>
        <line x1={pL} y1={H-pB} x2={W} y2={H-pB} stroke="rgba(255,255,255,0.1)" strokeWidth={.5}/>
        {/* Y labels */}
        {[0,0.5,1].map(f=>(
          <text key={f} x={pL-3} y={H-pB-f*iH+3} textAnchor="end"
                fill="rgba(255,255,255,0.2)" fontSize={7}>{Math.round(max*f)}</text>
        ))}
        {/* Line */}
        {type==='line' && (
          <>
            <polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')}
              fill="none" stroke={INTEL_BLUE} strokeWidth={1.5} strokeLinejoin="round"
              strokeOpacity={0.7}/>
            {/* Area fill */}
            <polyline
              points={`${points[0].x},${H-pB} `+points.map(p=>`${p.x},${p.y}`).join(' ')+` ${points[points.length-1].x},${H-pB}`}
              fill={`${INTEL_BLUE}22`} stroke="none"/>
          </>
        )}
        {/* Dots */}
        {points.map((p,i) => (
          <g key={i} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)} style={{cursor:'pointer'}}>
            <circle cx={p.x} cy={p.y} r={type==='scatter'?5:3.5}
              fill={cols[i%cols.length]} stroke="#060c16" strokeWidth={1}
              opacity={hov===null||hov===i?1:0.4}/>
            {hov===i && (
              <text x={p.x} y={p.y-8} textAnchor="middle"
                    fill="#fff" fontSize={8} fontWeight="600">{p.v}</text>
            )}
          </g>
        ))}
        {/* X labels */}
        {points.map((p,i) => (
          <text key={i} x={p.x} y={H} textAnchor="middle"
            fill="rgba(255,255,255,0.22)" fontSize={7}>{p.label?.slice(0,4)}</text>
        ))}
      </svg>
    )
  }

  // ── BAR ───────────────────────────────────────────────────────────────────
  return (
    <div className="bar-wrap">
      <div className="axis-line"/>
      {pts.map((d, i) => {
        const v = parseFloat(d.Frequency) || 0
        const h = Math.max(4, (v / max) * 94)
        return (
          <div key={i} className="bar-col"
               onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
               title={`${d.Field}: ${v}`} style={{ cursor:'pointer' }}>
            <div style={{ fontSize:8, color:'#fff', marginBottom:2, opacity: hov===i?1:0, transition:'opacity .1s', textAlign:'center' }}>
              {v}
            </div>
            <div className="bar-fill" style={{
              height: h,
              background: cols[i % cols.length],
              opacity: hov===null||hov===i ? 1 : 0.45,
              boxShadow: hov===i ? `0 0 8px ${cols[i%cols.length]}99` : 'none',
              transition:'all .15s'
            }}/>
            <div className="bar-lbl">{d.Field}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAFLET MAP
// ─────────────────────────────────────────────────────────────────────────────
function MapView({
  activeLayer, activeLayers, farmData, activityData, actFilter, dnFilter,
  villageData, damData, routeData,
  lulcVisible, lulcOpacity,
  bufferPoint, bufferRadius, routeOpacity,
  selectedFarm, selectedField, selectedVillage,
  hotspotFieldIDs, hotspotAllGeoJSON, hotspotOpacity,
  basemap, mapRef, onMapClick, setPopup
}) {
  // helper: is a layer currently toggled on?
  const isOn = (id) => activeLayers ? activeLayers.has(id) : activeLayer === id
  const containerRef  = useRef(null)
  const mapObjRef     = useRef(null)
  const baseTileRef   = useRef(null)
  const onMapClickRef = useRef(onMapClick)
  const lyrsRef       = useRef({ farms:{}, activities:[], villages:[], dams:[], lulc:{}, routes:null, buffer:null, bufPin:null, myLocation:null, myAccuracy:null })

  // Keep the click handler ref fresh so the map click listener is never stale
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])

  // ── init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapObjRef.current) return
    const map = L.map(containerRef.current, {
      center: [-16.38205, 34.89256], zoom: 13,
      zoomControl: false, preferCanvas: true
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const cfg = BASE_MAPS['Google Hybrid']
    baseTileRef.current = L.tileLayer(cfg.url, {
      subdomains: cfg.sub, maxZoom: cfg.maxZoom, attribution: '© Google'
    }).addTo(map)

    map.on('click', e => onMapClickRef.current && onMapClickRef.current(e.latlng))
    map.on('mousemove', e => {
      const el = document.getElementById('coord-bar')
      if (el) el.textContent = `${e.latlng.lat.toFixed(6)},  ${e.latlng.lng.toFixed(6)}`
    })

    mapObjRef.current = map
    mapRef.current    = map
    return () => { map.remove(); mapObjRef.current = null }
  }, [])

  

  // ── live GPS location ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current
    if (!map || !navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const accuracy = position.coords.accuracy

        if (lyrsRef.current.myLocation) map.removeLayer(lyrsRef.current.myLocation)
        if (lyrsRef.current.myAccuracy) map.removeLayer(lyrsRef.current.myAccuracy)

        const gpsIcon = L.divIcon({
          html: `<div style="width:14px;height:14px;background:#2196f3;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px #2196f3"></div>`,
          iconSize:[14,14],
          iconAnchor:[7,7],
          className:''
        })

        lyrsRef.current.myLocation = L.marker([lat, lng], { icon:gpsIcon }).addTo(map)

        lyrsRef.current.myAccuracy = L.circle([lat, lng], {
          radius: accuracy,
          color:'#2196f3',
          fillColor:'#2196f3',
          fillOpacity:0.15,
          weight:1
        }).addTo(map)

        if (!window.__gpsCentered) {
          map.setView([lat, lng], 17)
          window.__gpsCentered = true
        }
      },
      (err) => console.error('GPS Error:', err),
      { enableHighAccuracy:true, maximumAge:0, timeout:10000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])
// ── basemap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    if (baseTileRef.current) map.removeLayer(baseTileRef.current)
    const cfg = BASE_MAPS[basemap] || BASE_MAPS['Google Hybrid']
    baseTileRef.current = L.tileLayer(cfg.url, {
      subdomains: cfg.sub, maxZoom: cfg.maxZoom, attribution: '© Google'
    }).addTo(map)
    baseTileRef.current.bringToBack()
  }, [basemap])

  // ── helper: clear layer group ─────────────────────────────────────────────
  const clearGroup = useCallback((key) => {
    const map = mapObjRef.current; if (!map) return
    const grp = lyrsRef.current[key]
    if (!grp) return
    if (Array.isArray(grp)) grp.forEach(l => l && map.removeLayer(l))
    else if (typeof grp === 'object' && !grp._leaflet_id) Object.values(grp).forEach(l => l && map.removeLayer(l))
    else map.removeLayer(grp)
    lyrsRef.current[key] = Array.isArray(grp) ? [] : {}
  }, [])

  // ── farm fields ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    clearGroup('farms')
    if (!isOn('Fields') || !farmData.length) return

    farmData.forEach(({ name, geojson }) => {
      const color = FARM_COLORS[name] || INTEL_BLUE
      const layer = L.geoJSON(geojson, {
        style: feat => {
          const p    = feat.properties || {}
          const fid  = p.ID || p.id || ''
          const isSelected = selectedField && selectedFarm === name && String(fid) === String(selectedField)
          return {
            color:       isSelected ? '#ffffff' : color,
            weight:      isSelected ? 2.5        : 1.5,
            fillColor:   isSelected ? '#ffffff'  : color,
            fillOpacity: isSelected ? 0.45       : (selectedField && selectedFarm === name ? 0.06 : 0.18),
            opacity:     isSelected ? 1          : (selectedField && selectedFarm === name ? 0.35 : 0.9),
          }
        },
        onEachFeature: (feat, lyr) => {
          const p   = feat.properties || {}
          const info = { type:'field', name, id: p.ID || p.id || '—', area: p['Area (ha)'] || p.area || p.AREA || '—' }
          lyr.on('click',     () => setPopup(info))
          lyr.on('mouseover', () => setPopup(info))
        }
      }).addTo(map)
      lyrsRef.current.farms[name] = layer
    })

    // If a specific field is selected, zoom to it
    if (selectedField && selectedFarm) {
      let zoomed = false
      const farmLayer = lyrsRef.current.farms[selectedFarm]
      if (farmLayer) {
        farmLayer.eachLayer(lyr => {
          if (zoomed) return
          const p   = lyr.feature?.properties || {}
          const fid = p.ID || p.id || ''
          if (String(fid) === String(selectedField)) {
            try { map.fitBounds(lyr.getBounds(), { padding:[60,60], maxZoom:18 }); zoomed = true } catch(_) {}
          }
        })
      }
    } else {
      // fit to all loaded farms
      try {
        const all = L.featureGroup(Object.values(lyrsRef.current.farms))
        if (all.getBounds().isValid()) map.fitBounds(all.getBounds(), { padding:[30,30] })
      } catch(_) {}
    }
  }, [farmData, activeLayer, activeLayers, selectedField, selectedFarm])

  // ── activity markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    clearGroup('activities')
    if (!isOn('Activity')) return

    const filtered = activityData.filter(row => {
      const tOk = actFilter === 'Select All' || (row.Activity || '').trim() === actFilter
      const dOk = dnFilter  === 'All'        || (row['Day/Night'] || '').toLowerCase() === dnFilter.toLowerCase()
      return tOk && dOk
    })

    const markers = filtered.map(row => {
      const e = parseFloat(row.Eastings), n = parseFloat(row.Northings)
      if (isNaN(e) || isNaN(n)) return null
      const [lat, lon] = utm36sToLatLon(e, n)
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

      const isNight = (row['Day/Night'] || '').toLowerCase().includes('night')
      const col     = isNight ? NIGHT_VIOLET : THREAT_AMBER
      const border  = isNight ? '#c4b5fd'    : '#fde68a'

      const icon = L.divIcon({
        html: `<div style="width:10px;height:10px;background:${col};border:2px solid ${border};border-radius:50%;box-shadow:0 0 7px ${col}88"></div>`,
        iconSize: [10,10], className: ''
      })

      const m = L.marker([lat, lon], { icon }).addTo(map)
      const fields = ['Farm','Field','Eastings','Northings','Crop/Feature','Crop Age','Activity','Date','Time','Day/Night','Frequency','Rate']
      m.on('click', () => setPopup({
        type: 'activity',
        data: fields.map(f => ({ key:f, val: row[f] || '—' }))
      }))
      return m
    }).filter(Boolean)

    lyrsRef.current.activities = markers
  }, [activityData, actFilter, dnFilter, activeLayer, activeLayers])

  // ── villages ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    clearGroup('villages')
    if (!isOn('Villages') || !villageData?.features) return

    const markers = villageData.features.map(f => {
      const p    = f.properties || {}
      const geom = f.geometry
      let lat, lon

      if (geom?.type === 'Point' && geom.coordinates) {
        ;[lon, lat] = geom.coordinates
      } else {
        const e = parseFloat(p.UTMEAST), n = parseFloat(p.UTMNORTH)
        if (isNaN(e) || isNaN(n)) return null
        ;[lat, lon] = utm36sToLatLon(e, n)
      }
      if (!lat || !lon || lat < -90 || lat > 90) return null

      const name       = p.NAME || ''
      const isSelected = selectedVillage && name === selectedVillage

      const icon = isSelected
        ? L.divIcon({
            html: `<div style="
              width:18px;height:18px;
              background:${THREAT_AMBER};
              border:2px solid #fff;
              border-radius:2px;
              transform:rotate(45deg);
              box-shadow:0 0 12px ${THREAT_AMBER},0 0 4px #fff;
            "></div>`,
            iconSize: [18,18], iconAnchor: [9,9], className: ''
          })
        : L.divIcon({
            html: `<div style="
              width:11px;height:11px;
              background:${SAFE_GREEN};
              border:2px solid #fff;
              border-radius:1px;
              transform:rotate(45deg);
              box-shadow:0 0 6px ${SAFE_GREEN}88;
            "></div>`,
            iconSize: [11,11], iconAnchor: [5,5], className: ''
          })

      const m = L.marker([lat, lon], { icon }).addTo(map)
      m.on('click', () => setPopup({
        type: 'village',
        data: [
          { key:'Name',     val: p.NAME     || '—' },
          { key:'TA',       val: p.TANAME   || '—' },
          { key:'District', val: p.DISTRICT || '—' },
          { key:'Easting',  val: p.UTMEAST  || '—' },
          { key:'Northing', val: p.UTMNORTH || '—' },
        ]
      }))
      // store lat/lon on marker for zoom-to
      m._villageName = name
      m._latlng_raw  = [lat, lon]
      return m
    }).filter(Boolean)

    lyrsRef.current.villages = markers

    // Zoom to selected village if one is chosen, otherwise fit all
    if (selectedVillage) {
      const target = markers.find(m => m._villageName === selectedVillage)
      if (target) {
        map.setView(target.getLatLng(), 15, { animate: true })
        target.openPopup?.()
      }
    } else if (markers.length) {
      try {
        const g = L.featureGroup(markers)
        if (g.getBounds().isValid()) map.fitBounds(g.getBounds(), { padding:[50,50] })
      } catch(_) {}
    }
  }, [villageData, activeLayer, activeLayers, selectedVillage])

  // ── dams ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    clearGroup('dams')
    if (!isOn('Dams-Pumps') || !damData?.features) return

    const markers = damData.features.map(f => {
      const geom = f.geometry
      const p    = f.properties || {}
      let lat, lon

      if (!geom) return null
      if (geom.type === 'Point') {
        ;[lon, lat] = geom.coordinates
      } else if (geom.type === 'Polygon') {
        // use centroid of first ring
        const ring = geom.coordinates[0]
        lon = ring.reduce((s, c) => s + c[0], 0) / ring.length
        lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
      } else if (geom.type === 'MultiPolygon') {
        const ring = geom.coordinates[0][0]
        lon = ring.reduce((s, c) => s + c[0], 0) / ring.length
        lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
      } else return null

      // If coords look like UTM (large numbers), convert
      if (Math.abs(lat) > 90 || Math.abs(lon) > 360) {
        ;[lat, lon] = utm36sToLatLon(lon, lat)
      }
      if (!isFinite(lat) || !isFinite(lon)) return null

      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:${DAM_CYAN};border:2px solid #7de8ff;border-radius:50%;box-shadow:0 0 8px ${DAM_CYAN}99;display:flex;align-items:center;justify-content:center">
                 <div style="width:5px;height:5px;background:#fff;border-radius:50%"></div>
               </div>`,
        iconSize: [14,14], className: ''
      })

      const m = L.marker([lat, lon], { icon }).addTo(map)
      m.on('click', () => setPopup({
        type: 'dam',
        id:   p.ID || p.id || p.DAM_ID || p.Name || p.name || '—',
        name: p.Name || p.name || p.DAM_NAME || ''
      }))
      return m
    }).filter(Boolean)

    lyrsRef.current.dams = markers

    if (markers.length) {
      try {
        const g = L.featureGroup(markers)
        if (g.getBounds().isValid()) map.fitBounds(g.getBounds(), { padding:[40,40] })
      } catch(_) {}
    }
  }, [damData, activeLayer, activeLayers])

  // ── routes ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    if (lyrsRef.current.routes) { map.removeLayer(lyrsRef.current.routes); lyrsRef.current.routes = null }
    if (!isOn('Theft Routes') || !routeData) return

    lyrsRef.current.routes = L.geoJSON(routeData, {
      style: { color: THREAT_RED, weight: 2.5, dashArray: '8 4', opacity: routeOpacity ?? 0.92 }
    }).addTo(map)
  }, [routeData, activeLayer, activeLayers, routeOpacity])

  // ── LULC tiles ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    clearGroup('lulc')
    if (!isOn('LULC Maps')) return

    Object.entries(lulcVisible).forEach(([yr, vis]) => {
      if (!vis) return
      const l = L.tileLayer(LULC_TILES[yr], {
        opacity: lulcOpacity[yr] ?? 0.85, maxZoom: 18,
        attribution: 'Google Earth Engine-Hamza'
      }).addTo(map)
      lyrsRef.current.lulc[yr] = l
    })
  }, [lulcVisible, lulcOpacity, activeLayer, activeLayers])

  // ── hotspot field highlights ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    // clear old hotspot layers
    ;(lyrsRef.current.hotspots || []).forEach(l => map.removeLayer(l))
    lyrsRef.current.hotspots = []
    if (!isOn('Hotspot Fields') || !hotspotFieldIDs.size || !hotspotAllGeoJSON.length) return

    const opacity = hotspotOpacity ?? 0.55
    const layers = []

    hotspotAllGeoJSON.forEach(({ geojson, freq }) => {
      if (!geojson?.features) return
      geojson.features.forEach(feat => {
        const p   = feat.properties || {}
        const fid = String(p.ID || p.id || '')
        if (!hotspotFieldIDs.has(fid)) return

        const freqVal  = freq[fid] || 0
        const max      = Math.max(...Object.values(freq), 1)
        const ratio    = freqVal / max
        const fillCol  = ratio > 0.7 ? '#e63946' : ratio > 0.4 ? '#f4a261' : '#f4d35e'

        try {
          const lyr = L.geoJSON(feat, {
            style: {
              color:       '#e63946',
              weight:      2.5,
              fillColor:   fillCol,
              fillOpacity: opacity,
              opacity:     Math.min(1, opacity + 0.2),
              dashArray:   null,
            }
          }).addTo(map)

          lyr.on('click', () => setPopup({
            type:  'hotspot',
            fid,
            freq:  freqVal,
            ratio: (ratio * 100).toFixed(0)
          }))
          layers.push(lyr)
        } catch(_) {}
      })
    })

    lyrsRef.current.hotspots = layers
  }, [hotspotFieldIDs, hotspotAllGeoJSON, hotspotOpacity, activeLayer, activeLayers])

  // ── buffer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapObjRef.current; if (!map) return
    if (lyrsRef.current.buffer) { map.removeLayer(lyrsRef.current.buffer); lyrsRef.current.buffer = null }
    if (lyrsRef.current.bufPin) { map.removeLayer(lyrsRef.current.bufPin); lyrsRef.current.bufPin = null }
    if (!isOn('Buffer Distance') || !bufferPoint) return

    // Buffer ring
    lyrsRef.current.buffer = L.circle(
      [bufferPoint.lat, bufferPoint.lng],
      {
        radius:      bufferRadius,
        color:       THREAT_AMBER,
        fillColor:   THREAT_AMBER,
        fillOpacity: 0.08,
        weight:      2,
        dashArray:   '6 4'
      }
    ).addTo(map)

    // Centre pin
    const pinIcon = L.divIcon({
      html: `<div style="width:12px;height:12px;background:${THREAT_RED};border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px ${THREAT_RED}"></div>`,
      iconSize: [12,12], iconAnchor: [6,6], className: ''
    })
    lyrsRef.current.bufPin = L.marker([bufferPoint.lat, bufferPoint.lng], { icon: pinIcon }).addTo(map)

    setPopup({
      type:   'buffer',
      radius: bufferRadius,
      lat:    bufferPoint.lat.toFixed(6),
      lng:    bufferPoint.lng.toFixed(6)
    })
  }, [bufferPoint, bufferRadius, activeLayer, activeLayers])

  // clear buffer when leaving layer
  useEffect(() => {
    if (isOn('Buffer Distance')) return
    const map = mapObjRef.current; if (!map) return
    if (lyrsRef.current.buffer) { map.removeLayer(lyrsRef.current.buffer); lyrsRef.current.buffer = null }
    if (lyrsRef.current.bufPin) { map.removeLayer(lyrsRef.current.bufPin); lyrsRef.current.bufPin = null }
  }, [activeLayer])

  return <div ref={containerRef} style={{ width:'100%', height:'100%' }} />
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATE SEARCH
// ─────────────────────────────────────────────────────────────────────────────
function CoordSearch({ mapRef, showToast }) {
  const isMobile = useIsMobile()
  const [open, setOpen]     = useState(false)
  const [val, setVal]       = useState('')
  const markerRef           = useRef(null)

  const go = () => {
    const parts = val.trim().split(/[\s,]+/)
    if (parts.length < 2) { showToast('Enter: lat, lon  e.g. -16.30, 34.91'); return }
    const lat = parseFloat(parts[0]), lon = parseFloat(parts[1])
    if (isNaN(lat) || isNaN(lon)) { showToast('Invalid coordinates'); return }
    const map = mapRef.current; if (!map) return
    map.setView([lat, lon], 16)
    if (markerRef.current) map.removeLayer(markerRef.current)
    const icon = L.divIcon({
      html: `<div style="width:14px;height:14px;background:${THREAT_AMBER};border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px ${THREAT_AMBER}"></div>`,
      iconSize: [14,14], iconAnchor: [7,7], className: ''
    })
    markerRef.current = L.marker([lat, lon], { icon }).addTo(map)
      .bindPopup(`${lat.toFixed(5)},  ${lon.toFixed(5)}`).openPopup()
    showToast(`Navigated  ${lat.toFixed(4)},  ${lon.toFixed(4)}`)
    setOpen(false); setVal('')
  }

  return (
    <div className="search-bar">
      {open ? (
        <div className="search-wrap fade-up">
          <Icon name="search" size={13} color="rgba(255,255,255,0.4)" />
          <input className="inp" style={{ width: isMobile ? 150 : 230, marginBottom:0, fontSize:11 }}
            placeholder={isMobile ? "lat, lon" : "lat, lon  — e.g. -16.30, 34.91"}
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && go()}
            autoFocus />
          <button className="btn btn-primary" style={{ width:'auto', padding:'0 12px', marginBottom:0 }} onClick={go}>Go</button>
          <button className="btn btn-ghost"   style={{ width:'auto', padding:'0 8px',  marginBottom:0 }} onClick={() => { setOpen(false); setVal('') }}>
            <Icon name="close" size={12} color="rgba(255,255,255,0.4)" />
          </button>
        </div>
      ) : (
        <button className="map-ctrl-btn" onClick={() => setOpen(true)}>
          <Icon name="search" size={12} color="#5ba4ff" /> &nbsp;{isMobile ? '' : 'Search Coords'}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP LEGEND OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
function MapLegend({ activeLayer, farmData, lulcVisible }) {
  const [open, setOpen] = useState(true)

  const items = []
  if (activeLayer === 'Fields' && farmData.length) {
    farmData.forEach(({ name }) => items.push({ color: FARM_COLORS[name] || INTEL_BLUE, label: name, shape:'rect' }))
  }
  if (activeLayer === 'Activity') {
    items.push({ color: THREAT_AMBER,  label: 'Day activity',   shape:'circle' })
    items.push({ color: NIGHT_VIOLET,  label: 'Night activity', shape:'circle' })
  }
  if (activeLayer === 'Villages')    items.push({ color: SAFE_GREEN,  label: 'Village point', shape:'diamond' })
  if (activeLayer === 'Dams-Pumps')  items.push({ color: DAM_CYAN,    label: 'Dam / Pump',    shape:'circle'  })
  if (activeLayer === 'Buffer Distance') {
    items.push({ color: THREAT_AMBER, label: 'Buffer zone',    shape:'circle' })
    items.push({ color: THREAT_RED,   label: 'Incident point', shape:'circle' })
  }
  if (activeLayer === 'Theft Routes') items.push({ color: THREAT_RED, label: 'Theft route', shape:'line' })
  if (activeLayer === 'LULC Maps') {
    Object.entries(lulcVisible).filter(([,v]) => v).forEach(([yr]) => items.push({ color: INTEL_BLUE, label:`LULC ${yr}`, shape:'rect' }))
    LULC_LEGEND.forEach(l => items.push({ ...l, shape:'rect' }))
  }
  if (activeLayer === 'Hotspot Fields') {
    items.push({ color: THREAT_RED,   label: 'High freq',   shape:'rect' })
    items.push({ color: THREAT_AMBER, label: 'Medium freq', shape:'rect' })
    items.push({ color: '#f4d35e',    label: 'Low freq',    shape:'rect' })
  }
  if (!items.length) return null

  return (
    <div className="legend-panel">
      <div className="legend-header" onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize:9, letterSpacing:2, color:'rgba(255,255,255,0.3)' }}>LEGEND</span>
        <Icon name="chevdown" size={10} color="rgba(255,255,255,0.3)" />
      </div>
      {open && (
        <div className="legend-body fade-up">
          {items.map((item, i) => (
            <div key={i} className="legend-row">
              {item.shape === 'circle'  && <div className="legend-swatch" style={{ background:item.color, borderRadius:'50%' }}/>}
              {item.shape === 'rect'    && <div className="legend-swatch" style={{ background:item.color }}/>}
              {item.shape === 'diamond' && <div className="legend-swatch" style={{ background:item.color, transform:'rotate(45deg)', borderRadius:1 }}/>}
              {item.shape === 'line'    && <div style={{ width:14, height:2, background:item.color, borderRadius:1, flexShrink:0 }}/>}
              <span className="legend-label">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BASEMAP SWITCHER
// ─────────────────────────────────────────────────────────────────────────────
function BasemapSwitcher({ current, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:'absolute', bottom:30, right:10, zIndex:900 }}>
      <button className="map-ctrl-btn" onClick={() => setOpen(o => !o)}>
        <Icon name="layers" size={12} color="#5ba4ff" /> &nbsp;{current}
      </button>
      {open && (
        <div className="basemap-menu fade-up">
          {Object.keys(BASE_MAPS).map(name => (
            <div key={name} className={`basemap-option${name === current ? ' active' : ''}`}
              onClick={() => { onChange(name); setOpen(false) }}>
              {name === current ? '▪ ' : '  '}{name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP POPUP
// ─────────────────────────────────────────────────────────────────────────────
function MapPopup({ popup, onClose }) {
  if (!popup) return null
  const titleMap = {
    field:    `Field  —  ${popup.name || ''}`,
    activity: 'Activity Record',
    village:  'Village Info',
    dam:      'Dam / Pump',
    buffer:   'Buffer Zone',
  }
  return (
    <div className="map-popup">
      <div className="map-popup-title">
        <span>{titleMap[popup.type] || 'Info'}</span>
        <button onClick={onClose}
          style={{ background:'none', border:'none', cursor:'pointer', padding:2, lineHeight:0 }}>
          <Icon name="close" size={12} color="rgba(255,255,255,0.4)" />
        </button>
      </div>

      {popup.type === 'field' && <>
        <div className="map-popup-row">
          <span className="map-popup-key">Field ID</span>
          <span className="map-popup-val" style={{ color:'#5ba4ff' }}>{popup.id}</span>
        </div>
        <div className="map-popup-row">
          <span className="map-popup-key">Area (ha)</span>
          <span className="map-popup-val" style={{ color:SAFE_GREEN }}>{popup.area}</span>
        </div>
      </>}

      {(popup.type === 'activity' || popup.type === 'village') && popup.data?.map(({ key, val }) => (
        <div key={key} className="map-popup-row">
          <span className="map-popup-key">{key}</span>
          <span className="map-popup-val">{val || '—'}</span>
        </div>
      ))}

      {popup.type === 'dam' && <>
        <div className="map-popup-row">
          <span className="map-popup-key">Dam ID</span>
          <span className="map-popup-val" style={{ color:DAM_CYAN }}>{popup.id}</span>
        </div>
        {popup.name && <div className="map-popup-row">
          <span className="map-popup-key">Name</span>
          <span className="map-popup-val">{popup.name}</span>
        </div>}
      </>}

      {popup.type === 'buffer' && <>
        <div className="map-popup-row">
          <span className="map-popup-key">Radius</span>
          <span className="map-popup-val" style={{ color:THREAT_AMBER }}>{popup.radius} m</span>
        </div>
        <div className="map-popup-row">
          <span className="map-popup-key">Latitude</span>
          <span className="map-popup-val" style={{ fontFamily:'DM Mono,monospace' }}>{popup.lat}</span>
        </div>
        <div className="map-popup-row">
          <span className="map-popup-key">Longitude</span>
          <span className="map-popup-val" style={{ fontFamily:'DM Mono,monospace' }}>{popup.lng}</span>
        </div>
      </>}
      {popup.type === 'hotspot' && <>
        <div className="map-popup-row"><span className="map-popup-key">Field ID</span><span className="map-popup-val" style={{ color:'#e63946' }}>{popup.fid}</span></div>
        <div className="map-popup-row"><span className="map-popup-key">Frequency</span><span className="map-popup-val" style={{ color:'#f4a261' }}>{popup.freq}</span></div>
        <div className="map-popup-row"><span className="map-popup-key">Heat</span><span className="map-popup-val">{popup.ratio}%</span></div>
      </>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PANELS
// ─────────────────────────────────────────────────────────────────────────────

function FieldsPanel({ farmData, setFarmData, showToast, selectedFarm, setSelectedFarm, selectedField, setSelectedField }) {
  const [sel,      setSel]      = useState('')
  const [dlFarm,   setDlFarm]   = useState('')
  const [showDl,   setShowDl]   = useState(false)
  const [pwd,      setPwd]      = useState('')
  const [pwdErr,   setPwdErr]   = useState(false)
  const [loading,  setLoading]  = useState(false)

  // Build list of field IDs for the currently loaded single farm
  const currentFarmData = farmData.find(f => f.name === selectedFarm)
  const fieldList = currentFarmData
    ? currentFarmData.geojson.features
        .map(f => f.properties?.ID || f.properties?.id || '')
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric:true }))
    : []

  const load = async (name) => {
    setSel(name); setLoading(true)
    setSelectedField('')
    try {
      if (name === 'Select All') {
        const all = await Promise.all(
          Object.entries(FARM_URLS).map(async ([n, url]) => {
            const r = await fetch(url); const g = await r.json()
            return { name: n, geojson: g }
          })
        )
        setFarmData(all)
        setSelectedFarm('')
        showToast('All 4 farms loaded on map')
      } else if (FARM_URLS[name]) {
        const r = await fetch(FARM_URLS[name]); const g = await r.json()
        setFarmData([{ name, geojson: g }])
        setSelectedFarm(name)
        showToast(`${name} loaded`)
      }
    } catch (e) { showToast('Failed to load — check network') }
    setLoading(false)
  }

  const doDownload = () => {
    if (pwd !== DL_PASS) { setPwdErr(true); return }
    const targets = dlFarm === 'All Farms' ? farmData : farmData.filter(f => f.name === dlFarm)
    if (!targets.length) { showToast('Load the farm first'); return }
    targets.forEach(({ name, geojson }) => {
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type:'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `${name.replace(' ','')}_Galanwra.geojson`; a.click()
    })
    showToast(`Download started: ${dlFarm}`)
    setShowDl(false); setPwd(''); setPwdErr(false)
  }

  return (<>
    <div className="card">
      <div className="card-title">Select Farm</div>
      <select className="sel" value={sel} onChange={e => load(e.target.value)}>
        <option value="">— Choose farm —</option>
        {Object.keys(FARM_URLS).map(n => <option key={n}>{n}</option>)}
        <option value="Select All">Select All</option>
      </select>
      {loading && <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(255,255,255,0.35)' }}><span className="spinner" /> Loading…</div>}
      {!loading && farmData.length > 0 && <div style={{ fontSize:10, color:SAFE_GREEN, marginTop:2 }}>{farmData.length} farm(s) displayed on map</div>}
    </div>

    {/* ── FIELD PICKER — only visible when a single farm is loaded ── */}
    {fieldList.length > 0 && (
      <div className="card" style={{ borderColor: selectedField ? `${INTEL_BLUE}88` : undefined }}>
        <div className="card-title" style={{ display:'flex', justifyContent:'space-between' }}>
          <span>Select Single Field</span>
          {selectedField && (
            <span style={{ color:THREAT_AMBER, fontFamily:'DM Mono,monospace', fontSize:9, letterSpacing:0.5 }}>
              FIELD {selectedField}
            </span>
          )}
        </div>
        <select className="sel" value={selectedField} onChange={e => setSelectedField(e.target.value)}>
          <option value="">— View all fields —</option>
          {fieldList.map(id => (
            <option key={id} value={String(id)}>Field {id}</option>
          ))}
        </select>
        {selectedField ? (
          <button className="btn btn-ghost" style={{ marginBottom:0, fontSize:10 }}
            onClick={() => setSelectedField('')}>
            Clear — show all fields
          </button>
        ) : (
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', marginTop:2 }}>
            {fieldList.length} fields available in {selectedFarm}
          </div>
        )}
      </div>
    )}

    <div className="card">
      <div className="card-title">Farm Colours</div>
      {Object.entries(FARM_COLORS).map(([n,c]) => (
        <div key={n} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
          <div style={{ width:10, height:10, borderRadius:2, background:c, flexShrink:0 }}/>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{n}</span>
        </div>
      ))}
    </div>

    <div className="card">
      <div className="card-title">
        <Icon name="lock" size={10} color="rgba(255,255,255,0.3)" />&nbsp; Restricted Download
      </div>
      <select className="sel" value={dlFarm} onChange={e => setDlFarm(e.target.value)}>
        <option value="">— Select farm —</option>
        {Object.keys(FARM_URLS).map(n => <option key={n}>{n}</option>)}
        <option value="All Farms">All Farms</option>
      </select>
      <button className="btn btn-primary" onClick={() => setShowDl(true)}>Request GeoJSON Download</button>
      {showDl && (
        <div style={{ marginTop:6 }} className="fade-up">
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginBottom:4 }}>Authorisation password:</div>
          <input type="password" className={`inp${pwdErr ? ' error' : ''}`}
            placeholder="Password…" value={pwd}
            onChange={e => { setPwd(e.target.value); setPwdErr(false) }}
            onKeyDown={e => e.key === 'Enter' && doDownload()} />
          {pwdErr && <div style={{ fontSize:10, color:THREAT_RED, marginBottom:4 }}>Incorrect password</div>}
          <div style={{ display:'flex', gap:6 }}>
            <button className="btn btn-confirm" style={{ marginBottom:0 }} onClick={doDownload}>Confirm</button>
            <button className="btn btn-danger"  style={{ marginBottom:0 }} onClick={() => { setShowDl(false); setPwd(''); setPwdErr(false) }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  </>)
}

function ActivityPanel({ activityData, setActivityData, pieData, setPieData, barData, setBarData, actFilter, setActFilter, dnFilter, setDnFilter }) {
  const [graphType, setGraphType] = useState('bar')
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(ACTIVITY_CSV).then(r => r.text()).then(parseCSV).catch(() => []),
      fetch(PIE_CSV).then(r => r.text()).then(parseCSV).catch(() => []),
      fetch(BAR_CSV).then(r => r.text()).then(parseCSV).catch(() => []),
    ]).then(([act, pie, bar]) => {
      setActivityData(act); setPieData(pie); setBarData(bar); setLoading(false)
    })
  }, [])

  const filtered = activityData.filter(d => {
    const tOk = actFilter === 'Select All' || (d.Activity || '').trim() === actFilter
    const dOk = dnFilter  === 'All'        || (d['Day/Night'] || '').toLowerCase() === dnFilter.toLowerCase()
    return tOk && dOk
  })

  return (<>
    <div className="card">
      <div className="card-title">Filter by Activity</div>
      <select className="sel" value={actFilter} onChange={e => setActFilter(e.target.value)}>
        {ACT_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <div>
        {[['All','blue'],['Day','amber'],['Night','violet']].map(([d,c]) => (
          <span key={d} className={`chip${dnFilter===d ? ` on-${c}` : ''}`} onClick={() => setDnFilter(d)}>{d}</span>
        ))}
      </div>
      {loading
        ? <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:4 }}><span className="spinner"/>Loading CSV…</div>
        : <div style={{ fontSize:10, color:'rgba(255,255,255,0.28)', marginTop:4 }}>{filtered.length} records shown on map</div>
      }
    </div>

    <div className="card">
      <div className="card-title">Activity Distribution</div>
      <PieChart data={pieData} />
    </div>

    <div className="card">
      <div className="card-title">Field vs Avg Head Count</div>
      <div style={{ marginBottom:6 }}>
        {['bar','scatter','line','box'].map(t => (
          <span key={t} className={`chip${graphType===t ? ' on-blue' : ''}`} onClick={() => setGraphType(t)}>
            {t === 'bar' ? 'Bar' : t === 'scatter' ? 'Scatter' : t === 'line' ? 'Line' : 'Box'}
          </span>
        ))}
      </div>
      <FieldChart data={barData} type={graphType} />
    </div>
  </>)
}

function VillagesPanel({ villageData, setVillageData, showToast, selectedVillage, setSelectedVillage }) {
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(VILLAGES_URL).then(r => r.json()).then(d => { setVillageData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const names    = (villageData?.features || []).map(f => f.properties?.NAME || 'Unknown')
  const filtered = names.filter(n => n.toLowerCase().includes(search.toLowerCase()))

  const handlePick = (name) => {
    setSelectedVillage(prev => prev === name ? '' : name)   // toggle — click again to deselect
    showToast(name === selectedVillage ? 'Selection cleared' : `Zooming to ${name}`)
  }

  return (<>
    <div className="card">
      <div className="card-title">Search Village</div>
      <input className="inp" placeholder="Village name…" value={search}
        onChange={e => { setSearch(e.target.value); setSelectedVillage('') }} />
      {loading
        ? <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(255,255,255,0.3)' }}><span className="spinner"/>Loading…</div>
        : <div style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>{filtered.length} / {names.length} villages</div>
      }
    </div>

    {selectedVillage && (
      <div className="card" style={{ borderColor:`${THREAT_AMBER}66`, background:`rgba(244,162,97,0.06)` }}>
        <div className="card-title" style={{ color:THREAT_AMBER }}>Selected Village</div>
        <div style={{ fontSize:12, fontWeight:600, color:'#dce8f5', marginBottom:4 }}>{selectedVillage}</div>
        <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:6 }}>
          Highlighted on map — amber marker
        </div>
        <button className="btn btn-ghost" style={{ marginBottom:0, fontSize:10 }}
          onClick={() => setSelectedVillage('')}>
          Clear highlight
        </button>
      </div>
    )}

    <div className="card">
      <div className="card-title">Village Directory</div>
      <div style={{ maxHeight:240, overflowY:'auto' }}>
        {filtered.map(n => {
          const isSelected = n === selectedVillage
          return (
            <div key={n} className="village-row"
              style={{ color: isSelected ? THREAT_AMBER : undefined, fontWeight: isSelected ? 600 : 400 }}
              onClick={() => handlePick(n)}>
              <div className="village-dot" style={{ background: isSelected ? THREAT_AMBER : undefined, transform:'rotate(45deg)', boxShadow: isSelected ? `0 0 6px ${THREAT_AMBER}` : undefined }}/>
              {n}
              {isSelected && (
                <span style={{ marginLeft:'auto', fontSize:9, color:THREAT_AMBER, letterSpacing:1 }}>SELECTED</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  </>)
}

function LulcPanel({ lulcVisible, setLulcVisible, lulcOpacity, setLulcOpacity }) {
  return (<>
    <div className="card">
      <div className="card-title">Toggle LULC Year</div>
      {['2005','2015','2025'].map(yr => (
        <div key={yr} style={{ marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <input type="checkbox" checked={!!lulcVisible[yr]}
              onChange={e => setLulcVisible(v => ({ ...v, [yr]:e.target.checked }))}
              style={{ accentColor:INTEL_BLUE }}/>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.65)', fontWeight:500 }}>{yr} LULC</span>
            <span style={{ marginLeft:'auto', fontSize:10, color:'rgba(255,255,255,0.3)', fontFamily:'DM Mono,monospace' }}>
              {Math.round((lulcOpacity[yr] ?? 0.85) * 100)}%
            </span>
          </div>
          {lulcVisible[yr] && (
            <input type="range" min={0} max={1} step={0.05}
              value={lulcOpacity[yr] ?? 0.85}
              onChange={e => setLulcOpacity(o => ({ ...o, [yr]:parseFloat(e.target.value) }))}
              style={{ width:'100%', accentColor:INTEL_BLUE }} />
          )}
        </div>
      ))}
    </div>
    <div className="card">
      <div className="card-title">Land Cover Classes</div>
      <div className="lulc-grid">
        {LULC_LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:10, height:10, borderRadius:1, background:color, flexShrink:0, border:'1px solid rgba(255,255,255,0.08)' }}/>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  </>)
}

function DamsPanel({ damData }) {
  return (
    <div className="card">
      <div className="card-title">Dams/Pumps</div>
      <div style={{ fontSize:11, color:'rgba(255,255,255,0.38)', lineHeight:1.8 }}>
        Dam markers are shown on the map.<br/>Click any marker to view its ID.
      </div>
      {damData && (
        <div style={{ fontSize:10, color:DAM_CYAN, marginTop:6 }}>
          {damData.features?.length || 0} features loaded
        </div>
      )}
      <div style={{ marginTop:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:DAM_CYAN, flexShrink:0 }}/>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>Dam / Pump location</span>
        </div>
      </div>
    </div>
  )
}

function BufferPanel({ bufferRadius, setBufferRadius, bufferPoint }) {
  return (<>
    <div className="card">
      <div className="card-title">Buffer Radius</div>
      {[500, 1000, 2000].map(r => (
        <button key={r}
          className={`btn ${bufferRadius === r ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setBufferRadius(r)}>
          {r >= 1000 ? `${r/1000} km` : `${r} m`} radius
        </button>
      ))}
    </div>
    <div className="card">
      <div className="card-title">How to Use</div>
      <div style={{ fontSize:11, color:'rgba(255,255,255,0.38)', lineHeight:1.9 }}>
        1. Select a radius above<br/>
        2. Switch to the Buffer Distance layer<br/>
        3. Click any incident location on the map<br/>
        4. The buffer ring appears instantly
      </div>
    </div>
    {bufferPoint && (
      <div className="card" style={{ borderColor:`${THREAT_AMBER}44` }}>
        <div className="card-title">Active Buffer</div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', lineHeight:1.9 }}>
          Radius: <span style={{ color:THREAT_AMBER, fontWeight:600 }}>{bufferRadius} m</span><br/>
          Lat: <span style={{ fontFamily:'DM Mono,monospace', color:'#dce8f5' }}>{bufferPoint.lat.toFixed(5)}</span><br/>
          Lng: <span style={{ fontFamily:'DM Mono,monospace', color:'#dce8f5' }}>{bufferPoint.lng.toFixed(5)}</span>
        </div>
      </div>
    )}
  </>)
}

function HotspotPanel({ hotspotOpacity, setHotspotOpacity, hotspotFieldIDs, allGeoLoaded }) {
  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showOnMap,  setShowOnMap]  = useState(true)

  useEffect(() => {
    fetch(WEEK_CSV).then(r => r.text()).then(t => {
      setData(parseCSV(t)); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const max    = Math.max(...data.map(d => parseFloat(d.Frequency) || 0), 1)
  const sorted = [...data].sort((a,b) => (parseFloat(b.Frequency)||0) - (parseFloat(a.Frequency)||0))

  return (<>
    {/* ── MAP HIGHLIGHT CARD ── */}
    <div className="card" style={{ borderColor:`${THREAT_RED}55` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div className="card-title" style={{ margin:0 }}>Map Field Highlights</div>
        <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
          <input type="checkbox" checked={showOnMap} onChange={e => setShowOnMap(e.target.checked)}
            style={{ accentColor:THREAT_RED, width:13, height:13 }}/>
          <span style={{ fontSize:9, color:showOnMap ? THREAT_RED : 'rgba(255,255,255,0.3)', fontWeight:600, letterSpacing:0.5 }}>
            {showOnMap ? 'ON' : 'OFF'}
          </span>
        </label>
      </div>

      {/* Status */}
      {!allGeoLoaded && (
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:THREAT_AMBER, marginBottom:8 }}>
          <span className="spinner" style={{ width:12, height:12, borderWidth:1.5 }}/>
          Loading farm geometries…
        </div>
      )}
      {allGeoLoaded && (
        <div style={{ fontSize:10, color:THREAT_RED, marginBottom:8 }}>
          <strong>{hotspotFieldIDs.size}</strong> hotspot fields highlighted in red on the map
        </div>
      )}

      {/* Opacity slider */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>Highlight Opacity</span>
        <span style={{ fontSize:10, fontWeight:600, color:THREAT_RED, fontFamily:'DM Mono,monospace' }}>
          {Math.round((hotspotOpacity ?? 0.55) * 100)}%
        </span>
      </div>
      <input type="range" min={0.05} max={1} step={0.05}
        value={hotspotOpacity ?? 0.55}
        onChange={e => setHotspotOpacity(parseFloat(e.target.value))}
        style={{ width:'100%', accentColor:THREAT_RED, marginBottom:6 }}
      />
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'rgba(255,255,255,0.22)' }}>
        <span>Faint</span><span>Solid</span>
      </div>

      {/* Colour key */}
      <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
        {[
          { col:'#e63946', label:'High (>70%)' },
          { col:'#f4a261', label:'Med (40-70%)' },
          { col:'#f4d35e', label:'Low (<40%)' },
        ].map(({col,label}) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:9, height:9, borderRadius:2, background:col, flexShrink:0 }}/>
            <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>

    {/* ── CHART ── */}
    <div className="card">
      <div className="card-title">Weekly Hotspot Chart</div>
      {loading
        ? <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(255,255,255,0.3)' }}><span className="spinner"/>Loading…</div>
        : (
          <div className="bar-wrap">
            <div className="axis-line"/>
            {data.map((d,i) => {
              const v     = parseFloat(d.Frequency) || 0
              const ratio = v / max
              const h     = Math.max(4, ratio * 94)
              const col   = ratio > 0.7 ? THREAT_RED : ratio > 0.4 ? THREAT_AMBER : '#f4d35e'
              return (
                <div key={i} className="bar-col" title={`${d.Field}: ${v}`}>
                  <div className="bar-fill" style={{ height:h, background:col, boxShadow: ratio>0.7 ? `0 0 6px ${col}88`:'' }}/>
                  <div className="bar-lbl">{d.Field}</div>
                </div>
              )
            })}
          </div>
        )
      }
    </div>

    {/* ── RANKED LIST ── */}
    <div className="card">
      <div className="card-title">Top Fields by Frequency</div>
      {sorted.slice(0,8).map((d,i) => {
        const v     = parseFloat(d.Frequency) || 0
        const ratio = v / max
        const col   = ratio > 0.7 ? THREAT_RED : ratio > 0.4 ? THREAT_AMBER : '#f4d35e'
        return (
          <div key={i} className="rank-row">
            <span className="rank-num">{i+1}</span>
            <div className="rank-bar-wrap">
              <div className="rank-bar-fill" style={{ width:`${ratio*100}%`, background:col }}/>
            </div>
            <span className="rank-name">{d.Field}</span>
            <span className="rank-val" style={{ color:col }}>{v}</span>
          </div>
        )
      })}
    </div>

    <div className="card" style={{ borderColor:`${THREAT_RED}33`, background:`${THREAT_RED}08` }}>
      <div style={{ fontSize:10, color:`${THREAT_RED}99`, lineHeight:1.7 }}>
        Updated weekly — refresh to reload latest data.
      </div>
    </div>
  </>)
}

function RoutesPanel({ routeData, routeOpacity, setRouteOpacity }) {
  return (
    <div className="card">
      {/* Title row with opacity slider to the right */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
        <div className="card-title" style={{ margin:0 }}>Theft Routes</div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)', whiteSpace:'nowrap' }}>
            Opacity {Math.round((routeOpacity ?? 0.92) * 100)}%
          </span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={routeOpacity ?? 0.92}
            onChange={e => setRouteOpacity(parseFloat(e.target.value))}
            style={{ width:72, accentColor: THREAT_RED, cursor:'pointer' }}
            title="Route transparency"
          />
        </div>
      </div>
      <div style={{ fontSize:11, color:'rgba(255,255,255,0.38)', lineHeight:1.9 }}>
        Mapped intruder routes are shown as red dashed lines on the map.<br/><br/>
        Routes captured via field intelligence and drone surveillance missions.
      </div>
      {routeData && (
        <div style={{ fontSize:10, color:THREAT_RED, marginTop:6 }}>
          {routeData.features?.length || 0} routes loaded
        </div>
      )}
      <div style={{ marginTop:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <div style={{ width:14, height:2, background:THREAT_RED, borderRadius:1, flexShrink:0 }}/>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>Theft / intrusion route</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile()
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)   // bottom panel sheet
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false) // layer list drawer
  const [activeLayer,  setActiveLayer]  = useState('Fields')
  const [activeLayers, setActiveLayers] = useState(() => new Set(['Fields']))
  const [farmData,     setFarmData]     = useState([])
  const [activityData, setActivityData] = useState([])
  const [actFilter,    setActFilter]    = useState('Select All')
  const [dnFilter,     setDnFilter]     = useState('All')
  const [pieData,      setPieData]      = useState([])
  const [barData,      setBarData]      = useState([])
  const [villageData,  setVillageData]  = useState(null)
  const [damData,      setDamData]      = useState(null)
  const [routeData,    setRouteData]    = useState(null)
  const [lulcVisible,  setLulcVisible]  = useState({ '2005':false, '2015':false, '2025':false })
  const [lulcOpacity,  setLulcOpacity]  = useState({ '2005':0.85,  '2015':0.85,  '2025':0.85  })
  const [bufferRadius, setBufferRadius] = useState(500)
  const [bufferPoint,  setBufferPoint]  = useState(null)
  const [routeOpacity, setRouteOpacity] = useState(0.92)
  const [hotspotOpacity,   setHotspotOpacity]   = useState(0.55)
  const [hotspotFieldIDs,  setHotspotFieldIDs]  = useState(new Set())
  const [hotspotAllGeoJSON,setHotspotAllGeoJSON] = useState([])
  const [hotspotGeoLoaded, setHotspotGeoLoaded] = useState(false)
  const [selectedFarm,    setSelectedFarm]    = useState('')
  const [selectedField,   setSelectedField]   = useState('')
  const [selectedVillage, setSelectedVillage] = useState('')
  const [basemap,      setBasemap]      = useState('Google Hybrid')
  const [popup,        setPopup]        = useState(null)
  const [toast,        setToast]        = useState(null)
  const [clock,        setClock]        = useState(() => new Date().toLocaleTimeString())
  const [loading,      setLoading]      = useState(true)
  const mapRef = useRef(null)

  // ── Splash / cover-page loading screen ──────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 2200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(t)
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg); setTimeout(() => setToast(null), 3400)
  }, [])

  // Lazy-load dams, routes when toggled on
  useEffect(() => {
    if ((activeLayer === 'Dams-Pumps'   || activeLayers.has('Dams-Pumps'))   && !damData)
      fetch(DAMS_URL).then(r => r.json()).then(setDamData).catch(() => {})
    if ((activeLayer === 'Theft Routes' || activeLayers.has('Theft Routes')) && !routeData)
      fetch(ROUTES_URL).then(r => r.json()).then(setRouteData).catch(() => {})
  }, [activeLayer, activeLayers])

  // Load hotspot field IDs from Week.csv + all farm geometries when Hotspot layer is active
  useEffect(() => {
    const isHotActive = activeLayer === 'Hotspot Fields' || activeLayers.has('Hotspot Fields')
    if (!isHotActive || hotspotGeoLoaded) return

    // 1. Fetch Week.csv to get field IDs
    fetch(WEEK_CSV)
      .then(r => r.text())
      .then(text => {
        const rows = parseCSV(text)
        const ids  = new Set(rows.map(r => String(r.Field || '').trim()).filter(Boolean))

        // build freq map: fieldID → frequency value
        const freqMap = {}
        rows.forEach(r => { freqMap[String(r.Field||'').trim()] = parseFloat(r.Frequency) || 0 })

        setHotspotFieldIDs(ids)

        // 2. Fetch all 4 farm GeoJSONs to locate those fields
        return Promise.all(
          Object.entries(FARM_URLS).map(([name, url]) =>
            fetch(url)
              .then(r => r.json())
              .then(geojson => ({ name, geojson, freq: freqMap }))
              .catch(() => null)
          )
        )
      })
      .then(results => {
        const valid = (results || []).filter(Boolean)
        setHotspotAllGeoJSON(valid)
        setHotspotGeoLoaded(true)
      })
      .catch(() => {})
  }, [activeLayer, activeLayers, hotspotGeoLoaded])

  // Toggle a layer's map visibility on/off
  const toggleLayerVisibility = (id) => {
    setActiveLayers(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const handleLayer = (id, external) => {
    if (external) {
      window.open('https://hamza-nkhumbwa.github.io/galanwra/Transiton.html', '_blank')
      showToast('Opening Transition Statistics…')
      return
    }
    // Clicking the label = switch active panel + ensure layer is visible on map
    setActiveLayer(id)
    setActiveLayers(prev => { const next = new Set(prev); next.add(id); return next })
    setPopup(null)
    if (isMobile) { setMobileDrawerOpen(false); setMobileSheetOpen(true) }
  }

  const renderPanel = () => {
    switch (activeLayer) {
      case 'Fields':       return <FieldsPanel farmData={farmData} setFarmData={setFarmData} showToast={showToast} selectedFarm={selectedFarm} setSelectedFarm={setSelectedFarm} selectedField={selectedField} setSelectedField={setSelectedField}/>
      case 'Activity':     return <ActivityPanel activityData={activityData} setActivityData={setActivityData} pieData={pieData} setPieData={setPieData} barData={barData} setBarData={setBarData} actFilter={actFilter} setActFilter={setActFilter} dnFilter={dnFilter} setDnFilter={setDnFilter}/>
      case 'Villages':     return <VillagesPanel villageData={villageData} setVillageData={setVillageData} showToast={showToast} selectedVillage={selectedVillage} setSelectedVillage={setSelectedVillage}/>
      case 'LULC Maps':    return <LulcPanel lulcVisible={lulcVisible} setLulcVisible={setLulcVisible} lulcOpacity={lulcOpacity} setLulcOpacity={setLulcOpacity}/>
      case 'Dams-Pumps':   return <DamsPanel damData={damData}/>
      case 'Buffer Distance': return <BufferPanel bufferRadius={bufferRadius} setBufferRadius={setBufferRadius} bufferPoint={bufferPoint}/>
      case 'Hotspot Fields':  return <HotspotPanel hotspotOpacity={hotspotOpacity} setHotspotOpacity={setHotspotOpacity} hotspotFieldIDs={hotspotFieldIDs} allGeoLoaded={hotspotGeoLoaded}/>
      case 'Theft Routes':    return <RoutesPanel routeData={routeData} routeOpacity={routeOpacity} setRouteOpacity={setRouteOpacity}/>
      default: return null
    }
  }

  // ── Splash / cover-page ────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        position:'fixed', inset:0, zIndex:9999,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:22, background:'#060e1c', overflow:'hidden'
      }}>
        <style>{`
          @keyframes splashPulse  { 0%,100%{ transform:scale(1); opacity:1 } 50%{ transform:scale(1.06); opacity:0.85 } }
          @keyframes splashGlow   { 0%,100%{ box-shadow:0 0 30px rgba(33,118,255,0.25), 0 0 8px rgba(33,118,255,0.15) } 50%{ box-shadow:0 0 55px rgba(33,118,255,0.45), 0 0 16px rgba(33,118,255,0.3) } }
          @keyframes splashSpin   { to{ transform:rotate(360deg) } }
          @keyframes splashScan   { 0%{ top:-10% } 100%{ top:110% } }
          @keyframes splashFadeIn { from{ opacity:0; transform:translateY(8px) } to{ opacity:1; transform:translateY(0) } }
        `}</style>

        {/* scanline sweep */}
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
          <div style={{
            position:'absolute', left:0, right:0, height:2,
            background:'linear-gradient(transparent,rgba(91,164,255,0.35),transparent)',
            animation:'splashScan 2.4s linear infinite'
          }}/>
        </div>

        {/* logo */}
        <div style={{
          width:120, height:120, borderRadius:'50%',
          display:'flex', alignItems:'center', justifyContent:'center',
          border:'1px solid rgba(33,118,255,0.35)',
          background:'rgba(255,255,255,0.03)',
          animation:'splashPulse 2.2s ease-in-out infinite, splashGlow 2.2s ease-in-out infinite'
        }}>
          <img
            src="https://hamza-nkhumbwa.github.io/galanwra/wwjdlogo.png"
            alt="WWJD Logo"
            onError={e => { e.target.style.display='none' }}
            style={{ width:84, height:84, objectFit:'contain' }}
          />
        </div>

        {/* wordmark */}
        <div style={{ textAlign:'center', animation:'splashFadeIn 0.5s ease 0.2s both' }}>
          <div style={{ fontSize:16, fontWeight:600, color:'#fff', letterSpacing:'-0.3px' }}>
            SpatialData <span style={{ color:'#2176ff' }}>GIS</span>
          </div>
          <div style={{ fontSize:10, color:'rgba(91,164,255,0.6)', letterSpacing:3, marginTop:4 }}>
            ALUMENDA INTELLIGENCE
          </div>
        </div>

        {/* spinner */}
        <div style={{
          width:30, height:30, borderRadius:'50%',
          border:'2px solid rgba(33,118,255,0.15)',
          borderTopColor:'#2176ff',
          animation:'splashSpin 0.8s linear infinite'
        }}/>

        {/* status row */}
        <div style={{ display:'flex', gap:8, animation:'splashFadeIn 0.5s ease 0.4s both' }}>
          {['MAP ENGINE','GEOSPATIAL DATA','SECURE LINK'].map((lbl,i) => (
            <div key={lbl} style={{
              fontSize:9, padding:'4px 9px', borderRadius:4, letterSpacing:1,
              background:'rgba(33,118,255,0.1)', border:'1px solid rgba(33,118,255,0.25)',
              color:'#5ba4ff', animation:`pulse ${1.4 + i*0.25}s infinite`
            }}>{lbl}</div>
          ))}
        </div>

        <div style={{ fontSize:9, color:'rgba(255,255,255,0.18)', letterSpacing:1, animation:'splashFadeIn 0.5s ease 0.5s both' }}>
          Hamza.N-Worldwide Joint Discoverers @2026· Illovo Sugar Ltd
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT — full-screen map, bottom sheet panel, layer drawer
  // ═══════════════════════════════════════════════════════════════════════
  if (isMobile) {
    const activeCfg = LAYERS.find(l => l.id === activeLayer)
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100dvh', overflow:'hidden', position:'relative' }}>

        {/* ── MOBILE TOPBAR ── */}
        <div style={{
          height: 54, background:'#060e1c', flexShrink:0,
          borderBottom:'1px solid rgba(33,118,255,0.18)',
          display:'flex', alignItems:'center', padding:'0 10px', gap:8,
          boxShadow:'0 1px 16px rgba(0,0,0,0.5)', zIndex:1200,
          paddingTop:'env(safe-area-inset-top)'
        }}>
          {/* Hamburger / layer drawer toggle */}
          <button
            onClick={() => setMobileDrawerOpen(o => !o)}
            style={{
              width:36, height:36, flexShrink:0, borderRadius:8,
              background: mobileDrawerOpen ? 'rgba(33,118,255,0.2)' : 'rgba(255,255,255,0.05)',
              border:'1px solid rgba(33,118,255,0.25)', display:'flex',
              alignItems:'center', justifyContent:'center', cursor:'pointer'
            }}>
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#5ba4ff" strokeWidth={2} strokeLinecap="round">
              {mobileDrawerOpen
                ? <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>
                : <><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></>
              }
            </svg>
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0, flex:1 }}>
            <div style={{
              width:26, height:26, borderRadius:6, flexShrink:0,
              background:'linear-gradient(135deg,#1a5fc8,#060e1c)',
              border:'1px solid rgba(33,118,255,0.4)',
              display:'flex', alignItems:'center', justifyContent:'center'
            }}>
              <Icon name="signal" size={13} color="#5ba4ff" />
            </div>
            <div style={{ minWidth:0, overflow:'hidden' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                SpatialData <span style={{ color:'#2176ff' }}>GIS</span>
              </div>
              <div style={{ fontSize:7.5, color:'rgba(91,164,255,0.6)', letterSpacing:1.2, whiteSpace:'nowrap' }}>ALUMENDA INTELLIGENCE</div>
            </div>
          </div>

          <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 6px #22c55e', animation:'pulse 2s infinite', flexShrink:0 }}/>

          <img
            src="https://hamza-nkhumbwa.github.io/galanwra/wwjdlogo.png"
            alt="WWJD"
            style={{ height:26, width:'auto', objectFit:'contain', flexShrink:0,
                     filter:'drop-shadow(0 0 5px rgba(33,118,255,0.4))' }}
          />
        </div>

        {/* ── FULL-SCREEN MAP ── */}
        <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
          <MapView
            activeLayer={activeLayer}
            farmData={farmData}
            activityData={activityData}
            actFilter={actFilter}
            dnFilter={dnFilter}
            villageData={villageData}
            damData={damData}
            routeData={routeData}
            lulcVisible={lulcVisible}
            lulcOpacity={lulcOpacity}
            bufferPoint={bufferPoint}
            bufferRadius={bufferRadius}
            routeOpacity={routeOpacity}
            activeLayers={activeLayers}
            selectedFarm={selectedFarm}
            selectedField={selectedField}
            selectedVillage={selectedVillage}
            hotspotFieldIDs={hotspotFieldIDs}
            hotspotAllGeoJSON={hotspotAllGeoJSON}
            hotspotOpacity={hotspotOpacity}
            basemap={basemap}
            mapRef={mapRef}
            onMapClick={latlng => {
              if (activeLayer === 'Buffer Distance') setBufferPoint(latlng)
            }}
            setPopup={setPopup}
          />

          {/* Active layer badges — smaller, top-right */}
          <div style={{
            position:'absolute', top:8, right:8, zIndex:850,
            display:'flex', flexDirection:'column', gap:3, alignItems:'flex-end',
            maxWidth:'46%'
          }}>
            {Array.from(activeLayers).filter(id => id !== 'Transition Statistics').map(id => {
              const cfg = LAYERS.find(l => l.id === id)
              const colors = {
                'Fields':'#2176ff','Activity':'#f4a261','Villages':'#2ec4b6',
                'LULC Maps':'#7b5ea7','Dams-Pumps':'#00b4d8',
                'Buffer Distance':'#f4a261','Hotspot Fields':'#e63946',
                'Theft Routes':'#e63946',
              }
              return (
                <div key={id} style={{
                  display:'flex', alignItems:'center', gap:4,
                  background:'rgba(6,14,28,0.9)',
                  border:`1px solid ${colors[id] || '#2176ff'}44`,
                  borderRadius:4, padding:'3px 7px',
                  fontSize:8.5, color: colors[id] || '#5ba4ff',
                  fontFamily:'DM Mono,monospace',
                }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background: colors[id] || '#2176ff', flexShrink:0 }}/>
                  {cfg?.abbr || id}
                  <span style={{ marginLeft:2, opacity:0.5, fontSize:10, lineHeight:1 }}
                    onClick={() => toggleLayerVisibility(id)}>×</span>
                </div>
              )
            })}
          </div>

          <CoordSearch mapRef={mapRef} showToast={showToast} />
          <MapPopup popup={popup} onClose={() => setPopup(null)} />
          {!mobileSheetOpen && <MapLegend activeLayer={activeLayer} farmData={farmData} lulcVisible={lulcVisible} />}
          {!mobileSheetOpen && <BasemapSwitcher current={basemap} onChange={setBasemap} />}

          {/* ── EARTH VIDEO — smaller on mobile ── */}
          <div style={{
            position:'absolute', bottom: mobileSheetOpen ? -100 : 64, left:10, zIndex:870,
            width:56, height:56, borderRadius:'50%', overflow:'hidden',
            border:'2px solid rgba(33,118,255,0.35)',
            boxShadow:'0 0 14px rgba(33,118,255,0.4)',
            pointerEvents:'none', transition:'bottom 0.3s ease',
            animation:'earthGlow 3s ease-in-out infinite alternate'
          }}>
            <video
              src="https://hamza-nkhumbwa.github.io/datasets/earth.mp4"
              autoPlay muted loop playsInline
              style={{ width:'100%', height:'100%', objectFit:'cover' }}
            />
          </div>

          {/* ── LAYER DRAWER — slides from left ── */}
          {mobileDrawerOpen && (
            <>
              <div
                onClick={() => setMobileDrawerOpen(false)}
                style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1100 }}
              />
              <div style={{
                position:'absolute', top:0, left:0, bottom:0, width:'78%', maxWidth:300,
                background:'#060e1c', borderRight:'1px solid rgba(33,118,255,0.2)',
                zIndex:1150, display:'flex', flexDirection:'column',
                boxShadow:'4px 0 30px rgba(0,0,0,0.5)',
                animation:'fadeUp 0.2s ease'
              }}>
                <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid rgba(33,118,255,0.1)' }}>
                  <div style={{ fontSize:9, letterSpacing:2.5, color:'rgba(255,255,255,0.3)', textTransform:'uppercase' }}>Map Layers</div>
                </div>
                <div style={{ flex:1, overflowY:'auto', paddingTop:4 }}>
                  {LAYERS.map(({ id, abbr, badge, external }) => {
                    const isPanelActive = activeLayer === id
                    const isMapOn       = activeLayers.has(id)
                    return (
                      <div key={id} style={{
                        display:'flex', alignItems:'center',
                        borderLeft:`3px solid ${isPanelActive ? '#2176ff' : 'transparent'}`,
                        background: isPanelActive ? 'rgba(33,118,255,0.1)' : 'transparent',
                      }}>
                        {!external && (
                          <button
                            onClick={e => { e.stopPropagation(); toggleLayerVisibility(id) }}
                            style={{
                              background:'none', border:'none', padding:'14px 8px 14px 14px',
                              color: isMapOn ? '#2176ff' : 'rgba(255,255,255,0.25)',
                              display:'flex', alignItems:'center'
                            }}>
                            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isMapOn?2:1.5} strokeLinecap="round" strokeLinejoin="round">
                              {isMapOn ? (
                                <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                              ) : (
                                <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                              )}
                            </svg>
                          </button>
                        )}
                        <div
                          onClick={() => handleLayer(id, external)}
                          style={{ display:'flex', alignItems:'center', gap:10, flex:1, padding: external ? '14px 16px' : '14px 14px 14px 6px', cursor:'pointer' }}>
                          <div style={{
                            width:34, height:18, borderRadius:4, flexShrink:0,
                            background: isPanelActive ? 'rgba(33,118,255,0.25)' : 'rgba(255,255,255,0.05)',
                            border:`1px solid ${isPanelActive ? 'rgba(33,118,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:8, fontWeight:700, letterSpacing:0.5,
                            color: isPanelActive ? '#5ba4ff' : 'rgba(255,255,255,0.3)',
                            fontFamily:'DM Mono,monospace'
                          }}>{abbr}</div>
                          <span style={{
                            fontSize:13, flex:1,
                            color: isPanelActive ? '#dce8f5' : isMapOn ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
                            fontWeight: isPanelActive ? 500 : 400,
                          }}>{id}</span>
                          {badge && isMapOn && <div style={{ width:7, height:7, borderRadius:'50%', background:THREAT_RED, flexShrink:0, animation:'pulse 2s infinite' }}/>}
                          {external && <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>&#8599;</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(33,118,255,0.08)' }}>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.15)', lineHeight:1.8 }}>
                    Worldwide Joint Discoverers<br/>
                    Hamza.N · Illovo Sugar Ltd<br/>
                    v2.1 · {new Date().getFullYear()}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── BOTTOM SHEET — active layer panel, swipe/tap to expand ── */}
        <div style={{
          position:'absolute', left:0, right:0, bottom:0, zIndex:1000,
          background:'#060e1c',
          borderTop:'1px solid rgba(33,118,255,0.2)',
          borderRadius:'16px 16px 0 0',
          boxShadow:'0 -8px 30px rgba(0,0,0,0.5)',
          maxHeight: mobileSheetOpen ? '62dvh' : '0px',
          transition:'max-height 0.32s cubic-bezier(0.4,0,0.2,1)',
          overflow:'hidden',
          display:'flex', flexDirection:'column',
          paddingBottom:'env(safe-area-inset-bottom)'
        }}>
          <div style={{ flex:1, overflowY:'auto', padding:'4px 14px 14px' }}>
            {renderPanel()}
          </div>
        </div>

        {/* ── BOTTOM TAB BAR — always visible, drag handle for sheet ── */}
        <div style={{
          flexShrink:0, background:'#060e1c',
          borderTop:'1px solid rgba(33,118,255,0.18)',
          zIndex:1050, position:'relative',
          paddingBottom:'env(safe-area-inset-bottom)'
        }}>
          {/* Drag handle / current layer strip — tap to toggle sheet */}
          <div
            onClick={() => setMobileSheetOpen(o => !o)}
            style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              padding:'8px 14px', cursor:'pointer',
              borderBottom:'1px solid rgba(33,118,255,0.1)'
            }}>
            <div style={{ width:34, height:4, borderRadius:2, background:'rgba(255,255,255,0.2)' }}/>
            <span style={{ fontSize:10, fontWeight:600, color:'#2176ff', letterSpacing:1, flex:1, textAlign:'center' }}>
              {activeCfg?.id?.toUpperCase() || 'LAYERS'} {mobileSheetOpen ? '▾' : '▴'}
            </span>
          </div>

          {/* Quick-access icons row */}
          <div style={{ display:'flex', overflowX:'auto', padding:'6px 8px', gap:4 }}>
            {LAYERS.filter(l => !l.external).map(({ id, abbr }) => {
              const isPanelActive = activeLayer === id
              const isMapOn       = activeLayers.has(id)
              return (
                <button
                  key={id}
                  onClick={() => handleLayer(id)}
                  style={{
                    flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                    padding:'6px 10px', borderRadius:8, cursor:'pointer',
                    background: isPanelActive ? 'rgba(33,118,255,0.18)' : 'transparent',
                    border:`1px solid ${isPanelActive ? 'rgba(33,118,255,0.4)' : 'transparent'}`,
                    minWidth:50
                  }}>
                  <div style={{
                    width:24, height:14, borderRadius:3,
                    background: isPanelActive ? 'rgba(33,118,255,0.3)' : 'rgba(255,255,255,0.06)',
                    border:`1px solid ${isMapOn ? 'rgba(33,118,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:6.5, fontWeight:700, color: isPanelActive ? '#5ba4ff' : 'rgba(255,255,255,0.35)',
                    fontFamily:'DM Mono,monospace', position:'relative'
                  }}>
                    {abbr}
                    {isMapOn && <div style={{ position:'absolute', top:-2, right:-2, width:5, height:5, borderRadius:'50%', background:'#22c55e' }}/>}
                  </div>
                  <span style={{ fontSize:7.5, color: isPanelActive ? '#5ba4ff' : 'rgba(255,255,255,0.4)', whiteSpace:'nowrap' }}>{id.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {toast && <div className="toast" style={{ bottom: mobileSheetOpen ? '64dvh' : 100 }}>{toast}</div>}

        <style>{`
          @keyframes earthGlow {
            from { box-shadow: 0 0 12px rgba(33,118,255,0.35); }
            to   { box-shadow: 0 0 24px rgba(33,118,255,0.65); }
          }
        `}</style>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DESKTOP / TABLET LAYOUT — three-column layout
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>

      {/* ── TOPBAR ────────────────────────────────────────────────────────── */}
      <div style={{
        height: 50, background:'#060e1c', flexShrink:0,
        borderBottom:'1px solid rgba(33,118,255,0.18)',
        display:'flex', alignItems:'center', padding:'0 16px', gap:12,
        boxShadow:'0 1px 16px rgba(0,0,0,0.5)'
      }}>
        {/* Logo mark */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{
            width:30, height:30, borderRadius:7, flexShrink:0,
            background:'linear-gradient(135deg,#1a5fc8,#060e1c)',
            border:'1px solid rgba(33,118,255,0.4)',
            display:'flex', alignItems:'center', justifyContent:'center'
          }}>
            <Icon name="signal" size={16} color="#5ba4ff" />
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff', letterSpacing:'-0.3px', lineHeight:1.1 }}>
              SpatialData <span style={{ color:'#2176ff' }}>GIS</span>
            </div>
            <div style={{ fontSize:9, color:'rgba(91,164,255,0.6)', letterSpacing:1.8 }}>ALUMENDA INTELLIGENCE</div>
          </div>
        </div>

        <div style={{ width:1, height:24, background:'rgba(255,255,255,0.08)' }}/>

        {/* Live status */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', boxShadow:'0 0 6px #22c55e', animation:'pulse 2s infinite' }}/>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.38)', letterSpacing:0.5 }}>LIVE  ·ALUMENDA ILLOVO SUGAR ESTATE  ·  MALAWI</span>
        </div>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Icon name="drone" size={12} color="rgba(255,255,255,0.2)" />
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.22)' }}>DJI Mavic Air 3S</span>
          </div>
          <div style={{ width:1, height:16, background:'rgba(255,255,255,0.07)' }}/>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)', fontFamily:'DM Mono,monospace' }}>{clock}</span>
          <div style={{ width:1, height:16, background:'rgba(255,255,255,0.07)' }}/>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.18)' }}>Worldwide Joint Discoverers</span>
          <div style={{ width:1, height:16, background:'rgba(255,255,255,0.07)' }}/>
          {/* WWJD Logo */}
          <img
            src="https://hamza-nkhumbwa.github.io/galanwra/wwjdlogo.png"
            alt="WWJD"
            style={{ height:36, width:'auto', objectFit:'contain', borderRadius:4,
                     filter:'drop-shadow(0 0 6px rgba(33,118,255,0.4))' }}
          />
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* SIDEBAR */}
        <div style={{
          width: 212, background:'#060e1c', flexShrink:0,
          borderRight:'1px solid rgba(33,118,255,0.12)',
          display:'flex', flexDirection:'column', overflow:'hidden'
        }}>
          <div style={{ flex:1, overflowY:'auto', paddingTop:6 }}>
            <div style={{ fontSize:8, letterSpacing:2.5, color:'rgba(255,255,255,0.18)', padding:'10px 16px 4px', textTransform:'uppercase' }}>
              Map Layers
            </div>

            {LAYERS.map(({ id, abbr, badge, external }) => {
              const isPanelActive = activeLayer === id
              const isMapOn       = activeLayers.has(id)
              return (
                <div key={id} style={{
                  display:'flex', alignItems:'center',
                  borderLeft:`2px solid ${isPanelActive ? '#2176ff' : 'transparent'}`,
                  background: isPanelActive ? 'rgba(33,118,255,0.10)' : 'transparent',
                  transition:'all 0.12s'
                }}>
                  {/* Eye/visibility toggle */}
                  {!external && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleLayerVisibility(id) }}
                      title={isMapOn ? 'Hide from map' : 'Show on map'}
                      style={{
                        background:'none', border:'none', cursor:'pointer',
                        padding:'8px 5px 8px 10px', flexShrink:0,
                        color: isMapOn ? '#2176ff' : 'rgba(255,255,255,0.2)',
                        transition:'all 0.15s',
                        display:'flex', alignItems:'center',
                        lineHeight:0
                      }}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth={isMapOn ? 2 : 1.5}
                           strokeLinecap="round" strokeLinejoin="round">
                        {isMapOn ? (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </>
                        ) : (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </>
                        )}
                      </svg>
                    </button>
                  )}

                  {/* Layer name — click to bring up panel */}
                  <div
                    style={{
                      display:'flex', alignItems:'center', gap:8, flex:1, cursor:'pointer',
                      padding: external ? '8px 14px 8px 14px' : '8px 10px 8px 4px',
                      userSelect:'none'
                    }}
                    onClick={() => handleLayer(id, external)}>

                    <div style={{
                      width:30, height:16, borderRadius:3, flexShrink:0,
                      background: isPanelActive ? 'rgba(33,118,255,0.25)' : 'rgba(255,255,255,0.05)',
                      border:`1px solid ${isPanelActive ? 'rgba(33,118,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:7, fontWeight:700, letterSpacing:0.5,
                      color: isPanelActive ? '#5ba4ff' : 'rgba(255,255,255,0.3)',
                      fontFamily:'DM Mono,monospace'
                    }}>{abbr}</div>

                    <span style={{
                      fontSize:11, flex:1,
                      color: isPanelActive ? '#dce8f5' : isMapOn ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
                      fontWeight: isPanelActive ? 500 : isMapOn ? 400 : 300,
                      transition:'color 0.12s'
                    }}>{id}</span>

                    {badge && isMapOn && (
                      <div style={{ width:6, height:6, borderRadius:'50%', background:THREAT_RED, flexShrink:0, animation:'pulse 2s infinite' }}/>
                    )}
                    {external && (
                      <span style={{ fontSize:9, color:'rgba(255,255,255,0.2)' }}>&#8599;</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sidebar footer */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid rgba(33,118,255,0.08)' }}>
            <div style={{ fontSize:8, color:'rgba(255,255,255,0.15)', letterSpacing:0.3, lineHeight:1.8 }}>
              Worldwide Joint Discoverers<br/>
              (Hamza.N) · Illovo Sugar Ltd<br/>
              v2.0 · {new Date().getFullYear()}
            </div>
          </div>
        </div>

        {/* MAP */}
        <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
          <MapView
            activeLayer={activeLayer}
            farmData={farmData}
            activityData={activityData}
            actFilter={actFilter}
            dnFilter={dnFilter}
            villageData={villageData}
            damData={damData}
            routeData={routeData} 
            lulcVisible={lulcVisible}
            lulcOpacity={lulcOpacity}
            bufferPoint={bufferPoint}
            bufferRadius={bufferRadius}
            routeOpacity={routeOpacity}
            activeLayers={activeLayers}
            selectedFarm={selectedFarm}
            selectedField={selectedField}
            selectedVillage={selectedVillage}
            hotspotFieldIDs={hotspotFieldIDs}
            hotspotAllGeoJSON={hotspotAllGeoJSON}
            hotspotOpacity={hotspotOpacity}
            basemap={basemap}
            mapRef={mapRef}
            onMapClick={latlng => {
              if (activeLayer === 'Buffer Distance') setBufferPoint(latlng)
            }}
            setPopup={setPopup}
          />

          {/* ── ACTIVE LAYERS BADGE STRIP ── shown bottom-left of map ── */}
          <div style={{
            position:'absolute', top:10, right:10, zIndex:850,
            display:'flex', flexDirection:'column', gap:3, alignItems:'flex-end'
          }}>
            {Array.from(activeLayers).filter(id => id !== 'Transition Statistics').map(id => {
              const cfg = LAYERS.find(l => l.id === id)
              const colors = {
                'Fields':'#2176ff','Activity':'#f4a261','Villages':'#2ec4b6',
                'LULC Maps':'#7b5ea7','Dams-Pumps':'#00b4d8',
                'Buffer Distance':'#f4a261','Hotspot Fields':'#e63946',
                'Theft Routes':'#e63946',
              }
              return (
                <div key={id} style={{
                  display:'flex', alignItems:'center', gap:5,
                  background:'rgba(6,14,28,0.88)',
                  border:`1px solid ${colors[id] || '#2176ff'}44`,
                  borderRadius:4, padding:'3px 8px',
                  fontSize:9, color: colors[id] || '#5ba4ff',
                  fontFamily:'DM Mono,monospace', letterSpacing:0.5,
                  backdropFilter:'blur(4px)'
                }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background: colors[id] || '#2176ff', flexShrink:0 }}/>
                  {cfg?.abbr || id}
                  {/* click X to toggle off */}
                  <span style={{ marginLeft:3, cursor:'pointer', opacity:0.5, fontSize:10, lineHeight:1 }}
                    onClick={() => toggleLayerVisibility(id)}>×</span>
                </div>
              )
            })}
          </div>

          {/* Map overlays */}
          <CoordSearch mapRef={mapRef} showToast={showToast} />
          <MapPopup popup={popup} onClose={() => setPopup(null)} />
          <MapLegend activeLayer={activeLayer} farmData={farmData} lulcVisible={lulcVisible} />
          <BasemapSwitcher current={basemap} onChange={setBasemap} />

          {/* Coordinate bar */}
          <div id="coord-bar" className="coord-bar">Move cursor over map</div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{
          width: 272, background:'#060e1c', flexShrink:0,
          borderLeft:'1px solid rgba(33,118,255,0.12)',
          display:'flex', flexDirection:'column', overflow:'hidden'
        }}>
          <div style={{
            padding:'10px 13px 8px',
            borderBottom:'1px solid rgba(33,118,255,0.1)',
            display:'flex', alignItems:'center', gap:8
          }}>
            <Icon name={LAYERS.find(l=>l.id===activeLayer)?.abbr?.toLowerCase() || 'map'} size={14} color="#2176ff" />
            <span style={{ fontSize:10, fontWeight:600, color:'#2176ff', letterSpacing:1.5 }}>
              {activeLayer.toUpperCase()}
            </span>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:10 }}>
            {renderPanel()}
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* ── EARTH VIDEO (bottom-right corner) ───────────────────────────── */}
      <div style={{
        position:'fixed', bottom:70, left:16, zIndex:1500,
        width:90, height:90, borderRadius:'50%',
        overflow:'hidden',
        border:'2px solid rgba(33,118,255,0.35)',
        boxShadow:'0 0 18px rgba(33,118,255,0.4), 0 0 6px rgba(0,0,0,0.8)',
        pointerEvents:'none',
        animation:'earthGlow 3s ease-in-out infinite alternate'
      }}>
        <video
          src="https://hamza-nkhumbwa.github.io/datasets/earth.mp4"
          autoPlay muted loop playsInline
          style={{ width:'100%', height:'100%', objectFit:'cover' }}
        />
      </div>

      <style>{`
        @keyframes earthGlow {
          from { box-shadow: 0 0 12px rgba(33,118,255,0.35), 0 0 5px rgba(0,0,0,0.8); }
          to   { box-shadow: 0 0 28px rgba(33,118,255,0.7), 0 0 10px rgba(0,180,216,0.4); }
        }
      `}</style>
    </div>
  )
}
