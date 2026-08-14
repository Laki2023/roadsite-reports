import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

/**
 * PhotoUploader — reusable site photo component for the Daily Report wizard.
 * 
 * Props:
 *   projectId   - current project UUID
 *   category    - photo category (works_progress, quality_test, etc.)
 *   photos      - array of photo objects [{file, preview, caption, chainage}]
 *   setPhotos   - state setter for photos array
 *   maxPhotos   - maximum number of photos (default 10)
 *   label       - optional custom label
 *   compact     - if true, shows a smaller layout
 */
export default function PhotoUploader({ 
  projectId, category, photos, setPhotos, 
  maxPhotos = 10, label, compact = false 
}) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList) {
    const newPhotos = [];
    for (const file of fileList) {
      if (photos.length + newPhotos.length >= maxPhotos) break;
      if (!ACCEPTED_TYPES.includes(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      newPhotos.push({
        file,
        preview: URL.createObjectURL(file),
        caption: '',
        chainage: '',
        category,
      });
    }
    if (newPhotos.length > 0) {
      setPhotos([...photos, ...newPhotos]);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function removePhoto(index) {
    const updated = photos.filter((_, i) => i !== index);
    setPhotos(updated);
  }

  function updateCaption(index, caption) {
    const updated = [...photos];
    updated[index] = { ...updated[index], caption };
    setPhotos(updated);
  }

  function updateChainage(index, chainage) {
    const updated = [...photos];
    updated[index] = { ...updated[index], chainage };
    setPhotos(updated);
  }

  const canAdd = photos.length < maxPhotos;

  return (
    <div style={{ marginTop: compact ? 8 : 12 }}>
      {label && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          📷 {label}
          <span style={{ fontSize: 10, fontWeight: 400 }}>({photos.length}/{maxPhotos})</span>
        </div>
      )}

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: compact ? 'repeat(auto-fill, minmax(100px, 1fr))' : 'repeat(auto-fill, minmax(140px, 1fr))', 
          gap: 10, 
          marginBottom: 10 
        }}>
          {photos.map((photo, i) => (
            <div key={i} style={{
              position: 'relative',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              background: 'var(--bg-hover)',
            }}>
              {/* Thumbnail */}
              <div style={{ position: 'relative', paddingTop: '75%', overflow: 'hidden' }}>
                <img
                  src={photo.preview || photo.url}
                  alt={photo.caption || `Photo ${i + 1}`}
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {/* Remove button */}
                <button
                  onClick={() => removePhoto(i)}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 22, height: 22,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >×</button>
                {/* File size badge */}
                {photo.file && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: 4,
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}>
                    {(photo.file.size / 1024 / 1024).toFixed(1)}MB
                  </div>
                )}
              </div>

              {/* Caption + Chainage (non-compact only) */}
              {!compact && (
                <div style={{ padding: 6 }}>
                  <input
                    type="text"
                    placeholder="Caption..."
                    value={photo.caption}
                    onChange={e => updateCaption(i, e.target.value)}
                    style={{ 
                      width: '100%', fontSize: 11, padding: '4px 6px',
                      border: '1px solid var(--border)', borderRadius: 4,
                      background: 'var(--bg-card)', marginBottom: 4,
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Chainage"
                    value={photo.chainage}
                    onChange={e => updateChainage(i, e.target.value)}
                    style={{ 
                      width: '100%', fontSize: 11, padding: '4px 6px',
                      border: '1px solid var(--border)', borderRadius: 4,
                      background: 'var(--bg-card)',
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop Zone / Add Button */}
      {canAdd && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: compact ? '12px 8px' : '20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(232,123,53,0.08)' : 'transparent',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { 
            if (!dragOver) {
              e.currentTarget.style.borderColor = 'var(--border)'; 
              e.currentTarget.style.background = 'transparent'; 
            }
          }}
        >
          <div style={{ fontSize: compact ? 20 : 28, marginBottom: compact ? 2 : 6 }}>📸</div>
          <div style={{ fontSize: compact ? 11 : 13, fontWeight: 600, color: 'var(--accent)' }}>
            {compact ? 'Add Photos' : 'Drop photos here or tap to browse'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            JPG, PNG, WebP · Max {MAX_FILE_SIZE / 1024 / 1024}MB each
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        onChange={e => {
          if (e.target.files?.length > 0) handleFiles(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />
    </div>
  );
}

/**
 * Upload all photos to Supabase Storage and insert records into report_photos.
 * Call this from the submit handler after the daily_report is created.
 * 
 * @param {Array} photos - array of photo objects from state
 * @param {string} projectId - project UUID
 * @param {string} reportId - daily_report UUID (just created)
 * @param {object} profile - user profile
 * @param {string} reportDate - YYYY-MM-DD
 * @returns {number} count of successfully uploaded photos
 */
export async function uploadReportPhotos(photos, projectId, reportId, profile, reportDate) {
  let uploaded = 0;

  for (const photo of photos) {
    if (!photo.file) continue;

    try {
      // Generate unique path: project_id/YYYY-MM/timestamp_filename
      const month = reportDate.slice(0, 7);
      const timestamp = Date.now();
      const safeName = photo.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${projectId}/${month}/${timestamp}_${safeName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('site-photos')
        .upload(filePath, photo.file, {
          contentType: photo.file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        continue;
      }

      // Insert record into report_photos table
      const { error: insertError } = await supabase.from('report_photos').insert({
        project_id: projectId,
        report_id: reportId,
        file_path: filePath,
        file_name: photo.file.name,
        file_size: photo.file.size,
        mime_type: photo.file.type,
        category: photo.category || 'general',
        caption: photo.caption || null,
        chainage: photo.chainage || null,
        uploaded_by: profile.id,
        photo_date: reportDate,
      });

      if (insertError) {
        console.error('Photo record error:', insertError);
        continue;
      }

      uploaded++;
    } catch (err) {
      console.error('Photo processing error:', err);
    }
  }

  return uploaded;
}

/**
 * Get the public/signed URL for a photo.
 * @param {string} filePath - storage path
 * @returns {string} signed URL (1 hour expiry)
 */
export async function getPhotoUrl(filePath) {
  const { data, error } = await supabase.storage
    .from('site-photos')
    .createSignedUrl(filePath, 3600);
  
  if (error) {
    console.error('Signed URL error:', error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Load photos for a specific report.
 * @param {string} reportId - daily_report UUID
 * @returns {Array} photos with signed URLs
 */
export async function loadReportPhotos(reportId) {
  const { data, error } = await supabase
    .from('report_photos')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at');

  if (error || !data) return [];

  // Generate signed URLs for each photo
  const photosWithUrls = await Promise.all(
    data.map(async (photo) => {
      const url = await getPhotoUrl(photo.file_path);
      return { ...photo, url };
    })
  );

  return photosWithUrls;
}
