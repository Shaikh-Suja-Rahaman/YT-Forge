import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import VideoPlayer from './VideoPlayer';
import { X, Scissors, Info } from 'lucide-react';

const formatTime = (totalSeconds) => {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const parseTime = (str) => {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
};

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const TimelineEditor = ({ duration, trimRange, onTrimRangeChange, currentTime, onSeek, thumbnailUrl }) => {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);

  const getProgressFromEvent = (e) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    const p = x / rect.width;
    return Math.max(0, Math.min(1, p));
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragging) return;
      const p = getProgressFromEvent(e);
      const t = p * duration;

      if (dragging === 'left') {
        const newLeft = Math.max(0, Math.min(t, trimRange[1] - 1));
        onTrimRangeChange([newLeft, trimRange[1]]);
        onSeek(newLeft);
      } else if (dragging === 'right') {
        const newRight = Math.max(trimRange[0] + 1, Math.min(t, duration));
        onTrimRangeChange([trimRange[0], newRight]);
        if (currentTime > newRight) {
          onSeek(newRight);
        }
      } else if (dragging === 'playhead') {
        const clampedT = Math.max(trimRange[0], Math.min(t, trimRange[1]));
        onSeek(clampedT);
      } else if (dragging === 'center') {
        const rangeDuration = trimRange[1] - trimRange[0];
        let newLeft = t - dragOffset;
        if (newLeft < 0) newLeft = 0;
        if (newLeft + rangeDuration > duration) newLeft = duration - rangeDuration;
        onTrimRangeChange([newLeft, newLeft + rangeDuration]);
        onSeek(newLeft);
      }
    };

    const handleMouseUp = () => setDragging(null);

    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, duration, trimRange, onTrimRangeChange, onSeek, dragOffset, currentTime]);

  const handleTrackMouseDown = (e) => {
    const p = getProgressFromEvent(e);
    const t = p * duration;
    if (t >= trimRange[0] && t <= trimRange[1]) {
      onSeek(t);
      setDragging('playhead');
    }
  };

  const handleCenterMouseDown = (e) => {
    e.stopPropagation();
    const p = getProgressFromEvent(e);
    const t = p * duration;
    setDragOffset(t - trimRange[0]);
    setDragging('center');
  };

  const leftPercent = (trimRange[0] / duration) * 100;
  const rightPercent = (trimRange[1] / duration) * 100;
  const currentPercent = (Math.max(trimRange[0], Math.min(currentTime, trimRange[1])) / duration) * 100;

  return (
    <div className="flex flex-col gap-1.5 w-full select-none">
      <div className="flex justify-between text-[11px] text-muted-foreground/60 px-1 font-mono">
        <span>{formatTime(0)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div 
        className="relative h-12 w-full cursor-text"
        ref={trackRef}
        onMouseDown={handleTrackMouseDown}
      >
        {/* Inner wrapper for backgrounds with rounded clipping */}
        <div className="absolute inset-0 bg-secondary/20 rounded-md overflow-hidden pointer-events-none">
          {/* Filmstrip Background */}
          <div 
            className="absolute inset-0 w-full h-full opacity-50"
            style={{
              backgroundImage: `url(${thumbnailUrl})`,
              backgroundSize: 'auto 100%',
              backgroundRepeat: 'repeat-x',
              backgroundPosition: 'left center'
            }}
          />

          {/* Left Dark Overlay */}
          <div 
            className="absolute top-0 bottom-0 left-0 bg-background/85" 
            style={{ width: `${leftPercent}%` }} 
          />
          
          {/* Right Dark Overlay */}
          <div 
            className="absolute top-0 bottom-0 right-0 bg-background/85" 
            style={{ left: `${rightPercent}%` }} 
          />
        </div>

        {/* Active Trim Box — monochrome white/gray borders */}
        <div 
          className="absolute top-0 bottom-0 border-y-[3px] border-white/70 cursor-grab active:cursor-grabbing"
          style={{ left: `${leftPercent}%`, width: `${rightPercent - leftPercent}%` }}
          onMouseDown={handleCenterMouseDown}
        >
          {/* Left Handle */}
          <div 
            className="absolute -left-[6px] top-0 bottom-0 w-[6px] bg-white/90 rounded-l flex flex-col items-center justify-center cursor-ew-resize hover:bg-white transition-colors"
            onMouseDown={(e) => { e.stopPropagation(); setDragging('left'); }}
          >
            <div className="w-[1px] h-3 bg-black/30 rounded-full" />
          </div>
          {/* Right Handle */}
          <div 
            className="absolute -right-[6px] top-0 bottom-0 w-[6px] bg-white/90 rounded-r flex flex-col items-center justify-center cursor-ew-resize hover:bg-white transition-colors"
            onMouseDown={(e) => { e.stopPropagation(); setDragging('right'); }}
          >
            <div className="w-[1px] h-3 bg-black/30 rounded-full" />
          </div>
        </div>

        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-[2px] bg-white z-10 cursor-ew-resize"
          style={{ left: `${currentPercent}%`, transform: 'translateX(-1px)' }}
          onMouseDown={(e) => { e.stopPropagation(); setDragging('playhead'); }}
        >
          <div className="absolute -top-1 -left-[5px] w-3 h-3 bg-white rounded-full shadow-sm border border-white/50" />
        </div>
      </div>
    </div>
  );
};

