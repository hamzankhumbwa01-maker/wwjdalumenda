import { useState, useEffect, useRef, useMemo } from 'react'
import L from 'leaflet'

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
export const ASSAULT_LAYER_ID = 'Assault Cases'
const ASSAULT_CSV = 'https://hamza-nkhumbwa.github.io/galanwra/Assault.csv'
const LS_KEY      = 'alumenda_assault_reports_v1'

const TYPES   = ['Physical assault', 'Armed assault', 'Robbery with violence', 'Sexual assault', 'Threat / intimidation', 'Other']
const VICTIMS = ['Security guard', 'Employee', 'Cane cutter', 'Driver', 'Community member', 'Other']
const WEAPONS = ['None', 'Blunt object', 'Bladed', 'Firearm', 'Other']
const SEV     = { Minor: '#f4d35e', Moderate: '#f4a261', Serious: '#e63946', Fatal: '#9d0208' }
const RED = '#e63946', AMBER = '#f4a261', BLUE = '#2176ff', VIOLET = '#7b5ea7', GREEN = '#2ec4b6'
const MUTED = 'rgba(255,255,255,0.4)'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))

function splitLine(l) {
  const out = []; let cur = '', q = false
  for (const ch of l) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out.map(s => s.trim())
}
function parseCSV(text) {
  const ls = text.trim().split(/\r?\n/).filter(Boolean)
  if (ls.length < 2) return []
  const h = splitLine(ls[0])
  return ls.slice(1).map(l => { const v = splitLine(l); return Object.fromEntries(h.map((k, i) => [k, v[i] ?? ''])) })
}

function normalize(r, i, local = false) {
  const lat = parseFloat(r.Latitude), lng = parseFloat(r.Longitude)
  if (!isFinite(lat) || !isFinite(lng)) return null
  const d = new Date(`${r.Date}T${(r.Time || '00:00').slice(0, 5)}`)
  const ok = !isNaN(d)
  return {
    id: r.ID || `${local ? 'L' : 'R'}${i + 1}`, lat, lng,
    date: ok ? d : null, hour: ok ? d.getHours() : null,
    type: r.Type || 'Other', severity: SEV[r.Severity] ? r.Severity : 'Moderate',
    victim: r.Victim || 'Other', weapon: r.Weapon || 'None',
    farm: r.Farm || '', field: r.Field || '', notes: r.Notes || '', local
  }
}

const isNight = h => h !== null && (h < 6 || h >= 18)

