'use client';

import { useEffect, useRef } from 'react';

// Required CSS - these are safe to import
import 'leaflet/dist/leaflet.css';
import 'leaflet-toolbar/dist/leaflet.toolbar.css';
import 'leaflet-distortableimage/dist/leaflet.distortableimage.css';

export default function ImageTransformMap() {
  const mapRef = useRef<any>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);

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

      const map = L.default.map(mapElRef.current!, { center: [51.505, -0.09], zoom: 13 });
      mapRef.current = map;

      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // If you want to explicitly control which actions appear, pass `actions: [...]`
      // Otherwise, omit `actions` to use the plugin defaults (Distort, Drag, Scale, Rotate, FreeRotate, Lock, Opacity, Border, Export, Delete)
      const img = (L.default as any).distortableImageOverlay('/1st_planner_ltd_logo.jfif', {
        selected: true,          // show handles & popup toolbar immediately
        mode: 'distort',         // initial mode (matches demo)
        suppressToolbar: false,  // ensure the popup toolbar is shown
        // actions: [
        //   (L.default as any).DragAction,
        //   (L.default as any).ScaleAction,
        //   (L.default as any).DistortAction,
        //   (L.default as any).RotateAction,
        //   (L.default as any).FreeRotateAction,
        //   (L.default as any).LockAction,
        //   (L.default as any).OpacityAction,
        //   (L.default as any).BorderAction,
        //   (L.default as any).ExportAction,
        //   (L.default as any).DeleteAction,
        // ],
      }).addTo(map);

      // Ensure the toolbar popup has the right class so the CSS above applies
      const popup = img?.editing?._popup;
      if (popup) {
        popup.options.className = (popup.options.className || '') + ' leaflet-toolbar-popup';
        popup.update();
      }

      // Add-on tools (optional): Restore & Stack
      // These don't show by default; add them to the image's editor
      img.editing.addTool((L.default as any).RestoreAction);
      img.editing.addTool((L.default as any).StackAction);

      // Optional: show a keybinding legend control (top-left)
      (L.default as any).distortableImage
        .keymapper(map, { position: 'topleft' });

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

  return <div ref={mapElRef} style={{ width: '100%', height: '100dvh' }} />;
}

