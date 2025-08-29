'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

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
  isEditingDisabled?: boolean;
  currentMode?: 'distort' | 'draw';
}

export interface ImageTransformMapRef {
  exportGeoJSON: () => void;
  hasConfiguredShapes: () => boolean;
}

const ImageTransformMap = forwardRef<ImageTransformMapRef, ImageTransformMapProps>(
  ({ initialImageUrl, postcode, isEditingDisabled, currentMode = 'distort' }, ref) => {
  console.log('ImageTransformMap rendering', { initialImageUrl, postcode, isEditingDisabled });
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
  const [attrForm, setAttrForm] = useState({
    name: '',
    category: 'Site boundary',
    notes: ''
  });

  // Helper: attach attributes to a layer + popup
  const applyAttributesToLayer = (layer: any, attrs: {name?: string; category?: string; notes?: string}) => {
    // Ensure a GeoJSON feature holder exists
    if (!layer.feature) layer.feature = { type: 'Feature', properties: {} };
    layer.feature.properties = { ...layer.feature.properties, ...attrs };

    // Nice popup content
    const html = `
      <div style="min-width: 180px">
        <div><strong>${attrs.name || 'Unnamed feature'}</strong></div>
        <div>Category: ${attrs.category || '-'}</div>
        ${attrs.notes ? `<div style="margin-top:6px">${attrs.notes}</div>` : ''}
      </div>
    `;
    layer.bindPopup(html);

    // Clicking the layer shows its info
    layer.off('click'); // avoid duplicates
    layer.on('click', () => {
      try { layer.openPopup(); } catch {}
    });
  };

  // Optional: style by category (tweak to taste)
  const styleLayerByCategory = (layer: any, category: string) => {
    const colors: Record<string, string> = {
      'Site boundary': '#3B82F6',
      'Building': '#10B981',
      'Playground': '#F59E0B',
      'Car park': '#8B5CF6',
    };
    const color = colors[category] || '#3B82F6';
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
      if (layer.feature?.properties?.name || layer.feature?.properties?.category) {
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

            // Ensure any existing/new layers show their info on click
            drawnItems.on('layeradd', (e: any) => {
              const layer = e.layer;
              if (!layer) return;
              // If it already has properties, ensure popup is bound
              const props = layer.feature?.properties;
              if (props) applyAttributesToLayer(layer, props);
            });

            // Handle draw events
            map.on('draw:created', (e: any) => {
              const type = e.layerType;
              const layer = e.layer;
              
              // Add the drawn layer to the FeatureGroup
              drawnItems.addLayer(layer);
              
              // Open the attribute form
              setActiveLayer(layer);
              setAttrForm({ name: '', category: 'Site boundary', notes: '' });
              setShowAttrForm(true);

              // Optional: give a temporary popup hint
              layer.bindPopup('<em>Fill in details using the form…</em>');
              
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
    <div style={{ width: '100%', height: '100%', border: '2px solid red' }}>
      <div style={{ width: '100%', height: '100%', border: '2px solid blue' }}>
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
              width: 280
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Feature details</div>

            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Name</label>
            <input
              type="text"
              value={attrForm.name}
              onChange={(e) => setAttrForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g. Block A"
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8 }}
            />

            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Category</label>
            <select
              value={attrForm.category}
              onChange={(e) => setAttrForm((s) => ({ ...s, category: e.target.value }))}
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 8 }}
            >
              <option>Site boundary</option>
              <option>Building</option>
              <option>Playground</option>
              <option>Car park</option>
              <option>Other</option>
            </select>

            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Notes</label>
            <textarea
              value={attrForm.notes}
              onChange={(e) => setAttrForm((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Any extra info…"
              rows={3}
              style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12, resize: 'vertical' }}
            />

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
                  applyAttributesToLayer(activeLayer, attrForm);
                  styleLayerByCategory(activeLayer, attrForm.category);
                  try { activeLayer.openPopup(); } catch {}
                  setShowAttrForm(false);
                  setActiveLayer(null);
                }}
                style={{ padding: '8px 12px', borderRadius: 6, background: '#3B82F6', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Map Container */}
        <div ref={mapElRef} style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0', border: '2px solid green' }} />
      </div>
    </div>
  );
});

export default ImageTransformMap;
