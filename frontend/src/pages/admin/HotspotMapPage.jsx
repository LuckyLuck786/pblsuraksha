import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { intelligenceAPI } from '../../utils/api';

// ── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_CENTER = [12.9716, 77.5946]; // Bangalore

const PRIORITY_COLORS = {
  critical: { fill: '#dc2626', stroke: '#991b1b', label: 'Critical' },
  high:     { fill: '#ea580c', stroke: '#9a3412', label: 'High' },
  medium:   { fill: '#d97706', stroke: '#92400e', label: 'Medium' },
  low:      { fill: '#16a34a', stroke: '#14532d', label: 'Low' },
};

const CATEGORY_ICONS = {
  theft: '🔓', assault: '⚠️', harassment: '🚫', traffic: '🚗',
  fraud: '💳', cybercrime: '💻', domestic: '🏠', missing_person: '👤',
  drug_activity: '💊', vandalism: '🔨', noise: '🔊', other: '📌',
};

const STATUS_COLORS = {
  pending: '#f59e0b', acknowledged: '#3b82f6', in_progress: '#8b5cf6',
  resolved: '#22c55e', closed: '#6b7280', rejected: '#ef4444',
};

// ── Map auto-fit helper ──────────────────────────────────────────────────────
function MapFitter({ pins, hotspots }) {
  const map = useMap();
  useEffect(() => {
    const coords = [
      ...pins.map(p => [p.lat, p.lon]),
      ...hotspots.map(h => [h.lat, h.lon]),
    ];
    if (coords.length > 0) {
      try { map.fitBounds(coords, { padding: [40, 40], maxZoom: 14 }); } catch {}
    }
  }, [pins, hotspots, map]);
  return null;
}

