# Setup Instructions for Pencil Button Functionality

## Required Package Installation

To enable the polygon drawing functionality with the pencil button, you need to install the `leaflet-draw` package:

```bash
npm install leaflet-draw @types/leaflet-draw
```

## What's Already Implemented

The pencil button functionality has been fully implemented in `app/components/ImageTransformMap.tsx`:

✅ **CSS Import**: Added `leaflet-draw/dist/leaflet.draw.css`
✅ **Dynamic JS Loading**: Added `await import('leaflet-draw')`
✅ **Pencil Button**: ✏️ button in top-left corner
✅ **Drawing Mode Toggle**: Click to enable/disable polygon drawing
✅ **Image Editing Integration**: Automatically deselects image while drawing
✅ **Keyboard Shortcuts**: 
  - Press `D` to toggle drawing mode
  - Press `Escape` to cancel drawing mode
✅ **Visual Feedback**: Cursor changes to crosshair while drawing
✅ **Clean UX**: Exits drawing mode after completing a polygon

## Features

- **Single-purpose pencil button** that toggles polygon drawing mode
- **Polite coexistence** with distortable image editing
- **Automatic image deselection** while drawing to prevent conflicts
- **Keyboard shortcuts** for quick access
- **Visual feedback** with cursor changes
- **Clean integration** with existing Leaflet.draw infrastructure

## How It Works

1. Click the ✏️ button or press `D` to enter drawing mode
2. The image editing is automatically paused (deselected)
3. Draw your polygon by clicking points on the map
4. Complete the polygon by clicking the first point again
5. Drawing mode automatically exits and image editing resumes

## Troubleshooting

If you see TypeScript errors about `leaflet-draw` not being found:
1. Make sure you've run `npm install leaflet-draw @types/leaflet-draw`
2. Restart your TypeScript language server
3. The functionality will work at runtime even with TypeScript errors

## CSS Styling

The pencil button has minimal styling with a subtle hover effect:
- Hover brightness change for better UX
- Positioned in the top-left corner of the map
- Uses standard Leaflet control styling
