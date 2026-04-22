import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { intelligenceAPI } from '../../utils/api';

const HotspotMapPage = () => {
    const [hotspots, setHotspots] = useState([]);
    const [loading, setLoading] = useState(true);

    // Default center for the map
    const defaultCenter = [12.9716, 77.5946];

    useEffect(() => {
        const fetchHotspots = async () => {
            try {
                const res = await intelligenceAPI.getHotspots();
                
                // Extract the array whether Django paginates it or wraps it in a 'data' key
                const fetchedData = res.data.results ? res.data.results : (res.data.data ? res.data.data : res.data);
                
                // Ensure it is strictly an array before setting state
                if (Array.isArray(fetchedData)) {
                    setHotspots(fetchedData);
                } else {
                    console.warn("Hotspot data is not an array:", fetchedData);
                    setHotspots([]);
                }
            } catch (error) {
                console.error("Failed to load hotspots", error);
                setHotspots([]);
            } finally {
                setLoading(false);
            }
        };
        fetchHotspots();
    }, []);

    // Helper to color code the map blips based on incident count
    const getMarkerColor = (count) => {
        if (count >= 10) return '#ef4444'; // Red - High density
        if (count >= 5) return '#f59e0b';  // Orange - Medium density
        return '#3b82f6';                  // Blue - Low density
    };

    return (
        <div className="max-w-7xl mx-auto p-6 h-[85vh] flex flex-col">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-100">Live Crime Hotspots</h1>
                <p className="text-gray-400 mt-2">AI-driven clustering of incident reports.</p>
            </div>

            <div className="flex-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden relative z-0">
                {loading ? (
                    <div className="h-full w-full flex items-center justify-center text-gray-400">
                        Initializing Mapping Engine...
                    </div>
                ) : (
                    <MapContainer 
                        center={defaultCenter} 
                        zoom={11} 
                        style={{ height: '100%', width: '100%' }}
                    >
                        {/* Dark mode map tiles */}
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                        />
                        
                        {hotspots.map((spot, index) => (
                            <CircleMarker
                                key={index}
                                center={[spot.lat, spot.lng]}
                                radius={Math.max(10, (spot.incident_count || 1) * 2)}
                                pathOptions={{ 
                                    color: getMarkerColor(spot.incident_count || 1),
                                    fillColor: getMarkerColor(spot.incident_count || 1),
                                    fillOpacity: 0.6
                                }}
                            >
                                <Popup className="bg-gray-800 text-gray-100 border-gray-700">
                                    <div className="text-sm">
                                        <p className="font-bold border-b pb-1 mb-1">Zone Warning</p>
                                        <p>Incidents: {spot.incident_count}</p>
                                        <p>Avg Severity: {spot.severity_avg}/10</p>
                                    </div>
                                </Popup>
                            </CircleMarker>
                        ))}
                    </MapContainer>
                )}
            </div>
        </div>
    );
};

export default HotspotMapPage;