// ── Main Component ───────────────────────────────────────────────────────────
const HotspotMapPage = () => {
  const [mapData, setMapData]       = useState({ pins: [], hotspots: [], total_with_coords: 0, total_complaints: 0, category_counts: [] });
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState('both');      // 'pins' | 'hotspots' | 'both'
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedPin, setSelectedPin]       = useState(null);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const refreshRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await intelligenceAPI.getMapData();
      setMapData(res.data);
    } catch {
      setMapData({ pins: [], hotspots: [], total_with_coords: 0, total_complaints: 0, category_counts: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    refreshRef.current = setInterval(fetchData, 60000); // refresh every 60s
    return () => clearInterval(refreshRef.current);
  }, [fetchData]);

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredPins = mapData.pins.filter(p => {
    if (categoryFilter && p.category !== categoryFilter) return false;
    if (priorityFilter && p.priority !== priorityFilter) return false;
    return true;
  });

  const criticalZones = mapData.hotspots.filter(h => h.risk_level === 'high').length;
  const categories = [...new Set(mapData.pins.map(p => p.category))].sort();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-100 overflow-hidden">

      {/* ── Sidebar ── */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden flex-shrink-0`}>
        <div className="w-80 h-full bg-white border-r border-slate-200 flex flex-col shadow-sm overflow-y-auto">

          {/* Header */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-5">
            <h1 className="text-white font-bold text-lg flex items-center gap-2">
              <span>🗺️</span> Crime Intelligence Map
            </h1>
            <p className="text-slate-400 text-xs mt-1">Live incident tracking · Auto-refreshes every 60s</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 border-b border-slate-200">
            {[
              { label: 'Total Reports', value: mapData.total_complaints, color: 'text-slate-700' },
              { label: 'Mapped Pins', value: mapData.total_with_coords, color: 'text-blue-600' },
              { label: 'Critical Zones', value: criticalZones, color: 'text-red-600' },
              { label: 'Hotspot Clusters', value: mapData.hotspots.length, color: 'text-orange-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg p-2.5 border border-slate-200 text-center">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="p-3 border-b border-slate-200 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filters</p>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.replace('_', ' ')}</option>
              ))}
            </select>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">All Priorities</option>
              {Object.entries(PRIORITY_COLORS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            {/* Layer toggle */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Layers</p>
              <div className="flex gap-1">
                {[['both','Both'],['pins','Pins Only'],['hotspots','Zones Only']].map(([val, label]) => (
                  <button key={val} onClick={() => setView(val)}
                    className={`flex-1 text-xs py-1.5 rounded-md border transition font-medium ${view === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Hotspot ranking */}
          {mapData.hotspots.length > 0 && (
            <div className="p-3 border-b border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Top Risk Zones
              </p>
              <ul className="space-y-1.5">
                {mapData.hotspots.slice(0, 6).map((h, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded-md p-2 border border-slate-100">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${h.risk_level === 'high' ? 'bg-red-500' : 'bg-orange-400'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 truncate">
                        {CATEGORY_ICONS[h.top_category]} {h.top_category?.replace('_', ' ')}
                      </p>
                      <p className="text-slate-400">{h.incident_count} incidents · sev {h.severity_avg}/10</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${h.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {h.risk_level}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Selected pin detail */}
          {selectedPin && (
            <div className="p-3 border-b border-slate-200 bg-blue-50">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs font-bold text-blue-700 uppercase">Selected Incident</p>
                <button onClick={() => setSelectedPin(null)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">{selectedPin.title}</p>
              <p className="text-xs text-slate-500 mb-2">{selectedPin.location}</p>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: PRIORITY_COLORS[selectedPin.priority]?.fill + '22', color: PRIORITY_COLORS[selectedPin.priority]?.fill }}>
                  {selectedPin.priority?.toUpperCase()}
                </span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {selectedPin.status?.replace('_', ' ')}
                </span>
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  Score: {selectedPin.severity_score}/10
                </span>
              </div>
              {selectedPin.ai_summary && (
                <p className="text-xs text-blue-600 italic mt-2">{selectedPin.ai_summary}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">{selectedPin.created_at}</p>
            </div>
          )}

          {/* Legend */}
          <div className="p-3 mt-auto">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Legend</p>
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 font-medium">Priority Pins</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(PRIORITY_COLORS).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: v.fill }} />
                    {v.label}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-2">Hotspot Zones</p>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded-full border-2 flex-shrink-0 opacity-60" style={{ background: '#fee2e2', borderColor: '#dc2626' }} />
                  High Risk
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded-full border-2 flex-shrink-0 opacity-60" style={{ background: '#fef3c7', borderColor: '#d97706' }} />
                  Medium Risk
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Map Area ── */}
      <div className="flex-1 relative">
        {/* Top bar */}
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2 pointer-events-none">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="pointer-events-auto bg-white rounded-lg shadow-md border border-slate-200 p-2 hover:bg-slate-50 transition"
            title={sidebarOpen ? 'Hide panel' : 'Show panel'}
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="pointer-events-auto bg-white rounded-lg shadow-md border border-slate-200 px-4 py-2 flex items-center gap-3 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-slate-600 font-medium">
              {filteredPins.length} incident{filteredPins.length !== 1 ? 's' : ''} visible
              {(categoryFilter || priorityFilter) && ' (filtered)'}
            </span>
          </div>

          <button
            onClick={fetchData}
            className="pointer-events-auto ml-auto bg-white rounded-lg shadow-md border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Map */}
        {loading ? (
          <div className="h-full flex items-center justify-center bg-slate-100">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Loading map data...</p>
            </div>
          </div>
        ) : (
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={11}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            {/* ✅ LIGHT MAP TILES */}
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
              subdomains="abcd"
              maxZoom={19}
            />

            {/* Auto-fit map to markers when data loads */}
            {(filteredPins.length > 0 || mapData.hotspots.length > 0) && (
              <MapFitter pins={filteredPins} hotspots={mapData.hotspots} />
            )}

            {/* ── Hotspot Zone Circles ── */}
            {(view === 'hotspots' || view === 'both') && mapData.hotspots.map((spot, i) => {
              const isHigh = spot.risk_level === 'high';
              return (
                <CircleMarker
                  key={`hs-${i}`}
                  center={[spot.lat, spot.lon]}
                  radius={Math.max(24, spot.incident_count * 6)}
                  pathOptions={{
                    color: isHigh ? '#dc2626' : '#d97706',
                    fillColor: isHigh ? '#fee2e2' : '#fef3c7',
                    fillOpacity: 0.45,
                    weight: 2,
                    dashArray: isHigh ? '' : '6 4',
                  }}
                >
                  <Popup>
                    <div className="text-sm min-w-[180px]">
                      <p className="font-bold text-slate-800 border-b pb-1 mb-2 flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${isHigh ? 'bg-red-500' : 'bg-orange-400'}`} />
                        {isHigh ? '🔴 High Risk Zone' : '🟠 Medium Risk Zone'}
                      </p>
                      <div className="space-y-1 text-slate-600">
                        <p><span className="font-semibold">Incidents:</span> {spot.incident_count}</p>
                        <p><span className="font-semibold">Avg Severity:</span> {spot.severity_avg}/10</p>
                        <p><span className="font-semibold">Top Type:</span> {CATEGORY_ICONS[spot.top_category]} {spot.top_category?.replace('_', ' ')}</p>
                        <p className="text-xs text-slate-400 capitalize">Risk: {spot.risk_level}</p>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* ── Individual Complaint Pins ── */}
            {(view === 'pins' || view === 'both') && filteredPins.map((pin, i) => {
              const pc = PRIORITY_COLORS[pin.priority] || PRIORITY_COLORS.low;
              return (
                <CircleMarker
                  key={`pin-${i}`}
                  center={[pin.lat, pin.lon]}
                  radius={8}
                  pathOptions={{
                    color: pc.stroke,
                    fillColor: pc.fill,
                    fillOpacity: 0.9,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => setSelectedPin(pin),
                  }}
                >
                  <Popup>
                    <div className="text-sm min-w-[220px]">
                      <div className="flex items-start justify-between gap-2 border-b pb-2 mb-2">
                        <div>
                          <p className="font-bold text-slate-800 leading-tight">{pin.title}</p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{pin.complaint_id}</p>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: pc.fill + '22', color: pc.fill }}>
                          {pin.priority?.toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600">
                        <p>{CATEGORY_ICONS[pin.category]} <span className="capitalize">{pin.category?.replace('_', ' ')}</span></p>
                        <p>📍 {pin.location}</p>
                        <p>⚡ Severity: <span className="font-semibold text-indigo-600">{pin.severity_score}/10</span></p>
                        <p className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[pin.status] }} />
                          {pin.status?.replace('_', ' ')}
                        </p>
                        {pin.ai_summary && (
                          <p className="italic text-blue-600 pt-1 border-t border-slate-100">{pin.ai_summary}</p>
                        )}
                        <p className="text-slate-400 pt-1">{pin.created_at}</p>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}

        {/* No coords notice */}
        {!loading && mapData.total_complaints > 0 && mapData.total_with_coords === 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 shadow-md text-sm text-amber-800 flex items-center gap-2">
            <span>⚠️</span>
            <span>{mapData.total_complaints} complaints exist but none have GPS coordinates yet. Add lat/lon when filing complaints to see pins.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default HotspotMapPage;
