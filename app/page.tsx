'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type FileType = 'image' | 'document' | 'other';

export default function LandingPage() {
  const [selectedFileType, setSelectedFileType] = useState<FileType>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [postcode, setPostcode] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const router = useRouter();

  const handleFileTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = event.target.value as FileType;
    setSelectedFileType(newType);
    setSelectedFile(null);
    setPostcode('');
    setUploadedImageUrl(null);
    setUploadError(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type based on selection
      if (selectedFileType === 'image') {
        const allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        if (!allowedImageTypes.includes(file.type)) {
          setUploadError('Please select a valid image file (PNG, JPG, JPEG, WEBP, or GIF)');
          return;
        }
      }
      
      setSelectedFile(file);
      setUploadError(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    // For images, require postcode
    if (selectedFileType === 'image' && !postcode.trim()) {
      setUploadError('Please enter a postcode for image files');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('fileType', selectedFileType);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any)?.error || 'Upload failed');
      }

      const data = await response.json();
      
      if (selectedFileType === 'image') {
        setUploadedImageUrl(data.url);
      } else {
        // For non-image files, show success message but don't proceed to map
        setUploadError('File uploaded successfully! Image files are required for map transformation.');
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinue = () => {
    if (uploadedImageUrl && selectedFileType === 'image' && postcode.trim()) {
      // Store the image URL and postcode in sessionStorage and navigate to map
      sessionStorage.setItem('uploadedImageUrl', uploadedImageUrl);
      sessionStorage.setItem('postcode', postcode.trim());
      router.push('/map');
    }
  };

  const getFileTypeDescription = () => {
    switch (selectedFileType) {
      case 'image':
        return 'PNG, JPG, JPEG, WEBP, GIF up to 10MB';
      case 'document':
        return 'PDF, DOC, DOCX up to 10MB';
      case 'other':
        return 'Any file type up to 10MB';
      default:
        return '';
    }
  };

  const getAcceptTypes = () => {
    switch (selectedFileType) {
      case 'image':
        return 'image/*';
      case 'document':
        return '.pdf,.doc,.docx';
      case 'other':
        return '*/*';
      default:
        return '';
    }
  };

  return (
    <main className="landing-scope min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-red-50 px-6">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
              CAD Upload
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-red-600">
                Point
              </span>
            </h1>
            <p className="text-lg text-gray-600">Upload a file to get started with transformation tools</p>
          </div>

          {/* File Type Selection */}
          <div className="mb-6">
            <label htmlFor="file-type" className="block text-sm font-medium text-gray-700 mb-2">
              Select File Type
            </label>
            <select
              id="file-type"
              value={selectedFileType}
              onChange={handleFileTypeChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="image">Image File</option>
              <option value="document">Document File</option>
              <option value="other">Other File</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {selectedFileType === 'image' 
                ? 'Image files can be transformed on the map' 
                : 'Non-image files will be uploaded but cannot be transformed on the map'
              }
            </p>
          </div>

          {/* Postcode Input - Only show for images */}
          {selectedFileType === 'image' && (
            <div className="mb-6">
              <label htmlFor="postcode" className="block text-sm font-medium text-gray-700 mb-2">
                Postcode <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Enter postcode (e.g., SW1A 1AA)"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                This will center your image on the map at the specified location
              </p>
            </div>
          )}

          {/* File Upload Area */}
          <div className="space-y-6">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors duration-200">
              <input
                type="file"
                accept={getAcceptTypes()}
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={isUploading}
              />
              <label htmlFor="file-upload" className="cursor-pointer block">
                <div className="space-y-4">
                  <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-100 to-red-100 rounded-full flex items-center justify-center shadow-inner">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base text-gray-700">
                      <span className="font-semibold text-blue-600 hover:text-blue-500 transition-colors">
                        Click to upload
                      </span>{' '}
                      or drag and drop
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{getFileTypeDescription()}</p>
                  </div>
                </div>
              </label>
            </div>

            {/* Selected File Info */}
            {selectedFile && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center shadow-inner">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{selectedFile.name}</p>
                    <p className="text-xs text-gray-600">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
              </div>
            )}

            {/* Upload Button */}
            {selectedFile && !uploadedImageUrl && (
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {isUploading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Uploading...</span>
                  </div>
                ) : (
                  `Upload ${selectedFileType === 'image' ? 'Image' : 'File'}`
                )}
              </button>
            )}

            {/* Continue Button - Only show for images */}
            {uploadedImageUrl && selectedFileType === 'image' && (
              <button
                onClick={handleContinue}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-4 px-6 rounded-xl font-semibold hover:from-green-700 hover:to-green-800 focus:outline-none focus:ring-4 focus:ring-green-500/20 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Continue to Map →
              </button>
            )}

            {/* Error Message */}
            {uploadError && (
              <div className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-red-700">{uploadError}</p>
                </div>
              </div>
            )}

            {/* Success Message */}
            {uploadedImageUrl && selectedFileType === 'image' && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-green-700">✓ Image uploaded successfully! Click continue to proceed.</p>
                </div>
              </div>
            )}

            {/* Non-image success message */}
            {uploadedImageUrl && selectedFileType !== 'image' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-blue-700">✓ File uploaded successfully! Only image files can be transformed on the map.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
