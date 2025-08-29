import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';           // ensure Node APIs
export const dynamic = 'force-dynamic';    // avoid edge

export async function POST(req: Request) {
  try {
    console.log('Upload request received');
    
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const fileType = form.get('fileType') as string | null;
    const schoolType = form.get('schoolType') as string | null;
    
    if (!file) {
      console.log('No file in request');
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }

    if (!schoolType) {
      console.log('No school type in request');
      return NextResponse.json({ error: 'No school type' }, { status: 400 });
    }

    console.log('File received:', { name: file.name, type: file.type, size: file.size, fileType, schoolType });

    // File size validation (10MB limit for all types)
    if (file.size > 10 * 1024 * 1024) {
      console.log('File too large:', file.size);
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 413 });
    }

    // File type validation based on selected type
    let isValidType = false;
    let allowedTypes: string[] = [];
    let fileExtension = '';

    switch (fileType) {
      case 'image':
        allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        isValidType = allowedTypes.includes(file.type);
        fileExtension = file.type === 'image/png' ? 'png' : 
                       file.type === 'image/webp' ? 'webp' : 
                       file.type === 'image/gif' ? 'gif' : 'jpg';
        break;
      
      case 'document':
        allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        isValidType = allowedTypes.includes(file.type);
        fileExtension = file.type === 'application/pdf' ? 'pdf' : 
                       file.type === 'application/msword' ? 'doc' : 'docx';
        break;
      
      case 'other':
        // Accept any file type
        isValidType = true;
        // Try to get extension from filename
        const fileNameParts = file.name.split('.');
        fileExtension = fileNameParts.length > 1 ? fileNameParts[fileNameParts.length - 1] : 'bin';
        break;
      
      default:
        isValidType = false;
        allowedTypes = [];
    }

    if (!isValidType) {
      console.log('Unsupported file type:', file.type, 'for fileType:', fileType);
      return NextResponse.json({ 
        error: `Unsupported file type. Allowed types for ${fileType}: ${allowedTypes.join(', ')}` 
      }, { status: 415 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('File converted to buffer, size:', buffer.length);

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    console.log('Uploads directory:', uploadsDir);
    
    await mkdir(uploadsDir, { recursive: true });
    console.log('Directory created/verified');

    const id = crypto.randomBytes(8).toString('hex');
    const filename = `${id}.${fileExtension}`;
    const filepath = path.join(uploadsDir, filename);
    
    console.log('Writing file to:', filepath);
    await writeFile(filepath, buffer);
    console.log('File written successfully');

    const response = { 
      url: `/uploads/${filename}`,
      id: id,
      filename: filename,
      originalName: file.name,
      size: file.size,
      type: file.type,
      fileType: fileType,
      schoolType: schoolType
    };
    
    console.log('Upload successful, returning:', response);
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Server error: ' + (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 });
  }
}
