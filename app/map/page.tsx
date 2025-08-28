'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ImageTransformMap from '../components/ImageTransformMap';

export default function MapPage() {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Get the uploaded image URL from sessionStorage
    const imageUrl = sessionStorage.getItem('uploadedImageUrl');
    
    if (!imageUrl) {
      // No image uploaded, redirect back to landing page
      router.push('/');
      return;
    }

    setUploadedImageUrl(imageUrl);
    setIsLoading(false);
  }, [router]);

  const handleBackToUpload = () => {
    // Clear the stored image URL and go back to landing page
    sessionStorage.removeItem('uploadedImageUrl');
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

      {/* Map Component */}
      <ImageTransformMap initialImageUrl={uploadedImageUrl} />
    </main>
  );
}

