'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ImageTransformMap from '../components/ImageTransformMap';
import { ImageTransformMapRef } from '../components/ImageTransformMap';

export default function MapPage() {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [postcode, setPostcode] = useState<string | null>(null);
  const [schoolType, setSchoolType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPencilBubble, setShowPencilBubble] = useState(false);
  const [currentMode, setCurrentMode] = useState<'distort' | 'draw'>('distort');
  const [hasShapes, setHasShapes] = useState(false);
  const router = useRouter();
  const mapRef = useRef<ImageTransformMapRef>(null);

  useEffect(() => {
    // Get the uploaded image URL, postcode, and school type from sessionStorage
    const imageUrl = sessionStorage.getItem('uploadedImageUrl');
    const storedPostcode = sessionStorage.getItem('postcode');
    const storedSchoolType = sessionStorage.getItem('schoolType');
    
    if (!imageUrl) {
      // No image uploaded, redirect back to landing page
      router.push('/');
      return;
    }

    setUploadedImageUrl(imageUrl);
    setPostcode(storedPostcode);
    setSchoolType(storedSchoolType);
    setIsLoading(false);
  }, [router]);

  const handleBackToUpload = () => {
    // Clear the stored data and go back to landing page
    sessionStorage.removeItem('uploadedImageUrl');
    sessionStorage.removeItem('postcode');
    sessionStorage.removeItem('schoolType');
    router.push('/');
  };

  const togglePencilBubble = () => {
    setShowPencilBubble(!showPencilBubble);
  };

  const handleModeToggle = () => {
    setCurrentMode(currentMode === 'distort' ? 'draw' : 'distort');
  };

  const handleExport = () => {
    mapRef.current?.exportGeoJSON();
  };

  // Check for configured shapes periodically
  useEffect(() => {
    if (currentMode === 'draw') {
      const checkShapes = () => {
        const hasConfigured = mapRef.current?.hasConfiguredShapes() || false;
        setHasShapes(hasConfigured);
      };
      
      // Check immediately and then every 2 seconds
      checkShapes();
      const interval = setInterval(checkShapes, 2000);
      
      return () => clearInterval(interval);
    } else {
      setHasShapes(false);
    }
  }, [currentMode]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="map-scope h-screen relative">
      {/* Back Button and Pencil Bubble */}
      <div className="absolute top-4 left-20 z-[10000] isolation-auto pointer-events-auto flex items-center gap-3">
        <button
          onClick={handleBackToUpload}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                     bg-white/95 backdrop-blur border border-gray-200 shadow-lg
                     text-sm font-medium text-gray-800
                     hover:bg-white transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to Upload</span>
        </button>

        {/* Mode Toggle Bubble */}
        <button
          onClick={handleModeToggle}
          className={`inline-flex items-center justify-center w-10 h-10 rounded-full
                     backdrop-blur border shadow-lg transition-all duration-200 hover:scale-105
                     ${currentMode === 'distort' 
                       ? 'bg-blue-500/95 border-blue-300 text-white hover:bg-blue-600/95' 
                       : 'bg-green-500/95 border-green-300 text-white hover:bg-green-600/95'
                     }`}
          title={currentMode === 'distort' ? 'Switch to Draw Mode' : 'Switch to Distort Mode'}
        >
          {currentMode === 'distort' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
            </svg>
          )}
        </button>

        {/* Pencil Bubble */}
        {showPencilBubble && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl
                         bg-blue-100 border border-blue-200 shadow-lg
                         text-sm font-medium text-blue-800 animate-pulse">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>Edit Mode</span>
          </div>
        )}
      </div>

      {/* Postcode Display and Export Button */}
      {postcode && (
        <div className="absolute top-4 right-4 z-[10000] isolation-auto pointer-events-auto flex items-center gap-3">
          {/* Export GeoJSON Button - only show in draw mode with configured shapes */}
          {currentMode === 'draw' && hasShapes && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl
                         bg-gray-800/95 backdrop-blur border border-gray-700 shadow-lg
                         text-sm font-medium text-white hover:bg-gray-700/95 transition-all duration-200"
              title="Export drawn shapes as GeoJSON"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export</span>
            </button>
          )}

          {/* Postcode Display */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                         bg-white/95 backdrop-blur border border-gray-200 shadow-lg
                         text-sm font-medium text-gray-800">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Location: {postcode}</span>
          </div>
        </div>
      )}

      {/* Map Component */}
      <ImageTransformMap 
        initialImageUrl={uploadedImageUrl} 
        postcode={postcode} 
        schoolType={schoolType}
        currentMode={currentMode}
        ref={mapRef}
      />


    </main>
  );
}