function hav(a, b, c, d) {
  const R = 6371000, t = x => x * Math.PI / 180
  const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Hotspot grid: ~275 m cells
const CELL = 0.0025
function gridCells(list) {
  const m = {}
  list.forEach(c => {
    const i = Math.floor(c.lat / CELL), j = Math.floor(c.lng / CELL), k = i + ',' + j
    ;(m[k] = m[k] || { i, j, n: 0 }).n++
  })
  return Object.values(m).sort((a, b) => b.n - a.n)
}
const cellBounds = c => [[c.i * CELL, c.j * CELL], [(c.i + 1) * CELL, (c.j + 1) * CELL]]
const cellCenter = c => [(c.i + 0.5) * CELL, (c.j + 0.5) * CELL]

function exportCSV(rows) {
  const H = ['ID', 'Date', 'Time', 'Latitude', 'Longitude', 'Type', 'Severity', 'Victim', 'Weapon', 'Farm', 'Field', 'Notes']
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const t = [H.join(','), ...rows.map(r => H.map(h => q(r[h])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' }))
  a.download = 'Assault_reports.csv'; a.click()
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE HOOK — call once in App (before any early return)
// ─────────────────────────────────────────────────────────────────────────────
export function useAssault() {
  const [remote, setRemote]   = useState([])
  const [local, setLocal]     = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ type: 'All', severity: 'All', period: 'All', tod: 'All' })
  const [view, setView]       = useState('both')       // points | grid | both
  const [pick, setPick]       = useState(null)         // {lat,lng} for new report
  const [picking, setPicking] = useState(false)
  const [track, setTrack]     = useState({ on: false, pos: null, trail: [], dist: 0, follow: true, start: null, err: '' })
  const watch = useRef(null), lock = useRef(null)

  useEffect(() => {
    fetch(ASSAULT_CSV).then(r => r.ok ? r.text() : Promise.reject()).then(t => setRemote(parseCSV(t)))
      .catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(local)) } catch {} }, [local])

  const all = useMemo(() => [
    ...remote.map((r, i) => normalize(r, i)),
    ...local.map((r, i) => normalize(r, i, true))
  ].filter(Boolean), [remote, local])

  const filtered = useMemo(() => {
    const days = { '30d': 30, '90d': 90, '1y': 365 }[filters.period], now = Date.now()
    return all.filter(c =>
      (filters.type === 'All' || c.type === filters.type) &&
      (filters.severity === 'All' || c.severity === filters.severity) &&
      (filters.tod === 'All' || (c.hour !== null && (isNight(c.hour) ? 'Night' : 'Day') === filters.tod)) &&
      (!days || (c.date && now - c.date <= days * 864e5))
    )
  }, [all, filters])

  const addReport    = r => setLocal(l => [...l, { ...r, ID: 'L' + Date.now() }])
  const removeReport = id => setLocal(l => l.filter(r => r.ID !== id))

  const startTrack = () => {
    if (!navigator.geolocation) { setTrack(t => ({ ...t, err: 'Geolocation is not supported on this device.' })); return }
    setTrack(t => ({ ...t, on: true, trail: [], dist: 0, start: Date.now(), err: '' }))
    watch.current = navigator.geolocation.watchPosition(p => {
      const { latitude: lat, longitude: lng, accuracy: acc, speed, heading } = p.coords
      setTrack(t => {
        const last = t.trail[t.trail.length - 1]
        const step = last ? hav(last[0], last[1], lat, lng) : 0
        const move = !last || (step > 4 && acc < 60)
        return { ...t, pos: { lat, lng, acc, speed, heading },
          trail: move ? [...t.trail, [lat, lng]] : t.trail, dist: t.dist + (move && last ? step : 0) }
      })
    }, e => setTrack(t => ({ ...t, on: false, err: e.code === 1 ? 'Location permission denied. Allow it in your browser settings.' : 'Could not get your location.' })),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
    try { navigator.wakeLock?.request('screen').then(l => { lock.current = l }).catch(() => {}) } catch {}
  }
  const stopTrack = () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    try { lock.current?.release() } catch {}
    setTrack(t => ({ ...t, on: false }))
  }
  const resetTrack = () => setTrack(t => ({ ...t, trail: [], dist: 0, pos: t.on ? t.pos : null, start: t.on ? Date.now() : null }))
  useEffect(() => () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current) }, [])

  return { all, filtered, local, loading, filters, setFilters, view, setView, pick, setPick, picking, setPicking,
           track, setTrack, startTrack, stopTrack, resetTrack, addReport, removeReport }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP LAYER — renders nothing, draws on the existing Leaflet map
