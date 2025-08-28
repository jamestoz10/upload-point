'use client';

import { useEffect, useRef, useState } from 'react';

// CSS (OK to import in a client component)
import 'leaflet/dist/leaflet.css';
import 'leaflet-toolbar/dist/leaflet.toolbar.css';
import 'leaflet-distortableimage/dist/leaflet.distortableimage.css';

// Import Leaflet types
import type { Map, ImageOverlay, Layer } from 'leaflet';

interface ImageTransformMapProps {
  initialImageUrl?: string | null;
  postcode?: string | null;
}

export default function ImageTransformMap({ initialImageUrl, postcode }: ImageTransformMapProps) {
  const mapRef = useRef<Map | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);

  const LRef = useRef<typeof import('leaflet') | null>(null);
  const pluginsReadyRef = useRef(false);
  const currentImageRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');

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
          img.editing?.select?.();
          setDebugInfo(`Image loaded and selected at ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`);

          // Optional extra tools (guarded)
          if ((L as any).RestoreAction && img.editing?.addTool) {
            img.editing.addTool((L as any).RestoreAction);
          }
          if ((L as any).StackAction && img.editing?.addTool) {
            img.editing.addTool((L as any).StackAction);
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
    if (!mapElRef.current) return;

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
          // console.log('leaflet-toolbar loaded');
        } catch (e) {
          console.warn('leaflet-toolbar load failed:', e);
        }

        try {
          // Some setups need explicit dist path:
          // await import('leaflet-distortableimage/dist/leaflet.distortableimage.js');
          await import('leaflet-distortableimage');
          // console.log('leaflet-distortableimage loaded');
        } catch (e) {
          console.warn('leaflet-distortableimage load failed:', e);
        }

        if (cancelled) return;

        // Check plugins
        pluginsReadyRef.current =
          !!(L as any).Toolbar2 && typeof (L as any).distortableImageOverlay === 'function';

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

        // Ensure proper sizing
        requestAnimationFrame(() => map.invalidateSize());
        onResize = () => map.invalidateSize();
        window.addEventListener('resize', onResize);

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

  return (
    <div className="map-container">
      {/* Map Container */}
      <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
