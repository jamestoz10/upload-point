'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as turf from '@turf/turf';

// CSS (OK to import in a client component)
import 'leaflet/dist/leaflet.css';
import 'leaflet-toolbar/dist/leaflet.toolbar.css';
import 'leaflet-distortableimage/dist/leaflet.distortableimage.css';
import 'leaflet-draw/dist/leaflet.draw.css';
// Note: Leaflet.draw CSS needs to be added via CDN or npm install
// You may need to add: <link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css" />

// Import Leaflet types
import type { Map, ImageOverlay, Layer } from 'leaflet';

interface ImageTransformMapProps {
  initialImageUrl?: string | null;
  postcode?: string | null;
  schoolType?: string | null;
  isEditingDisabled?: boolean;
  currentMode?: 'distort' | 'draw';
}

export interface ImageTransformMapRef {
  exportGeoJSON: () => void;
  hasConfiguredShapes: () => boolean;
}

const ImageTransformMap = forwardRef<ImageTransformMapRef, ImageTransformMapProps>(
  ({ initialImageUrl, postcode, schoolType, isEditingDisabled, currentMode = 'distort' }, ref) => {
  console.log('ImageTransformMap rendering', { initialImageUrl, postcode, schoolType, isEditingDisabled });
  const mapRef = useRef<Map | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);

  const LRef = useRef<typeof import('leaflet') | null>(null);
  const pluginsReadyRef = useRef(false);
  const currentImageRef = useRef<any>(null);
  const drawnItemsRef = useRef<any>(null);
  const drawControlRef = useRef<any>(null);

  // NEW: refs for draw toggle
  const isDrawingRef = useRef(false);
  const polygonDrawerRef = useRef<any>(null);
  const drawToggleControlRef = useRef<any>(null);
  const drawControlActiveRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');

  // --- Attributes form state ---
  const [showAttrForm, setShowAttrForm] = useState(false);
  const [activeLayer, setActiveLayer] = useState<any>(null);
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [roomSubTypes, setRoomSubTypes] = useState<string[]>([]);
  const [roomTypeSubTypeMap, setRoomTypeSubTypeMap] = useState<Record<string, string[]>>({});
  const [attrForm, setAttrForm] = useState({
    name: '',
    roomType: '',
    roomSubType: '',
    area: ''
  });

  // Load room types and sub types based on school type
  useEffect(() => {
    if (schoolType) {
      loadRoomData(schoolType);
    }
  }, [schoolType]);

  // Filter room sub types when room type changes
  useEffect(() => {
    if (attrForm.roomType && roomTypeSubTypeMap[attrForm.roomType]) {
      const availableSubTypes = roomTypeSubTypeMap[attrForm.roomType];
      setRoomSubTypes(availableSubTypes);
      console.log(`Room type "${attrForm.roomType}" selected, available sub types:`, availableSubTypes);
      
      // Reset room sub type if current selection is not valid for new room type
      if (!availableSubTypes.includes(attrForm.roomSubType)) {
        setAttrForm(prev => ({ ...prev, roomSubType: '' }));
        console.log('Reset room sub type - not valid for selected room type');
      }
    } else {
      setRoomSubTypes([]);
      setAttrForm(prev => ({ ...prev, roomSubType: '' }));
      console.log('No room type selected or no sub types available');
    }
  }, [attrForm.roomType, roomTypeSubTypeMap]);

  const loadRoomData = async (type: string) => {
    try {
      let csvFile = '';
      switch (type) {
        case 'primary':
          csvFile = '/Primary.csv';
          break;
        case 'secondary':
          csvFile = '/Secondary.csv';
          break;
        case 'special':
          csvFile = '/Special.csv';
          break;
        default:
          return;
      }

      console.log(`Loading room data from ${csvFile} for school type: ${type}`);
      const response = await fetch(csvFile);
      if (response.ok) {
        const csvText = await response.text();
        const lines = csvText.split('\n');
        const roomTypesSet = new Set<string>();
        const subTypesMap: Record<string, Set<string>> = {};
        
        // Skip header row and extract room types and sub types
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            const columns = line.split(',');
            if (columns.length >= 1) {
              const roomType = columns[0].replace(/"/g, '').trim();
              if (roomType) {
                roomTypesSet.add(roomType);
                if (!subTypesMap[roomType]) {
                  subTypesMap[roomType] = new Set<string>();
                }
              }
            }
            if (columns.length >= 2) {
              const roomSubType = columns[1].replace(/"/g, '').trim();
              if (roomSubType && columns[0]) {
                const roomType = columns[0].replace(/"/g, '').trim();
                if (roomType && subTypesMap[roomType]) {
                  subTypesMap[roomType].add(roomSubType);
                }
              }
            }
          }
        }
        
        // Convert to arrays
        const roomTypesArray = Array.from(roomTypesSet).sort();
        
        // Convert sub types map to arrays
        const subTypeMapArray: Record<string, string[]> = {};
        Object.keys(subTypesMap).forEach(roomType => {
          subTypeMapArray[roomType] = Array.from(subTypesMap[roomType]).sort();
        });
        
        console.log('Loaded room data:', {
          roomTypes: roomTypesArray,
          subTypeMap: subTypeMapArray,
          totalRoomTypes: roomTypesArray.length,
          totalSubTypes: Object.values(subTypeMapArray).flat().length
        });
        
        setRoomTypes(roomTypesArray);
        setRoomTypeSubTypeMap(subTypeMapArray);
        
        // Room data loaded successfully
      }
    } catch (error) {
      console.error('Error loading room data:', error);
      // Keep default room types on error
    }
  };

  // Function to calculate area using Turf.js for accurate geodesic measurements
  const calculateShapeArea = (layer: any): string => {
    try {
      // First, check if we already have a calculated area stored on the layer
      if (layer._turfArea !== undefined) {
        return layer._turfArea.toFixed(2);
      }
      
      // Use Turf.js to calculate accurate area from GeoJSON
      const geojson = layer.toGeoJSON();
      if (geojson) {
        const area = turf.area(geojson);
        // Store the calculated area on the layer for future use
        layer._turfArea = area;
        console.log('Calculated area with Turf.js:', area, 'm²');
        return area.toFixed(2);
      }
      
      return 'N/A';
    } catch (error) {
      console.warn('Could not calculate area with Turf.js:', error);
      return 'N/A';
    }
  };

  // Helper: attach attributes to a layer + popup
  const applyAttributesToLayer = (layer: any, attrs: {name?: string; roomType?: string; roomSubType?: string; area?: string}) => {
    // Ensure a GeoJSON feature holder exists
    if (!layer.feature) layer.feature = { type: 'Feature', properties: {} };
    
    // Calculate area if not provided
    let calculatedArea = attrs.area;
    if (!calculatedArea) {
      calculatedArea = calculateShapeArea(layer);
    }
    
    // Add timestamp when attributes are applied
    const timestamp = new Date().toISOString();
    const propertiesWithTimestamp = { 
      ...attrs, 
      area: calculatedArea,
      timestamp: timestamp,
      dateAdded: new Date(timestamp).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    };
    
    layer.feature.properties = { ...layer.feature.properties, ...propertiesWithTimestamp };

    // Nice popup content with edit button
    const html = `
      <div style="min-width: 200px">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: bold; color: #1F2937;">${attrs.name || 'Unnamed feature'}</div>
          <button 
            onclick="window.editFeatureData('${layer._leaflet_id}')"
            style="
              background: #3B82F6; 
              color: white; 
              border: none; 
              border-radius: 4px; 
              padding: 4px 6px; 
              cursor: pointer; 
              font-size: 12px;
              display: flex;
              align-items: center;
              gap: 4px;
            "
            title="Edit feature data"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
            Edit
          </button>
        </div>
        ${attrs.roomType ? `<div style="margin-bottom: 4px;"><strong>Room Type:</strong> ${attrs.roomType}</div>` : ''}
        ${attrs.roomSubType ? `<div style="margin-bottom: 4px;"><strong>Room Sub Type:</strong> ${attrs.roomSubType}</div>` : ''}
        <div style="margin-bottom: 4px;"><strong>Area:</strong> ${calculatedArea} m²</div>
        <div style="margin-top: 8px; padding: 8px; background: #F3F4F6; border-radius: 4px; font-size: 12px; color: #6B7280;">
          <strong>Added:</strong> ${propertiesWithTimestamp.dateAdded}
        </div>
      </div>
    `;
    layer.bindPopup(html);

    // Clicking the layer shows its info
    layer.off('click'); // avoid duplicates
    layer.on('click', () => {
      try { layer.openPopup(); } catch {}
    });
  };



  // Function to edit feature data (called from popup)
  const editFeatureData = (leafletId: string) => {
    if (!drawnItemsRef.current) return;
    
    let targetLayer: any = null;
    drawnItemsRef.current.eachLayer((layer: any) => {
      if (layer._leaflet_id === parseInt(leafletId)) {
        targetLayer = layer;
      }
    });
    
    if (targetLayer && targetLayer.feature?.properties) {
      const props = targetLayer.feature.properties;
      setActiveLayer(targetLayer);
      setAttrForm({
        name: props.name || '',
        roomType: props.roomType || '',
        roomSubType: props.roomSubType || '',
        area: props.area || ''
      });
      setShowAttrForm(true);
      
      // Close the popup
      try { targetLayer.closePopup(); } catch {}
    }
  };

  // Expose editFeatureData function globally for popup buttons
  useEffect(() => {
    (window as any).editFeatureData = editFeatureData;
    console.log('editFeatureData function exposed to window');
    
    return () => {
      delete (window as any).editFeatureData;
    };
  }, [editFeatureData]);

  // Optional: style by room type (tweak to taste)
  const styleLayerByRoomType = (layer: any, roomType: string) => {
    const colors: Record<string, string> = {
      // Primary school room types
      'Classroom Areas': '#EF4444',
      'Specialist Practical Areas': '#8B5CF6',
      'Hall Studio and Dining Areas': '#F59E0B',
      'Learning Resource Areas': '#10B981',
      'Teaching Storage Areas': '#6366F1',
      'Non Teaching Storage Areas': '#6B7280',
      'Kitchen Areas': '#DC2626',
      'Toilet Areas': '#059669',
      'Plant Areas': '#1F2937',
      'Circulation Areas': '#7C3AED',
      // Secondary school room types
      'ICT and Business Areas': '#2563EB',
      'Science Areas': '#7C2D12',
      'Creative Art Areas': '#BE185D',
      'Design and Tech Areas': '#059669',
      'PE Basic Teaching Areas': '#DC2626',
      'Art and DT Resource Areas': '#7C3AED',
      'SEN and Support Areas': '#F59E0B',
      // Special school room types
      'Classrooms': '#EF4444',
      'Practical Rooms': '#8B5CF6',
      'Halls, PE, Dining & Social': '#F59E0B',
      'Staff and Administration': '#2563EB',
      'Teaching Storage': '#6366F1',
      'Non-Teaching Storage': '#6B7280',
      'Toilets & Personal Care': '#059669',
      'Kitchen': '#DC2626',
      'Plant': '#1F2937',
      'Circulation': '#7C3AED',
      'Supplementary': '#6B7280',
    };
    
    // Use room type color if available, otherwise use a default color
    const color = roomType && colors[roomType] ? colors[roomType] : '#6B7280';
    if (layer.setStyle) layer.setStyle({ color, weight: 2 });
  };

  // Export all drawn shapes (with attributes) as GeoJSON
  const exportGeoJSON = () => {
    const L = LRef.current as any;
    if (!drawnItemsRef.current || !L) return;
    const gj = drawnItemsRef.current.toGeoJSON(); // includes each layer.feature.properties
    const blob = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawn-features.geojson';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check if we have any drawn shapes with properties
  const hasConfiguredShapes = () => {
    if (!drawnItemsRef.current) return false;
    let hasConfigured = false;
    drawnItemsRef.current.eachLayer((layer: any) => {
      if (layer.feature?.properties?.name || layer.feature?.properties?.roomType || layer.feature?.properties?.roomSubType) {
        hasConfigured = true;
      }
    });
    return hasConfigured;
  };

  // Function to geocode postcode to coordinates
  const geocodePostcode = async (postcode: string): Promise<[number, number] | null> => {
    try {
      // Using OpenStreetMap Nominatim API for geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(postcode)}&countrycodes=gb&limit=1`
      );
      
      if (!response.ok) {
        throw new Error('Geocoding request failed');
      }
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        return [lat, lon];
      }
      
      return null;
    } catch (error) {
      console.warn('Geocoding failed:', error);
      return null;
    }
  };

  // Helper: add image to map
  const addImageToMap = (imageUrl: string) => {
    const map = mapRef.current;
    const L = LRef.current;

    if (!map || !L || !pluginsReadyRef.current) {
      // Map or plugins not ready yet
      return;
    }

    // Remove existing image if present
    if (currentImageRef.current) {
      try {
        map.removeLayer(currentImageRef.current);
      } catch {
        // ignore
      }
      currentImageRef.current = null;
    }

    if (typeof (L as any).distortableImageOverlay === 'function') {
      // Get current map center and create bounds around it
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      // Create bounds around the center point for the image
      // Adjust the size based on zoom level to make image appropriately sized
      const latOffset = 0.005 / Math.pow(2, 15 - zoom); // Better size calculation
      const lngOffset = 0.005 / Math.pow(2, 15 - zoom);
      
      const bounds = [
        [center.lat - latOffset, center.lng - lngOffset] as [number, number],
        [center.lat + latOffset, center.lng + lngOffset] as [number, number]
      ];

      setDebugInfo(`Adding image at center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);

      // Create unselected; add first, then select when loaded
      const img = (L as any).distortableImageOverlay(imageUrl, {
        selected: false,
        mode: 'distort',
        suppressToolbar: false,
        bounds: bounds,
        actions: [
      // was Remove/Delete(s)       // was ToggleScale
          (L as any).FreeRotateAction,
          (L as any).DistortAction,     // new explicit action      // was ToggleRotate
          // optionally add FreeRotateAction:
          // (L as any).FreeRotateAction,
          (L as any).LockAction,        // handles lock/unlock
          (L as any).BorderAction,      // was ToggleOutline
          (L as any).OpacityAction,     // was ToggleTransparency
          (L as any).RestoreAction,
          // extras if you want:
          // (L as any).RevertAction,
          // (L as any).StackAction,
        ],
      });

      img.addTo(map);

      img.once('load', () => {
        try {
          // Only enable editing if not disabled
          if (!isEditingDisabled) {
            img.editing?.select?.();
            setDebugInfo(`Image loaded and selected at ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);

            // Optional extra tools (guarded)
            if ((L as any).RestoreAction && img.editing?.addTool) {
              img.editing.addTool((L as any).RestoreAction);
            }
            if ((L as any).StackAction && img.editing?.addTool) {
              img.editing.addTool((L as any).StackAction);
            }
          } else {
            setDebugInfo(`Image loaded in read-only mode at ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
          }
        } catch (e) {
          console.warn('Selecting / adding tools failed:', e);
        }
      });

      // Style toolbar popup when it appears
      img.on('editstart', () => {
        const popup = img?.editing?._popup;
        if (popup) {
          popup.options.className = (popup.options.className || '') + ' leaflet-toolbar-popup';
          popup.update();
        }


      });

      currentImageRef.current = img as L.DistortableImageOverlay;
    } else {
      // Fallback: plain image overlay at current center
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      // Create bounds around the center point
      const latOffset = 0.005 / Math.pow(2, 15 - zoom);
      const lngOffset = 0.005 / Math.pow(2, 15 - zoom);
      
      const bounds = [
        [center.lat - latOffset, center.lng - lngOffset] as [number, number],
        [center.lat + latOffset, center.lng + lngOffset] as [number, number]
      ];
      
      setDebugInfo(`Adding fallback image at center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);
      
      const img = L.imageOverlay(imageUrl, bounds).addTo(map);
      currentImageRef.current = img;
    }
  };

  // One-time init (Leaflet + plugins + map)
  useEffect(() => {
    console.log('ImageTransformMap useEffect triggered', { mapElRef: mapElRef.current, postcode });
    if (!mapElRef.current) {
      console.log('No mapElRef.current, returning early');
      return;
    }

    let cancelled = false;
    let onResize: (() => void) | null = null;

    (async () => {
      try {
        setDebugInfo('Loading Leaflet...');
        const LeafletMod = await import('leaflet');
        const L = (LeafletMod as any).default || LeafletMod;
        (window as any).L = L; // expose for plugins
        LRef.current = L;

        setDebugInfo('Loading plugins...');
        // Load plugins in order
        try {
          await import('leaflet-toolbar/dist/leaflet.toolbar.js');
        } catch (e) {
          console.warn('leaflet-toolbar load failed:', e);
        }

        try {
          // Some setups need explicit dist path:
          // await import('leaflet-distortableimage/dist/leaflet.distortableimage.js');
          await import('leaflet-distortableimage');
        } catch (e) {
          console.warn('leaflet-distortableimage load failed:', e);
        }

        // Load leaflet-draw for polygon drawing functionality
        try {
          await import('leaflet-draw');
        } catch (e) {
          console.warn('leaflet-draw load failed:', e);
        }

        if (cancelled) return;

        // Check plugins
        const hasToolbar2 = !!(L as any).Toolbar2;
        const hasDistortableImage = typeof (L as any).distortableImageOverlay === 'function';
        const hasDraw = !!(L as any).Draw;
        
        // For now, only require the essential plugins for image display
        // Leaflet.draw is optional for drawing functionality
        pluginsReadyRef.current = hasToolbar2 && hasDistortableImage;
        
        if (!hasDraw) {
          console.warn('Leaflet.draw not available - drawing features will be disabled');
        }

        setDebugInfo('Creating map...');
        
        // If we have a postcode, geocode it first to get the initial coordinates
        let initialCenter: [number, number] = [51.505, -0.09]; // London as fallback
        let initialZoom = 13;
        
        if (postcode) {
          setDebugInfo(`Geocoding postcode: ${postcode}...`);
          const coordinates = await geocodePostcode(postcode);
          if (coordinates) {
            const [lat, lon] = coordinates;
            initialCenter = [lat, lon];
            initialZoom = 15; // Street level zoom for postcode
            setDebugInfo(`Map will start at ${postcode} (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
          } else {
            setDebugInfo(`Could not geocode postcode: ${postcode}, using default location`);
          }
        }
        
        const map = L.map(mapElRef.current!, { 
          center: initialCenter, 
          zoom: initialZoom,
          zoomControl: false
        });
        mapRef.current = map;
        
        // Store map instance globally for popup access
        (window as any).currentMapInstance = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 20,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        // Optional keybindings helper (guarded)
        try {
          (L as any).distortableImage?.keymapper?.(map, { position: 'topleft' });
        } catch {
          // ignore
        }

        // Initialize Leaflet.draw for drawing tools (optional)
        try {
          if ((L as any).Draw) {
            // Create a FeatureGroup to store editable layers
            const drawnItems = new (L as any).FeatureGroup();
            map.addLayer(drawnItems);
            drawnItemsRef.current = drawnItems;
            
            // Store drawnItems on map for popup access
            map._drawnItems = drawnItems;

            // Initialize the draw control
            const drawControl = new (L as any).Control.Draw({
              draw: {
                // Drawing options
                polygon: {
                  allowIntersection: false,
                  drawError: {
                    color: '#e1e100',
                    message: '<strong>Oh snap!<strong> you can\'t draw that!'
                  },
                  shapeOptions: {
                    color: '#3B82F6'
                  }
                },
                polyline: {
                  shapeOptions: {
                    color: '#3B82F6'
                  }
                },
                rectangle: {
                  shapeOptions: {
                    color: '#10B981'
                  }
                },
                circle: {
                  shapeOptions: {
                    color: '#8B5CF6'
                  }
                },
                marker: {
                  icon: (L as any).divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color:#EF4444;width:12px;height:12px;display:block;left:-6px;top:-6px;position:relative;border-radius:12px;border:2px solid #FFFFFF;"></div>',
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                  })
                }
              },
              edit: {
                featureGroup: drawnItems,
                remove: true
              }
            });
            
            // Don't add the draw control initially - it will be added when switching to draw mode
            // map.addControl(drawControl);
            drawControlRef.current = drawControl;
            drawControlActiveRef.current = false; // Start with draw control hidden in distort mode

            // Listen for drawing events to capture area measurements with Turf.js
            map.on('draw:created', (e: any) => {
              const layer = e.layer;
              try {
                // Use Turf.js to calculate accurate area
                const geojson = layer.toGeoJSON();
                if (geojson) {
                  const area = turf.area(geojson);
                  layer._turfArea = area;
                  console.log('Turf.js calculated area for new layer:', area, 'm²');
                }
              } catch (error) {
                console.warn('Could not calculate area with Turf.js for new layer:', error);
              }
            });

            // Listen for drawing edits to recalculate area
            map.on('draw:edited', (e: any) => {
              e.layers.eachLayer((layer: any) => {
                try {
                  const geojson = layer.toGeoJSON();
                  if (geojson) {
                    const area = turf.area(geojson);
                    layer._turfArea = area;
                    console.log('Updated Turf.js area after edit:', area, 'm²');
                    
                    // Update popup if it exists
                    if (layer.getPopup()) {
                      const props = layer.feature?.properties;
                      if (props) {
                        // Update the area in properties and refresh popup
                        props.area = area.toFixed(2);
                        applyAttributesToLayer(layer, props);
                      }
                    }
                  }
                } catch (error) {
                  console.warn('Could not recalculate area after edit:', error);
                }
              });
            });

            // Optional: Live area calculation while drawing (for real-time feedback)
            map.on('draw:drawvertex', (e: any) => {
              try {
                // Get the current drawing layer if available
                const layers = e.layers._layers;
                if (layers && Object.keys(layers).length > 2) { // Need at least 3 points for area
                  const coords = Object.values(layers).map((marker: any) => [
                    marker.getLatLng().lng, 
                    marker.getLatLng().lat
                  ]);
                  
                  if (coords.length > 2) {
                    // Close the polygon ring for Turf.js
                    const closedCoords = [...coords, coords[0]];
                    const polygon = turf.polygon([closedCoords]);
                    const area = turf.area(polygon);
                    console.log('Live Turf.js area while drawing:', area, 'm²');
                  }
                }
              } catch (error) {
                // Silently ignore errors during live calculation
              }
            });

            // Ensure any existing/new layers show their info on click
            drawnItems.on('layeradd', (e: any) => {
              const layer = e.layer;
              if (!layer) return;
              
              // Calculate area with Turf.js if not already calculated
              if (layer._turfArea === undefined) {
                try {
                  const geojson = layer.toGeoJSON();
                  if (geojson) {
                    const area = turf.area(geojson);
                    layer._turfArea = area;
                    console.log('Calculated area with Turf.js for added layer:', area, 'm²');
                  }
                } catch (error) {
                  console.warn('Could not calculate area with Turf.js for added layer:', error);
                }
              }
              
              // If it already has properties, ensure popup is bound
              const props = layer.feature?.properties;
              if (props) applyAttributesToLayer(layer, props);
            });

            // Handle draw events
            map.on('draw:created', (e: any) => {
              const type = e.layerType;
              const layer = e.layer;
              
              // Add the drawn layer to the FeatureGroup
              drawnItemsRef.current?.addLayer(layer);
              
                              // Calculate area using Turf.js for accuracy
                const calculatedArea = calculateShapeArea(layer);
                
                // Store function to open form for this specific layer
                const openFormForLayer = () => {
                  setActiveLayer(layer);
                  setAttrForm({ 
                    name: '', 
                    roomType: '', 
                    roomSubType: '', 
                    area: calculatedArea !== 'N/A' ? calculatedArea : '' 
                  });
                  setShowAttrForm(true);
                  // Close the popup when opening the form
                  try { layer.closePopup(); } catch {}
                };
                
                // Store the function on the layer for the popup to access
                layer._openForm = openFormForLayer;
                
                // Automatically open the form
                openFormForLayer();

              // Give a temporary popup with edit button that calls the stored function
              const tempHtml = `
                <div style="margin: -8px; padding: 8px; text-align: center;">
                  <div style="margin-bottom: 6px; font-style: italic; color: #6B7280; font-size: 12px;">Complete the form</div>
                  <button 
                    onclick="
                      console.log('Edit button clicked for layer:', '${layer._leaflet_id}');
                      try {
                        // Find the layer using the drawItems reference and call its stored function
                        const map = window.currentMapInstance;
                        if (map && map._drawnItems) {
                          let foundLayer = null;
                          map._drawnItems.eachLayer(function(l) {
                            if (l._leaflet_id === ${layer._leaflet_id}) {
                              foundLayer = l;
                            }
                          });
                          if (foundLayer && foundLayer._openForm) {
                            foundLayer._openForm();
                            return;
                          }
                        }
                        // Fallback to global function
                        if (window.editFeatureData) {
                          window.editFeatureData('${layer._leaflet_id}');
                        }
                      } catch (e) {
                        console.error('Error opening form:', e);
                      }
                    "
                    style="
                      background: #3B82F6; 
                      color: white; 
                      border: none; 
                      border-radius: 4px; 
                      padding: 4px 8px; 
                      cursor: pointer; 
                      font-size: 11px;
                      display: flex;
                      align-items: center;
                      gap: 3px;
                      margin: 0 auto;
                    "
                    title="Complete feature details"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                    Edit
                  </button>
                </div>
              `;
              layer.bindPopup(tempHtml);
              
              console.log('Drawing created:', { type, layer });
            });

            map.on('draw:edited', (e: any) => {
              const layers = e.layers;
              layers.eachLayer((layer: any) => {
                console.log('Drawing edited:', layer);
              });
            });

            map.on('draw:deleted', (e: any) => {
              const layers = e.layers;
              layers.eachLayer((layer: any) => {
                console.log('Drawing deleted:', layer);
              });
            });

            setDebugInfo('Leaflet.draw initialized successfully');

            // --- DRAW HANDLER + TOGGLE BUTTON --------------------------------------
            // Temporarily commented out until leaflet-draw package is installed
            // We already created 'drawnItems' and 'drawControl' above when L.Draw exists.
            // Make a dedicated polygon handler we can enable/disable programmatically.
            /*
            if ((L as any).Draw) {
              polygonDrawerRef.current = new (L as any).Draw.Polygon(map, {
                showArea: true,
                shapeOptions: { color: '#F59E0B', weight: 2 }
              });

              // helper fns to toggle drawing
              const enableDrawing = () => {
                if (!polygonDrawerRef.current) return;
                isDrawingRef.current = true;
                // pause image editing while drawing
                try {
                  currentImageRef.current?.editing?.deselect?.();
                } catch {}
                polygonDrawerRef.current.enable();
                setDebugInfo('Drawing mode ON (polygon)');
                // visual cue
                (map.getContainer() as HTMLElement).style.cursor = 'crosshair';
              };

              const disableDrawing = () => {
                try {
                  polygonDrawerRef.current?.disable?.();
                } catch {}
                isDrawingRef.current = false;
                setDebugInfo('Drawing mode OFF');
                (map.getContainer() as HTMLElement).style.cursor = '';
                // resume image editing if allowed
                if (!isEditingDisabled) {
                  try { currentImageRef.current?.editing?.select?.(); } catch {}
                }
              };

              // Add a single-button Leaflet control (pencil icon)
              const DrawToggle = (L as any).Control.extend({
                options: { position: 'topleft' },
                onAdd: function () {
                  const container = L.DomUtil.create('div', 'leaflet-bar');
                  const btn = L.DomUtil.create('a', 'draw-toggle-btn', container);
                  btn.href = '#';
                  btn.title = 'Toggle polygon draw (D)';
                  btn.title = 'Toggle polygon draw (D)';
                  btn.setAttribute('role', 'button');
                  btn.style.width = '34px';
                  btn.style.height = '34px';
                  btn.style.lineHeight = '34px';
                  btn.style.textAlign = 'center';
                  btn.style.fontSize = '18px';
                  btn.innerHTML = '✏️';

                  // prevent map drag on click/drag
                  L.DomEvent.disableClickPropagation(container);
                  L.DomEvent.on(btn, 'click', (e: any) => {
                    L.DomEvent.preventDefault(e);
                    if (isDrawingRef.current) {
                      disableDrawing();
                    } else {
                      enableDrawing();
                    }
                  });

                  return container;
                }
              });

              const drawToggle = new DrawToggle();
              map.addControl(drawToggle);
              drawToggleControlRef.current = drawToggle;

              // Keyboard shortcut: D to toggle, Esc to cancel
              const keyHandler = (ev: KeyboardEvent) => {
                // only if map has focus in page
                if (!document.body.contains(map.getContainer())) return;
                if (ev.key.toLowerCase() === 'd') {
                  ev.preventDefault();
                  isDrawingRef.current ? disableDrawing() : enableDrawing();
                } else if (ev.key === 'Escape' && isDrawingRef.current) {
                  ev.preventDefault();
                  disableDrawing();
                }
              };
              document.addEventListener('keydown', keyHandler);

              // Clean up on unmount
              map.once('unload', () => document.removeEventListener('keydown', keyHandler));

              // When a shape is finished, add it to our FeatureGroup (you already do this),
              // then stay in draw mode or exit — here we exit to keep UX tidy:
              map.on('draw:created', (e: any) => {
                const layer = e.layer;
                drawnItemsRef.current?.addLayer(layer);
                disableDrawing();
              });
            }
            */
            // -----------------------------------------------------------------------
          }
        } catch (e) {
          console.warn('Leaflet.draw initialization failed:', e);
          setDebugInfo('Leaflet.draw not available');
        }

        // Ensure proper sizing
        requestAnimationFrame(() => map.invalidateSize());
        onResize = () => map.invalidateSize();
        window.addEventListener('resize', onResize);

        // Set initial mode state
        if (currentMode === 'draw') {
          drawControlActiveRef.current = true;
        }

        setMapReady(true);
        setDebugInfo('Map ready!');
        
      } catch (e) {
        console.error('Init error:', e);
        setDebugInfo('Init error');
      }
    })();

    return () => {
      cancelled = true;
      setMapReady(false);
      if (onResize) window.removeEventListener('resize', onResize);
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore
        }
        mapRef.current = null;
      }
    };
  }, [postcode]);

  // Add/replace image when URL becomes available and map/plugins are ready
  useEffect(() => {
    if (initialImageUrl && mapReady && pluginsReadyRef.current) {
      // Small delay to ensure map centering is complete
      const timer = setTimeout(() => {
        addImageToMap(initialImageUrl);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [initialImageUrl, mapReady, postcode]);

  // Handle mode switching
  useEffect(() => {
    if (!mapReady || !pluginsReadyRef.current) return;

    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    if (currentMode === 'distort') {
      // Enable distort mode - enable editing on the image
      if (currentImageRef.current && currentImageRef.current.editing) {
        try {
          currentImageRef.current.editing.enable();
          setDebugInfo(`Mode: ${currentMode.toUpperCase()} - Image editing enabled`);
        } catch (e) {
          console.warn('Failed to enable distort editing:', e);
        }
      }

      // Disable draw mode - hide draw controls
      if (drawControlRef.current && drawControlActiveRef.current) {
        try {
          map.removeControl(drawControlRef.current);
          drawControlActiveRef.current = false;
        } catch (e) {
          console.warn('Failed to remove draw controls:', e);
        }
      }

      // Reset cursor
      (map.getContainer() as HTMLElement).style.cursor = '';
    } else {
      // Enable draw mode - show draw controls
      if (drawControlRef.current && !drawControlActiveRef.current) {
        try {
          map.addControl(drawControlRef.current);
          drawControlActiveRef.current = true;
          setDebugInfo(`Mode: ${currentMode.toUpperCase()} - Drawing tools enabled`);
        } catch (e) {
          console.warn('Failed to add draw controls:', e);
        }
      }

      // Disable distort mode - disable editing on the image
      if (currentImageRef.current && currentImageRef.current.editing) {
        try {
          currentImageRef.current.editing.disable();
        } catch (e) {
          console.warn('Failed to disable distort editing:', e);
        }
      }

      // Set drawing cursor to hand (same as distort mode)
      (map.getContainer() as HTMLElement).style.cursor = 'grab';
    }
  }, [currentMode, mapReady]);

  useImperativeHandle(ref, () => ({
    exportGeoJSON: exportGeoJSON,
    hasConfiguredShapes: hasConfiguredShapes,
  }));

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div style={{ width: '100%', height: '100%' }}>
        {/* Attribute form overlay */}
        {showAttrForm && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 1000,
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 12,
              boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
              width: 240
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {activeLayer?.feature?.properties?.timestamp ? 'Edit Feature' : 'Feature Details'}
            </div>
            
            {activeLayer?.feature?.properties?.timestamp && (
              <div style={{ 
                fontSize: 11, 
                color: '#6B7280', 
                marginBottom: 12, 
                padding: 6, 
                background: '#F3F4F6', 
                borderRadius: 4,
                fontStyle: 'italic'
              }}>
                Created: {activeLayer.feature.properties.dateAdded}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Name</label>
            <input
              type="text"
              value={attrForm.name}
              onChange={(e) => setAttrForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g. Block A"
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8 }}
            />

            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Room Type</label>
            <select
              value={attrForm.roomType}
              onChange={(e) => setAttrForm((s) => ({ ...s, roomType: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8 }}
            >
              <option value="">Select Room Type</option>
              {roomTypes.map(roomType => (
                <option key={roomType} value={roomType}>{roomType}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Room Sub Type</label>
            <select
              value={attrForm.roomSubType}
              onChange={(e) => setAttrForm((s) => ({ ...s, roomSubType: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12, resize: 'vertical' }}
              disabled={!attrForm.roomType}
            >
              <option value="">{attrForm.roomType ? 'Select Room Sub Type' : 'Select Room Type first'}</option>
              {roomSubTypes.map(subType => (
                <option key={subType} value={subType}>{subType}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Area (m²)</label>
            <input
              type="text"
              value={attrForm.area}
              onChange={(e) => {
                // Allow only numbers, decimals, and backspace
                const value = e.target.value;
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setAttrForm((s) => ({ ...s, area: value }));
                }
              }}
              placeholder="e.g. 100.5"
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8 }}
            />
            <p style={{ fontSize: 11, color: '#6B7280', marginBottom: 12, fontStyle: 'italic' }}>
              Area is automatically calculated from your drawing. You can edit this value if needed.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  // If user cancels, keep layer but just close form
                  setShowAttrForm(false);
                  setActiveLayer(null);
                }}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!activeLayer) return;
                  
                  if (activeLayer.feature?.properties?.timestamp) {
                    // Editing existing feature - check if data has actually changed
                    const currentProps = activeLayer.feature.properties;
                    const hasChanged = 
                      currentProps.name !== attrForm.name ||
                      currentProps.roomType !== attrForm.roomType ||
                      currentProps.roomSubType !== attrForm.roomSubType ||
                      currentProps.area !== attrForm.area;
                    
                    let updatedProperties = {
                      ...activeLayer.feature.properties,
                      ...attrForm
                    };
                    
                    // Only add edit timestamp if data has actually changed
                    if (hasChanged) {
                      const editTimestamp = new Date().toISOString();
                      const editDate = new Date(editTimestamp).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      
                      updatedProperties = {
                        ...updatedProperties,
                        lastEdited: editTimestamp,
                        lastEditedDate: editDate
                      };
                      
                      console.log('Feature data changed, updating edit timestamp');
                    } else {
                      console.log('No changes detected, keeping original timestamps');
                    }
                    
                    // Update the feature properties
                    activeLayer.feature.properties = updatedProperties;
                    
                    // Update popup content
                    const updatedHtml = `
                      <div style="min-width: 200px">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                          <div style="font-weight: bold; color: #1F2937;">${attrForm.name || 'Unnamed feature'}</div>
                          <button 
                            onclick="window.editFeatureData('${activeLayer._leaflet_id}')"
                            style="
                              background: #3B82F6; 
                              color: white; 
                              border: none; 
                              border-radius: 4px; 
                              padding: 4px 6px; 
                              cursor: pointer; 
                              font-size: 12px;
                              display: flex;
                              align-items: center;
                              gap: 4px;
                            "
                            title="Edit feature data"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                            Edit
                          </button>
                        </div>
                        ${attrForm.roomType ? `<div style="margin-bottom: 4px;"><strong>Room Type:</strong> ${attrForm.roomType}</div>` : ''}
                        ${attrForm.roomSubType ? `<div style="margin-bottom: 4px;"><strong>Room Sub Type:</strong> ${attrForm.roomSubType}</div>` : ''}
                        <div style="margin-bottom: 4px;"><strong>Area:</strong> ${attrForm.area || 'N/A'} m²</div>
                        <div style="margin-top: 8px; padding: 8px; background: #F3F4F6; border-radius: 4px; font-size: 12px; color: #6B7280;">
                          <strong>Added:</strong> ${activeLayer.feature.properties.dateAdded}
                          ${updatedProperties.lastEditedDate ? `<br><strong>Last Edited:</strong> ${updatedProperties.lastEditedDate}` : ''}
                        </div>
                      </div>
                    `;
                    activeLayer.bindPopup(updatedHtml);
                  } else {
                    // New feature - apply attributes normally
                    applyAttributesToLayer(activeLayer, attrForm);
                  }
                  
                  // Apply styling even if no room type is selected (will use default color)
                  styleLayerByRoomType(activeLayer, attrForm.roomType || '');
                  try { activeLayer.openPopup(); } catch {}
                  setShowAttrForm(false);
                  setActiveLayer(null);
                }}
                style={{ padding: '8px 12px', borderRadius: 6, background: '#3B82F6', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                {activeLayer?.feature?.properties?.timestamp ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Map Container */}
        <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
});

export default ImageTransformMap;
