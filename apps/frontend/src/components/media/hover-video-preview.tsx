'use client';

import React, { useRef, useState } from 'react';
import { Video } from 'lucide-react';
import { withAuthToken } from '@/lib/media-url';

interface HoverVideoPreviewProps {
  thumbnailUrl: string;
  fileUrl: string;
  title?: string | null;
  className?: string;
}

/**
 * Affiche un thumbnail vidéo qui se transforme en preview animée muette
 * au survol (autoplay + loop). Respecte prefers-reduced-motion : dans ce
 * cas, seul le thumbnail + badge play reste visible.
 */
export function HoverVideoPreview({
  thumbnailUrl,
  fileUrl,
  title,
  className = '',
}: HoverVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovering, setHovering] = useState(false);

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const handleEnter = () => {
    if (reducedMotion) return;
    setHovering(true);
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {
        /* autoplay peut échouer selon navigateur, on ignore */
      });
    }
  };

  const handleLeave = () => {
    setHovering(false);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={withAuthToken(thumbnailUrl)}
        alt={title ?? ''}
        className={`w-full h-auto object-cover transition-opacity duration-300 ${
          hovering ? 'opacity-0' : 'opacity-100'
        }`}
        loading="lazy"
      />
      {!reducedMotion && (
        <video
          ref={videoRef}
          src={withAuthToken(fileUrl)}
          poster={withAuthToken(thumbnailUrl)}
          muted
          loop
          playsInline
          preload="none"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            hovering ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />
      )}
      {/* Play badge — masqué quand la vidéo joue */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200 ${
          hovering ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="h-12 w-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Video className="h-5 w-5 text-white fill-white" />
        </div>
      </div>
    </div>
  );
}
