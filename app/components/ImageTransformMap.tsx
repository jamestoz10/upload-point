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
}

export default function ImageTransformMap({ initialImageUrl }: ImageTransformMapProps) {
  const mapRef = useRef<Map | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);

  const LRef = useRef<typeof import('leaflet') | null>(null);
  const pluginsReadyRef = useRef(false);
  const currentImageRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');



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
      // Create unselected; add first, then select when loaded
      const img = (L as any).distortableImageOverlay(imageUrl, {
        selected: false,
        mode: 'distort',
        suppressToolbar: false,
      });

      img.addTo(map);

      img.once('load', () => {
        try {
          img.editing?.select?.();

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
      // Fallback: plain image overlay
      const bounds = map.getBounds();
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
        const map = L.map(mapElRef.current!, { center: [51.505, -0.09], zoom: 13 });
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
  }, []);

  // Add/replace image when URL becomes available and map/plugins are ready
  useEffect(() => {
    if (initialImageUrl && mapReady && pluginsReadyRef.current) {
      addImageToMap(initialImageUrl);
    }
  }, [initialImageUrl, mapReady]);

  return (
    <div className="map-container">
      {/* Debug Info */}
      <div className="absolute top-4 right-4 z-[1000] bg-white p-3 rounded-lg shadow-lg border text-sm">
        <div className="text-gray-600">Status: {debugInfo}</div>
        {!pluginsReadyRef.current && (
          <div className="text-amber-600 mt-1">Plugins not attached yet…</div>
        )}
      </div>

      {/* Map Container */}
      <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
