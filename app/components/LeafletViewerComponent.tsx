'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Required CSS - these are safe to import
import 'leaflet/dist/leaflet.css';
import 'leaflet-toolbar/dist/leaflet.toolbar.css';
import 'leaflet-distortableimage/dist/leaflet.distortableimage.css';

export default function LeafletViewerComponent() {
  const mapRef = useRef<any>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const imageOverlayRef = useRef<any>(null);

  // State for upload and drawing features
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<'road' | 'aerial'>('aerial');
  const [showPolygonTools, setShowPolygonTools] = useState(false);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [drawnPolygons, setDrawnPolygons] = useState<any[]>([]);
  const [polygonAreas, setPolygonAreas] = useState<Array<{ id: string; name: string; area: number; unit: string }>>([]);
  const [showPolygonNameDialog, setShowPolygonNameDialog] = useState(false);
  const [polygonName, setPolygonName] = useState('');
  const [polygonToName, setPolygonToName] = useState<{ polygon: any; area: number; unit: string } | null>(null);
  const [savedImages, setSavedImages] = useState<Array<{
    id: string;
    name: string;
    url: string;
    bounds: any;
    rotation: number;
    transparency: number;
    floorLevel: string;
    timestamp: number;
    polygons?: Array<{ 
      latlngs: Array<{ lat: number; lng: number }>;
      name?: string;
      area?: number;
      unit?: string;
    }>;
  }>>([]);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [imageName, setImageName] = useState('');
  const [selectedFloorLevel, setSelectedFloorLevel] = useState('ground-floor');

  // Initialize map with distortable image functionality
  useEffect(() => {
    if (!mapElRef.current) return;

    let cancelled = false;
    let onResize: (() => void) | null = null;
    
    (async () => {
      // Load Leaflet dynamically on the client side to avoid SSR issues
      const L = await import('leaflet');
      
      // Load plugins client-side in order
      await import('leaflet-toolbar' as any);
      await import('leaflet-distortableimage' as any);

      if (cancelled) return;

      const map = L.default.map(mapElRef.current!, { 
        center: [51.5074, -0.1278], 
        zoom: 13,
        zoomControl: true,
        attributionControl: true,
        preferCanvas: false
      });
      mapRef.current = map;

      // Add tile layers
      const roadLayer = L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      });

      const aerialLayer = L.default.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });

      // Start with aerial layer (default)
      aerialLayer.addTo(map);

      // Store layer references for switching
      mapRef.current.roadLayer = roadLayer;
      mapRef.current.aerialLayer = aerialLayer;

      // Fix: Invalidate size after the map is ready to prevent white band
      requestAnimationFrame(() => map.invalidateSize());

      // Keep it correct on window resizes too
      onResize = () => map.invalidateSize();
      window.addEventListener('resize', onResize);

      // Example: switch modes programmatically if needed
      // img.editing.setMode('freeRotate'); // or 'rotate' | 'scale' | 'distort'
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
      }
      // Clean up resize listener
      if (onResize) {
        window.removeEventListener('resize', onResize);
      }
    };
  }, []);

  // Function to handle file selection and upload
  const onFileChosen = async (f: File | null) => {
    setImageFile(f);
    
    if (!f) {
      // Clear image and reset states
      if (imageOverlayRef.current && mapRef.current) {
        mapRef.current.removeLayer(imageOverlayRef.current);
        imageOverlayRef.current = null;
      }
      setActiveImageId(null);
      setIsImageLoaded(false);
      setCurrentImageUrl(null);
      setShowPolygonTools(false);
      return;
    }

    if (!f.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, JPEG, etc.)');
      setImageFile(null);
      setShowPolygonTools(false);
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      alert('File too large. Please select an image under 10MB.');
      setImageFile(null);
      setShowPolygonTools(false);
      return;
    }

    try {
      setIsUploading(true);
      
      // Upload file to server
      const formData = new FormData();
      formData.append('file', f);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      const uploadResult = await response.json();
      
      // Store the server URL for saving later
      setCurrentImageUrl(uploadResult.url);
      
      // Show the image using distortable image overlay
      showImage(uploadResult.url);
      
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setImageFile(null);
      setIsImageLoaded(false);
      setShowPolygonTools(false);
    } finally {
      setIsUploading(false);
    }
  };

  // Function to show image using distortable image overlay
  const showImage = async (url: string) => {
    if (!mapRef.current) return;

    // Remove previous overlay if any
    if (imageOverlayRef.current) {
      mapRef.current.removeLayer(imageOverlayRef.current);
    }

    try {
      const L = await import('leaflet');
      
      // Create distortable image overlay with full toolbar
      const img = (L.default as any).distortableImageOverlay(url, {
        selected: true,          // show handles & popup toolbar immediately
        mode: 'distort',         // initial mode (matches demo)
        suppressToolbar: false,  // ensure the popup toolbar is shown
      }).addTo(mapRef.current);

      imageOverlayRef.current = img;
      setIsImageLoaded(true);

      // Ensure the toolbar popup has the right class so the CSS above applies
      const popup = img?.editing?._popup;
      if (popup) {
        popup.options.className = (popup.options.className || '') + ' leaflet-toolbar-popup';
        popup.update();
      }

      // Add-on tools (optional): Restore & Stack
      img.editing.addTool((L.default as any).RestoreAction);
      img.editing.addTool((L.default as any).StackAction);

      // Optional: show a keybinding legend control (top-left)
      (L.default as any).distortableImage
        .keymapper(mapRef.current, { position: 'topleft' });

      // Fit map to image bounds
      if (img.getBounds && typeof img.getBounds === 'function') {
        try {
          const bounds = img.getBounds();
          if (bounds && typeof bounds.pad === 'function') {
            mapRef.current.fitBounds(bounds.pad(0.1));
          } else {
            mapRef.current.fitBounds(bounds);
          }
        } catch (boundsError) {
          console.log('Could not fit bounds, using default view');
        }
      }

      // Show polygon tools
      setShowPolygonTools(true);
      
    } catch (error) {
      console.error('Error creating distortable overlay:', error);
      alert('Failed to load image. Please try again.');
    }
  };

  // Function to switch map style
  const switchMapStyle = (style: 'road' | 'aerial') => {
    const map = mapRef.current;
    if (!map) return;

    // Remove current layer
    if (mapStyle === 'road' && map.roadLayer) {
      map.removeLayer(map.roadLayer);
    } else if (mapStyle === 'aerial' && map.aerialLayer) {
      map.removeLayer(map.aerialLayer);
    }

    // Add new layer
    if (style === 'road' && map.roadLayer) {
      map.roadLayer.addTo(map);
    } else if (style === 'aerial' && map.aerialLayer) {
      map.aerialLayer.addTo(map);
    }

    setMapStyle(style);
  };

  // Polygon drawing functionality
  const startPolygonDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    setIsDrawingPolygon(true);
    
    // Change map cursor to indicate drawing mode
    const mapContainer = map.getContainer();
    mapContainer.style.cursor = 'crosshair';
    
    // Create a temporary polygon for drawing
    const L = require('leaflet');
    const tempPolygon = L.polygon([], {
      color: '#ff4444',
      weight: 3,
      opacity: 0.8,
      fillColor: '#ff4444',
      fillOpacity: 0.3
    });

    let points: any[] = [];
    
    const onMapClick = (e: any) => {
      points.push(e.latlng);
      tempPolygon.setLatLngs(points);
      
      if (points.length === 1) {
        tempPolygon.addTo(map);
      }
    };

    const onDoubleClick = () => {
      if (points.length >= 3) {
        // Finish the polygon
        const finalPolygon = L.polygon(points, {
          color: '#ff4444',
          weight: 3,
          opacity: 0.8,
          fillColor: '#ff4444',
          fillOpacity: 0.3
        });
        
        finalPolygon.addTo(map);
        setDrawnPolygons(prev => [...prev, finalPolygon]);
        
        // Calculate area (simplified)
        const area = Math.abs(points.reduce((acc, point, i) => {
          const nextPoint = points[(i + 1) % points.length];
          return acc + (point.lat * nextPoint.lng - nextPoint.lat * point.lng);
        }, 0) / 2);
        
        const areaData = { area: area.toFixed(2), unit: 'sq degrees' };
        
        // Add hover tooltip to the polygon
        finalPolygon.bindTooltip(
          `Area: ${areaData.area} ${areaData.unit}`,
          { 
            permanent: false, 
            direction: 'top',
            className: 'polygon-tooltip',
            offset: [0, -10]
          }
        );
        
        // Show polygon naming dialog
        setPolygonToName({ polygon: finalPolygon, area: parseFloat(areaData.area), unit: areaData.unit });
        setPolygonName('');
        setShowPolygonNameDialog(true);
        
        // Clean up
        map.off('click', onMapClick);
        map.off('dblclick', onDoubleClick);
        tempPolygon.remove();
        setIsDrawingPolygon(false);
        
        // Reset map cursor
        const mapContainer = map.getContainer();
        mapContainer.style.cursor = '';
      } else {
        alert('Polygon needs at least 3 points. Keep clicking to add more points.');
      }
    };

    map.on('click', onMapClick);
    map.on('dblclick', onDoubleClick);
  }, []);

  // Clear all polygons
  const clearAllPolygons = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    drawnPolygons.forEach(polygon => {
      if (map.hasLayer(polygon)) {
        map.removeLayer(polygon);
      }
    });
    setDrawnPolygons([]);
    setPolygonAreas([]);
  }, [drawnPolygons]);

  // Save polygon name
  const savePolygonName = useCallback(() => {
    if (!polygonToName || !polygonName.trim()) return;

    const newArea = {
      id: Date.now().toString(),
      name: polygonName.trim(),
      area: polygonToName.area,
      unit: polygonToName.unit
    };

    setPolygonAreas(prev => [...prev, newArea]);
    setShowPolygonNameDialog(false);
    setPolygonName('');
    setPolygonToName(null);
  }, [polygonToName, polygonName]);

  // Save image with metadata
  const saveImage = useCallback(() => {
    if (!currentImageUrl || !imageName.trim()) return;

    const newImage = {
      id: Date.now().toString(),
      name: imageName.trim(),
      url: currentImageUrl,
      bounds: imageOverlayRef.current?.getBounds() || null,
      rotation: 0, // Distortable image handles rotation internally
      transparency: 1.0, // Distortable image handles transparency internally
      floorLevel: selectedFloorLevel,
      timestamp: Date.now(),
      polygons: drawnPolygons.map((polygon, index) => {
        const area = polygonAreas.find(a => a.id === index.toString());
        return {
          latlngs: polygon.getLatLngs()[0].map((p: any) => ({ lat: p.lat, lng: p.lng })),
          name: area?.name || `Polygon ${index + 1}`,
          area: area?.area || 0,
          unit: area?.unit || 'sq degrees'
        };
      })
    };

    setSavedImages(prev => [...prev, newImage]);
    setShowSaveDialog(false);
    setImageName('');
    setSelectedFloorLevel('ground-floor');
  }, [currentImageUrl, imageName, selectedFloorLevel, drawnPolygons, polygonAreas]);

  // Load saved image
  const loadSavedImage = useCallback((savedImage: any) => {
    setActiveImageId(savedImage.id);
    showImage(savedImage.url);
    
    // Load polygons if any
    if (savedImage.polygons && savedImage.polygons.length > 0) {
      const L = require('leaflet');
      const loadedPolygons = savedImage.polygons.map((polyData: any) => {
        const polygon = L.polygon(polyData.latlngs, {
          color: '#ff4444',
          weight: 3,
          opacity: 0.8,
          fillColor: '#ff4444',
          fillOpacity: 0.3
        });
        
        polygon.bindTooltip(
          `Area: ${polyData.area} ${polyData.unit}`,
          { 
            permanent: false, 
            direction: 'top',
            className: 'polygon-tooltip',
            offset: [0, -10]
          }
        );
        
        return polygon;
      });
      
      setDrawnPolygons(loadedPolygons);
      setPolygonAreas(savedImage.polygons.map((p: any) => ({
        id: p.name,
        name: p.name,
        area: p.area,
        unit: p.unit
      })));
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Top Controls */}
      <div className="flex gap-2 items-center p-4 bg-white border-b border-gray-200 flex-wrap">
        {/* File Upload */}
        <input 
          type="file" 
          accept="image/*" 
          onChange={(e) => onFileChosen(e.target.files?.[0] || null)} 
          disabled={isUploading}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm disabled:opacity-50"
        />
        
        {/* Map Style Toggle */}
        <div className="flex gap-1">
          <button 
            onClick={() => switchMapStyle('aerial')}
            className={`px-3 py-2 rounded-md text-sm ${mapStyle === 'aerial' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Aerial
          </button>
          <button 
            onClick={() => switchMapStyle('road')}
            className={`px-3 py-2 rounded-md text-sm ${mapStyle === 'road' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Road
          </button>
        </div>

        {/* Polygon Tools */}
        {showPolygonTools && (
          <div className="flex gap-1">
            <button 
              onClick={startPolygonDrawing}
              disabled={isDrawingPolygon}
              className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
            >
              {isDrawingPolygon ? 'Drawing...' : 'Draw Polygon'}
            </button>
            <button 
              onClick={clearAllPolygons}
              className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
            >
              Clear Polygons
            </button>
          </div>
        )}

        {/* Save Button */}
        {isImageLoaded && (
          <button 
            onClick={() => setShowSaveDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Save Image
          </button>
        )}

        {/* Status */}
        {isUploading && (
          <span className="text-blue-600 text-sm">Uploading...</span>
        )}
      </div>

      {/* Map Container */}
      <div className="flex-1 relative">
        <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
        
        {/* Drawing Instructions */}
        {isDrawingPolygon && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-100 border border-blue-300 rounded-md p-3 text-sm">
            <p className="text-blue-800 font-medium">Drawing Polygon</p>
            <p className="text-blue-600">Click to add points, double-click to finish</p>
          </div>
        )}
      </div>

      {/* Right Sidebar - Saved Images */}
      <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Saved Images</h3>
        {savedImages.length === 0 ? (
          <p className="text-xs text-gray-400">Upload an image or GeoJSON file first</p>
        ) : (
          <div className="space-y-2">
            {savedImages.map((savedImage) => (
              <div 
                key={savedImage.id}
                className={`p-3 border rounded-md cursor-pointer hover:bg-gray-50 ${
                  activeImageId === savedImage.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
                onClick={() => loadSavedImage(savedImage)}
              >
                <h4 className="font-medium text-sm">{savedImage.name}</h4>
                <p className="text-xs text-gray-500">
                  {new Date(savedImage.timestamp).toLocaleDateString()}
                </p>
                {savedImage.polygons && savedImage.polygons.length > 0 && (
                  <p className="text-xs text-green-600">
                    {savedImage.polygons.length} polygon(s)
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Save Image</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image Name
                </label>
                <input
                  type="text"
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter image name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Floor Level
                </label>
                <select
                  value={selectedFloorLevel}
                  onChange={(e) => setSelectedFloorLevel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="ground-floor">Ground Floor</option>
                  <option value="first-floor">First Floor</option>
                  <option value="second-floor">Second Floor</option>
                  <option value="basement">Basement</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveImage}
                  disabled={!imageName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Polygon Name Dialog */}
      {showPolygonNameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Name Polygon</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Polygon Name
                </label>
                <input
                  type="text"
                  value={polygonName}
                  onChange={(e) => setPolygonName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter polygon name"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={savePolygonName}
                  disabled={!polygonName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowPolygonNameDialog(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
