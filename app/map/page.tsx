'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ImageTransformMap from '../components/ImageTransformMap';

export default function MapPage() {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [postcode, setPostcode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Get the uploaded image URL and postcode from sessionStorage
    const imageUrl = sessionStorage.getItem('uploadedImageUrl');
    const storedPostcode = sessionStorage.getItem('postcode');
    
    if (!imageUrl) {
      // No image uploaded, redirect back to landing page
      router.push('/');
      return;
    }

    setUploadedImageUrl(imageUrl);
    setPostcode(storedPostcode);
    setIsLoading(false);
  }, [router]);

  const handleBackToUpload = () => {
    // Clear the stored data and go back to landing page
    sessionStorage.removeItem('uploadedImageUrl');
    sessionStorage.removeItem('postcode');
    router.push('/');
  };

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
      {/* Back Button */}
      <button
        onClick={handleBackToUpload}
        className="absolute top-4 left-4 z-[10000] isolation-auto pointer-events-auto
                   inline-flex items-center gap-2 px-4 py-2 rounded-xl
                   bg-white/95 backdrop-blur border border-gray-200 shadow-lg
                   text-sm font-medium text-gray-800
                   hover:bg-white transition-all duration-200"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span>Back to Upload</span>
      </button>

      {/* Postcode Display */}
      {postcode && (
        <div className="absolute top-4 right-4 z-[10000] isolation-auto pointer-events-auto
                       inline-flex items-center gap-2 px-4 py-2 rounded-xl
                       bg-white/95 backdrop-blur border border-gray-200 shadow-lg
                       text-sm font-medium text-gray-800">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>Location: {postcode}</span>
        </div>
      )}

      {/* Map Component */}
      <ImageTransformMap initialImageUrl={uploadedImageUrl} postcode={postcode} />
    </main>
  );
}