const TrimmerModal = ({ isOpen, onClose, onSave, details, url, initialTrimRange }) => {
  const duration = details.duration || 100;
  const [trimRange, setTrimRange] = useState(initialTrimRange || [0, duration]);
  const [currentTime, setCurrentTime] = useState(0);
  const videoPlayerRef = useRef(null);

  const [startInput, setStartInput] = useState(formatTime(initialTrimRange?.[0] ?? 0));
  const [endInput, setEndInput] = useState(formatTime(initialTrimRange?.[1] ?? duration));

  useEffect(() => {
    if (isOpen) {
      setTrimRange(initialTrimRange || [0, duration]);
    }
  }, [isOpen, initialTrimRange, duration]);

  // Sync inputs when trim range changes
  useEffect(() => {
    setStartInput(formatTime(trimRange[0]));
    setEndInput(formatTime(trimRange[1]));
  }, [trimRange]);

  // Clamp video playback within the trim range
  useEffect(() => {
    if (currentTime >= trimRange[1]) {
      handleSeek(trimRange[0]);
    } else if (currentTime < trimRange[0] - 0.5) {
      handleSeek(trimRange[0]);
    }
  }, [currentTime, trimRange]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ trimRange });
    onClose();
  };

  const handleSeek = (time) => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.seekTo(time);
    }
  };

  const handleStartBlur = () => {
    const s = parseTime(startInput);
    if (s !== null && s >= 0 && s < duration) {
      const validS = Math.min(s, trimRange[1] - 1);
      setTrimRange([Math.max(0, validS), trimRange[1]]);
      handleSeek(Math.max(0, validS));
    } else {
      setStartInput(formatTime(trimRange[0]));
    }
  };

  const handleEndBlur = () => {
    const s = parseTime(endInput);
    if (s !== null && s > trimRange[0] && s <= duration) {
      setTrimRange([trimRange[0], s]);
    } else {
      setEndInput(formatTime(trimRange[1]));
    }
  };

  const handleStartKeyDown = (e) => { if (e.key === 'Enter') { e.target.blur(); } };
  const handleEndKeyDown = (e) => { if (e.key === 'Enter') { e.target.blur(); } };

  const clipDuration = trimRange[1] - trimRange[0];

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <Scissors className="w-4 h-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Trim Video</h2>
            <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[300px]">{details.title}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Main Content — no scrolling needed */}
      <div className="flex-1 flex flex-col p-5 gap-4 overflow-hidden">
        
        {/* Top Row: Preview (left) + Info (right) */}
        <div className="flex gap-4 min-h-0">
          {/* Preview — larger size with letterboxing */}
          <div className="w-[426px] h-[240px] shrink-0 bg-black rounded-lg overflow-hidden border border-border/30">
            <VideoPlayer
              ref={videoPlayerRef}
              videoId={details.id}
              videoUrl={url}
              onTimeUpdate={setCurrentTime}
              className="w-full h-full"
              forceLayer2={true}
              autoPlay={false}
            />
          </div>

          {/* Info Panel */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* Clip Duration */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
                <input
                  type="text"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  onBlur={handleStartBlur}
                  onKeyDown={handleStartKeyDown}
                  className="w-[72px] text-center bg-secondary/40 px-2 py-1 rounded border border-border/40 focus:outline-none focus:border-white/40 text-sm transition-colors"
                  aria-label="Start time"
                />
                <span className="text-muted-foreground/40">→</span>
                <input
                  type="text"
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  onBlur={handleEndBlur}
                  onKeyDown={handleEndKeyDown}
                  className="w-[72px] text-center bg-secondary/40 px-2 py-1 rounded border border-border/40 focus:outline-none focus:border-white/40 text-sm transition-colors"
                  aria-label="End time"
                />
              </div>
              <span className="text-xs text-muted-foreground/60">
                Clip: {formatDuration(clipDuration)}
              </span>
            </div>

            {/* Info Notes */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
                <Info className="w-3 h-3 mt-[2px] shrink-0 text-muted-foreground/40" />
                <span>Previews of very long videos may take time to buffer. If the preview is slow, editing timestamps manually above is recommended.</span>
              </div>
              <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70 leading-relaxed">
                <Info className="w-3 h-3 mt-[2px] shrink-0 text-muted-foreground/40" />
                <span>Download speeds while trimming are limited by YouTube to approximately 3 MB/s per connection.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Editor */}
        <div className="bg-card/50 border border-border/30 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground/80">Timeline</span>
            <span className="text-[11px] text-muted-foreground/50 font-mono tabular-nums">
              {formatTime(currentTime)}
            </span>
          </div>

          <TimelineEditor 
            duration={duration} 
            trimRange={trimRange} 
            onTrimRangeChange={setTrimRange} 
            currentTime={currentTime} 
            onSeek={handleSeek}
            thumbnailUrl={details.thumbnailUrl}
          />
        </div>

        {/* Bottom Buttons */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="h-9 text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} className="h-9 gap-2 bg-foreground hover:bg-foreground/90 text-background text-sm">
            <Scissors className="w-3.5 h-3.5" />
            Apply Trim
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TrimmerModal;
