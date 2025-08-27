declare module 'leaflet-distortableimage' {
  // This module extends Leaflet with distortableImageOverlay
  // The actual types are added to the global Leaflet namespace
}

declare module 'leaflet/dist/leaflet.css' {
  // CSS module declaration
}

declare module 'leaflet-distortableimage/dist/leaflet.distortableimage.css' {
  // CSS module declaration
}

declare module 'leaflet-toolbar/dist/leaflet.toolbar.css' {
  // CSS module declaration
}

declare module 'leaflet-toolbar/dist/leaflet.toolbar.js' {
  // JavaScript module declaration
}

// Extend the Leaflet namespace
declare namespace L {
  interface DistortableImageOverlayOptions {
    selected?: boolean;
    mode?: string;
    suppressToolbar?: boolean;
  }

  interface DistortableImageOverlay extends Layer {
    editing?: {
      select?: () => void;
      addTool?: (tool: any) => void;
      _popup?: Popup;
    };
    on(event: string, handler: Function): this;
    once(event: string, handler: Function): this;
    addTo(map: Map): this;
  }

  function distortableImageOverlay(
    imageUrl: string, 
    options?: DistortableImageOverlayOptions
  ): DistortableImageOverlay;

  interface Toolbar2 {
    // Toolbar interface
  }

  const Toolbar2: Toolbar2;

  interface DistortableImage {
    keymapper?: (map: Map, options: { position: string }) => void;
  }

  const distortableImage: DistortableImage;

  interface RestoreAction {
    // Restore action interface
  }

  const RestoreAction: RestoreAction;

  interface StackAction {
    // Stack action interface
  }

  const StackAction: StackAction;
}