// ─────────────────────────────────────────────────────────────────────────────
export function AssaultMapLayer({ mapRef, active, a }) {
  const grp = useRef(null), pickPin = useRef(null), tk = useRef({})
  const { filtered: list, view, picking, setPicking, pick, setPick, track } = a

  const safeRemove = (map, l) => { try { l && map.removeLayer(l) } catch {} }

  // incidents + hotspot grid
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    safeRemove(map, grp.current); grp.current = null
    if (!active || !list.length) return
    const g = L.layerGroup()

    if (view !== 'points') {
      const cells = gridCells(list), max = cells[0]?.n || 1
      cells.forEach(c => {
        const r = c.n / max
        L.rectangle(cellBounds(c), { weight: 0, fillColor: r > 0.66 ? RED : r > 0.33 ? AMBER : '#f4d35e', fillOpacity: 0.15 + 0.4 * r })
          .bindTooltip(`${c.n} case${c.n > 1 ? 's' : ''} in this zone`).addTo(g)
      })
    }
    if (view !== 'grid') {
      list.forEach(c => {
        const col = SEV[c.severity]
        L.circleMarker([c.lat, c.lng], { radius: c.severity === 'Fatal' ? 9 : c.severity === 'Serious' ? 7.5 : 6, color: '#fff', weight: 1.5, fillColor: col, fillOpacity: 0.9 })
          .bindPopup(`<b style="color:${col}">${esc(c.severity)} · ${esc(c.type)}</b><br>
            ${c.date ? esc(c.date.toLocaleString()) : 'Date unknown'}<br>
            Victim: ${esc(c.victim)} · Weapon: ${esc(c.weapon)}<br>
            ${c.farm || c.field ? `Farm/Field: ${esc(c.farm)} ${esc(c.field)}<br>` : ''}
            ${c.notes ? `<i>${esc(c.notes)}</i><br>` : ''}
            <small>ID ${esc(c.id)}${c.local ? ' · local report' : ''}</small>`)
          .addTo(g)
      })
    }
    g.addTo(map); grp.current = g
    return () => { safeRemove(map, grp.current); grp.current = null }
  }, [mapRef, active, list, view])

  // click-to-pick location for a new report
  useEffect(() => {
    const map = mapRef.current; if (!map || !picking || !active) return
    const h = e => { setPick({ lat: e.latlng.lat, lng: e.latlng.lng }); setPicking(false) }
    map.on('click', h); map.getContainer().style.cursor = 'crosshair'
    return () => { try { map.off('click', h); map.getContainer().style.cursor = '' } catch {} }
  }, [mapRef, picking, active])

  useEffect(() => {
    const map = mapRef.current; if (!map) return
    safeRemove(map, pickPin.current); pickPin.current = null
    if (!active || !pick) return
    pickPin.current = L.marker([pick.lat, pick.lng], { icon: L.divIcon({
      html: `<div style="width:16px;height:16px;background:${RED};border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px ${RED}"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8], className: '' }) }).addTo(map)
    return () => { safeRemove(map, pickPin.current); pickPin.current = null }
  }, [mapRef, active, pick])

  // movement tracker: trail + live marker
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    const t = tk.current
    if (!track.pos && !track.trail.length) { ['trail', 'me', 'acc'].forEach(k => { safeRemove(map, t[k]); t[k] = null }); return }
    if (!t.trail) t.trail = L.polyline([], { color: '#5ba4ff', weight: 4, opacity: 0.9 }).addTo(map)
    t.trail.setLatLngs(track.trail)
    if (!track.on || !track.pos) { safeRemove(map, t.me); t.me = null; safeRemove(map, t.acc); t.acc = null; return }
    const { lat, lng, acc } = track.pos
    if (!t.me) t.me = L.marker([lat, lng], { zIndexOffset: 1000, icon: L.divIcon({
      html: `<div style="width:18px;height:18px;background:#2196f3;border:3px solid #fff;border-radius:50%;box-shadow:0 0 14px #2196f3"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9], className: '' }) }).addTo(map)
    else t.me.setLatLng([lat, lng])
    if (!t.acc) t.acc = L.circle([lat, lng], { radius: acc, color: '#2196f3', fillOpacity: 0.12, weight: 1 }).addTo(map)
    else { t.acc.setLatLng([lat, lng]); t.acc.setRadius(acc) }
    if (track.follow) map.panTo([lat, lng], { animate: true })
  }, [mapRef, track.on, track.pos, track.trail, track.follow])

  useEffect(() => () => {
    const map = mapRef.current; if (!map) return
    ;['trail', 'me', 'acc'].forEach(k => safeRemove(map, tk.current[k]))
  }, [])

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL CHART PIECES
// ─────────────────────────────────────────────────────────────────────────────
function Bars({ rows, color = BLUE }) {
  const max = Math.max(...rows.map(r => r[1]), 1)
  return <>{rows.map(([l, v, c]) => (
    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ width: 88, fontSize: 9, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
        <div style={{ width: `${(v / max) * 100}%`, height: '100%', background: c || color, borderRadius: 3 }} />
      </div>
      <span style={{ width: 22, textAlign: 'right', fontSize: 9, color: c || color, fontFamily: 'DM Mono,monospace' }}>{v}</span>
    </div>
  ))}</>
}

function Cols({ vals, labels, color = BLUE, hi }) {
  const max = Math.max(...vals, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 66 }}>
      {vals.map((v, i) => (
        <div key={i} title={`${labels[i] || i}: ${v}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <div style={{ width: '100%', height: Math.max(2, (v / max) * 50), background: hi && hi(i) ? VIOLET : color, borderRadius: '2px 2px 0 0' }} />
          <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', marginTop: 2, height: 9 }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

const Kpi = ({ label, value, color }) => (
  <div style={{ flex: 1, minWidth: 0, padding: '8px 6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, textAlign: 'center' }}>
    <div style={{ fontSize: 17, fontWeight: 700, color, fontFamily: 'DM Mono,monospace' }}>{value}</div>
    <div style={{ fontSize: 8.5, color: MUTED, marginTop: 2 }}>{label}</div>
  </div>
)

// ─────────────────────────────────────────────────────────────────────────────
// PANEL
// ─────────────────────────────────────────────────────────────────────────────
// ── form styles (explicit, so they never depend on global CSS) ──────────────
const FIELD = {
  width: '100%', boxSizing: 'border-box', minHeight: 38, padding: '8px 10px', marginBottom: 10,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 6,
  color: '#dce8f5', fontSize: 13, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark', display: 'block'
}
const LABEL = { display: 'block', fontSize: 9.5, letterSpacing: 1, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px', textTransform: 'uppercase' }
const SUB   = { fontSize: 9.5, letterSpacing: 1.2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', margin: '12px 0 6px' }

const Chevron = ({ open }) => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}
       strokeLinecap="round" strokeLinejoin="round"
       style={{ transition: 'transform .2s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
    <polyline points="6,9 12,15 18,9" />
  </svg>
)

// Collapsible section with classic chevron
function Section({ title, badge, accent = BLUE, open, onToggle, children }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderColor: open ? `${accent}55` : undefined }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '12px 12px', background: 'none',
                 border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left', fontFamily: 'inherit' }}>
        <span style={{ width: 3, height: 13, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: open ? '#dce8f5' : 'rgba(255,255,255,0.55)' }}>{title}</span>
        {badge != null && badge !== '' && (
          <span style={{ fontSize: 9, fontFamily: 'DM Mono,monospace', padding: '1px 7px', borderRadius: 9, background: `${accent}22`, color: accent }}>{badge}</span>
        )}
        <span style={{ color: 'rgba(255,255,255,0.5)', display: 'flex' }}><Chevron open={open} /></span>
      </button>
      {open && <div style={{ padding: '0 12px 12px' }}>{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL
// ─────────────────────────────────────────────────────────────────────────────
export function AssaultPanel({ a, mapRef, showToast }) {
  const { filtered: list, all, loading, filters, setFilters, view, setView, pick, setPick, picking, setPicking, track } = a
  const nowLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)
  const [form, setForm] = useState({ type: TYPES[0], severity: 'Moderate', victim: VICTIMS[0], weapon: 'None', when: nowLocal(), farm: '', field: '', notes: '' })
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  const [open, setOpen] = useState({ overview: true, tracker: true, filters: false, severity: false, time: false, people: false, zones: false, report: false, saved: false })
  const tog = k => setOpen(o => ({ ...o, [k]: !o[k] }))
  const allOpen = Object.values(open).every(Boolean)
  const setAll = v => setOpen(o => Object.fromEntries(Object.keys(o).map(k => [k, v])))

  const S = useMemo(() => {
    const count = (keys, get) => keys.map(k => [k, list.filter(c => get(c) === k).length])
    const hours = Array(24).fill(0), dow = Array(7).fill(0)
    list.forEach(c => { if (c.hour !== null) hours[c.hour]++; if (c.date) dow[c.date.getDay()]++ })
    const months = [], now = new Date()
    for (let m = 11; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
      months.push({ label: d.toLocaleString('en', { month: 'short' }).slice(0, 3),
        n: list.filter(c => c.date && c.date.getFullYear() === d.getFullYear() && c.date.getMonth() === d.getMonth()).length })
    }
    const night = list.filter(c => isNight(c.hour)).length
    return {
      sev: Object.keys(SEV).map(k => [k, list.filter(c => c.severity === k).length, SEV[k]]),
      types: count(TYPES, c => c.type).filter(r => r[1]), victims: count(VICTIMS, c => c.victim).filter(r => r[1]),
      weapons: count(WEAPONS, c => c.weapon).filter(r => r[1]),
      hours, dow, months, cells: gridCells(list).slice(0, 5),
      night: list.length ? Math.round((night / list.length) * 100) : 0,
      serious: list.filter(c => c.severity === 'Serious' || c.severity === 'Fatal').length,
      last30: list.filter(c => c.date && Date.now() - c.date <= 30 * 864e5).length
    }
  }, [list])

  // tracker: nearest incident + proximity alert
  const near = useMemo(() => {
    if (!track.pos || !list.length) return null
    let best = null
    list.forEach(c => { const d = hav(track.pos.lat, track.pos.lng, c.lat, c.lng); if (!best || d < best.d) best = { d, c } })
    const cellHit = gridCells(list)[0]
    return { ...best, hot: cellHit && hav(track.pos.lat, track.pos.lng, ...cellCenter(cellHit)) < 300 }
  }, [track.pos, list])

  const gps = () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported'); return }
    navigator.geolocation.getCurrentPosition(
      p => { setPick({ lat: p.coords.latitude, lng: p.coords.longitude }); showToast('Location set from GPS') },
      () => showToast('Could not read GPS — allow location access'), { enableHighAccuracy: true, timeout: 10000 })
  }
  const save = () => {
    if (!pick) { showToast('Set the incident location first'); return }
    const [Date_, Time] = form.when.split('T')
    a.addReport({ Date: Date_, Time, Latitude: pick.lat.toFixed(6), Longitude: pick.lng.toFixed(6), Type: form.type, Severity: form.severity,
      Victim: form.victim, Weapon: form.weapon, Farm: form.farm, Field: form.field, Notes: form.notes.trim() })
    setPick(null); setForm(f => ({ ...f, notes: '', when: nowLocal() })); showToast('Incident saved on this device')
  }

  const km = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m'
  const mins = track.start ? Math.max(1, Math.round((Date.now() - track.start) / 60000)) : 0
  const activeFilters = Object.values(filters).filter(v => v !== 'All').length
  const fsel = (k, opts, label) => (
    <select className="as-f" style={FIELD} value={filters[k]} onChange={e => setFilter(k, e.target.value)}>
      <option value="All">{label}</option>{opts.map(o => <option key={o}>{o}</option>)}
    </select>
  )
  const opt = arr => arr.map(o => <option key={o}>{o}</option>)

  return (<>
    <style>{`.as-f::placeholder{color:rgba(255,255,255,0.32)} .as-f:focus{border-color:#2176ff!important;box-shadow:0 0 0 2px rgba(33,118,255,0.25)}`}</style>

    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
      <span className="chip" onClick={() => setAll(!allOpen)}>{allOpen ? 'Collapse all' : 'Expand all'}</span>
    </div>

    {/* Overview */}
    <Section title="Assault Overview" accent={RED} open={open.overview} onToggle={() => tog('overview')} badge={list.length}>
      <div style={{ display: 'flex', gap: 6 }}>
        <Kpi label="Cases" value={list.length} color={RED} />
        <Kpi label="Serious+" value={S.serious} color={AMBER} />
        <Kpi label="At night" value={`${S.night}%`} color={VIOLET} />
        <Kpi label="Last 30d" value={S.last30} color={GREEN} />
      </div>
      <div style={{ fontSize: 9, color: MUTED, marginTop: 8 }}>
        {loading ? 'Loading Assault.csv…' : `${all.length} records loaded (${a.local.length} saved on this device)`}
      </div>
    </Section>

    {/* Movement tracker */}
    <Section title="Movement Tracker" accent={BLUE} open={open.tracker} onToggle={() => tog('tracker')} badge={track.on ? 'LIVE' : ''}>
      <button className={`btn ${track.on ? 'btn-danger' : 'btn-primary'}`} onClick={track.on ? a.stopTrack : a.startTrack}>
        {track.on ? 'Stop tracking' : 'Start tracking'}
      </button>
      {track.err && <div style={{ fontSize: 10, color: RED, marginBottom: 6 }}>{track.err}</div>}
      {track.pos && (
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.9 }}>
          Distance: <b style={{ color: '#dce8f5' }}>{km(track.dist)}</b> · {mins} min<br />
          Speed: <b style={{ color: '#dce8f5' }}>{track.pos.speed != null ? (track.pos.speed * 3.6).toFixed(1) + ' km/h' : '—'}</b> · Accuracy ±{Math.round(track.pos.acc)} m<br />
          {near && <>Nearest incident: <b style={{ color: near.d < 300 ? RED : GREEN }}>{km(near.d)}</b> ({near.c.type})</>}
        </div>
      )}
      {near?.hot && (
        <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 5, background: `${RED}18`, border: `1px solid ${RED}66`, fontSize: 10, color: RED }}>
          You are inside the busiest assault zone. Stay alert.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <span className={`chip${track.follow ? ' on-blue' : ''}`} onClick={() => a.setTrack(t => ({ ...t, follow: !t.follow }))}>Follow me</span>
        <span className="chip" onClick={a.resetTrack}>Clear trail</span>
      </div>
    </Section>

    {/* Filters */}
    <Section title="Filters & Map View" accent={AMBER} open={open.filters} onToggle={() => tog('filters')} badge={activeFilters ? `${activeFilters} active` : ''}>
      <label style={LABEL}>Type of assault</label>{fsel('type', TYPES, 'All types')}
      <label style={LABEL}>Severity</label>{fsel('severity', Object.keys(SEV), 'All severities')}
      <label style={LABEL}>Period</label>
      <select className="as-f" style={FIELD} value={filters.period} onChange={e => setFilter('period', e.target.value)}>
        <option value="All">All time</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="1y">Last year</option>
      </select>
      <label style={LABEL}>Time of day</label>
      <div style={{ marginBottom: 6 }}>
        {['All', 'Day', 'Night'].map(t => <span key={t} className={`chip${filters.tod === t ? ' on-blue' : ''}`} onClick={() => setFilter('tod', t)}>{t}</span>)}
      </div>
      <div style={SUB}>Map view</div>
      {[['points', 'Cases'], ['grid', 'Hotspot zones'], ['both', 'Both']].map(([k, l]) =>
        <span key={k} className={`chip${view === k ? ' on-amber' : ''}`} onClick={() => setView(k)}>{l}</span>)}
    </Section>

    {/* Analysis */}
    {list.length > 0 ? (<>
      <Section title="Severity & Type" accent={RED} open={open.severity} onToggle={() => tog('severity')}>
        <div style={{ ...SUB, marginTop: 0 }}>Severity</div><Bars rows={S.sev} />
        <div style={SUB}>Type of assault</div><Bars rows={S.types} color={RED} />
      </Section>
      <Section title="Time Patterns" accent={VIOLET} open={open.time} onToggle={() => tog('time')}>
        <div style={{ ...SUB, marginTop: 0 }}>Hour of day (violet = night)</div>
        <Cols vals={S.hours} labels={S.hours.map((_, h) => (h % 3 === 0 ? h : ''))} hi={h => h < 6 || h >= 18} />
        <div style={SUB}>Day of week</div>
        <Cols vals={S.dow} labels={['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']} color={AMBER} />
        <div style={SUB}>Last 12 months</div>
        <Cols vals={S.months.map(m => m.n)} labels={S.months.map(m => m.label)} color={GREEN} />
      </Section>
      <Section title="Victims & Weapons" accent={BLUE} open={open.people} onToggle={() => tog('people')}>
        <div style={{ ...SUB, marginTop: 0 }}>Who is affected</div><Bars rows={S.victims} color={BLUE} />
        <div style={SUB}>Weapon involved</div><Bars rows={S.weapons} color={VIOLET} />
      </Section>
      <Section title="Top Hotspot Zones" accent={RED} open={open.zones} onToggle={() => tog('zones')} badge={S.cells.length}>
        {S.cells.map((c, i) => (
          <div key={i} className="village-row" onClick={() => mapRef.current?.setView(cellCenter(c), 16)}>
            <span style={{ color: i === 0 ? RED : AMBER, fontFamily: 'DM Mono,monospace', width: 18 }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 10.5 }}>{cellCenter(c)[0].toFixed(4)}, {cellCenter(c)[1].toFixed(4)}</span>
            <span style={{ color: RED, fontWeight: 700, fontSize: 11 }}>{c.n}</span>
          </div>
        ))}
        <div style={{ fontSize: 9, color: MUTED, marginTop: 4 }}>Tap a zone to zoom to it.</div>
      </Section>
    </>) : (
      <div className="card" style={{ fontSize: 11, color: MUTED, lineHeight: 1.7 }}>
        No cases match yet. Report an incident below, or add an <b>Assault.csv</b> file to your data repository.
      </div>
    )}

    {/* Report an incident */}
    <Section title="Report an Incident" accent={RED} open={open.report} onToggle={() => tog('report')}>
      <div style={LABEL}>1 · Location</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <button type="button" className="btn btn-ghost" style={{ marginBottom: 0, flex: 1 }} onClick={gps}>Use my GPS</button>
        <button type="button" className={`btn ${picking ? 'btn-primary' : 'btn-ghost'}`} style={{ marginBottom: 0, flex: 1 }} onClick={() => setPicking(p => !p)}>
          {picking ? 'Tap the map…' : 'Pick on map'}
        </button>
      </div>
      <div style={{ fontSize: 10.5, marginBottom: 12, color: pick ? GREEN : MUTED, fontFamily: 'DM Mono,monospace' }}>
        {picking ? 'Tap the incident spot on the map (on a phone, minimise this panel first).'
                 : pick ? `${pick.lat.toFixed(5)}, ${pick.lng.toFixed(5)}` : 'No location set yet'}
      </div>

      <div style={LABEL}>2 · Details</div>
      <label style={LABEL}>Date & time</label>
      <input className="as-f" style={FIELD} type="datetime-local" value={form.when} onChange={e => setF('when', e.target.value)} />
      <label style={LABEL}>Type of assault</label>
      <select className="as-f" style={FIELD} value={form.type} onChange={e => setF('type', e.target.value)}>{opt(TYPES)}</select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={LABEL}>Severity</label>
          <select className="as-f" style={FIELD} value={form.severity} onChange={e => setF('severity', e.target.value)}>{opt(Object.keys(SEV))}</select></div>
        <div><label style={LABEL}>Weapon</label>
          <select className="as-f" style={FIELD} value={form.weapon} onChange={e => setF('weapon', e.target.value)}>{opt(WEAPONS)}</select></div>
      </div>
      <label style={LABEL}>Victim category</label>
      <select className="as-f" style={FIELD} value={form.victim} onChange={e => setF('victim', e.target.value)}>{opt(VICTIMS)}</select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={LABEL}>Farm</label>
          <input className="as-f" style={FIELD} placeholder="e.g. Farm 72" value={form.farm} onChange={e => setF('farm', e.target.value)} /></div>
        <div><label style={LABEL}>Field</label>
          <input className="as-f" style={FIELD} placeholder="e.g. 72-014" value={form.field} onChange={e => setF('field', e.target.value)} /></div>
      </div>

      <div style={LABEL}>3 · Short note <span style={{ textTransform: 'none', letterSpacing: 0, color: 'rgba(255,255,255,0.3)' }}>(no victim names)</span></div>
      <textarea className="as-f" style={{ ...FIELD, minHeight: 74, resize: 'vertical', marginBottom: 4 }} rows={3} maxLength={200}
        placeholder="What happened, in a sentence or two…" value={form.notes} onChange={e => setF('notes', e.target.value)} />
      <div style={{ textAlign: 'right', fontSize: 9, color: MUTED, marginBottom: 6 }}>{form.notes.length}/200</div>

      {/* sticky save bar: stays visible while scrolling through the form */}
      <div style={{ position: 'sticky', bottom: 0, margin: '0 -12px -12px', padding: '10px 12px 12px', background: '#0a1426', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {!pick && <div style={{ fontSize: 10, color: AMBER, marginBottom: 6, textAlign: 'center' }}>Set a location (step 1) to enable saving</div>}
        <button type="button" onClick={save} disabled={!pick}
          style={{ width: '100%', height: 44, borderRadius: 8, border: 'none', cursor: pick ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700,
                   letterSpacing: 0.5, fontFamily: 'inherit', color: '#fff', opacity: pick ? 1 : 0.45,
                   background: `linear-gradient(135deg, ${RED}, #b3202c)`, boxShadow: pick ? `0 0 14px ${RED}55` : 'none' }}>
          Save incident
        </button>
      </div>
    </Section>

    {/* Local data */}
    {a.local.length > 0 && (
      <Section title="Saved on this device" accent={GREEN} open={open.saved} onToggle={() => tog('saved')} badge={a.local.length}>
        <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 8 }}>
          {a.local.map(r => (
            <div key={r.ID} className="village-row">
              <span style={{ flex: 1, fontSize: 10 }}>{r.Date} · {r.Type}</span>
              <span style={{ color: RED, cursor: 'pointer', fontSize: 16, padding: '0 6px' }} onClick={() => a.removeReport(r.ID)}>×</span>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => exportCSV(a.local)}>Export as CSV</button>
        <div style={{ fontSize: 9, color: MUTED }}>Reports live in this browser only. Export, then merge into Assault.csv to share across devices.</div>
      </Section>
    )}

    <div style={{ height: 90 }} />
  </>)
}
