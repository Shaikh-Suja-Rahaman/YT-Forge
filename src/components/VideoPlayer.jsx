import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import { Loader2, AlertCircle, Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../contexts/AppContext';

const VideoPlayer = forwardRef(({ videoId, videoUrl, onTimeUpdate, className, forceLayer2 = false, autoPlay = true }, ref) => {
  const { setShowSettings } = useAppContext();
  const [layer, setLayer] = useState(forceLayer2 ? 2 : 1); // 1: Iframe, 2: Native proxy
  const [streamUrl, setStreamUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  useImperativeHandle(ref, () => ({
    seekTo: (timeInSeconds) => {
      if (layer === 1) {
        // Can't easily seek iframe without YouTube API
        // For layer 2 (native), it's easy:
      } else if (videoRef.current) {
        videoRef.current.currentTime = timeInSeconds;
      }
    }
  }));
  
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const refreshMutex = useRef(false);
  const lastCurrentTime = useRef(0);

  // Initialize Layer 2 stream fetch
  const fetchStreamUrl = async (isRefresh = false) => {
    if (refreshMutex.current) return;
    refreshMutex.current = true;
    
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await window.electronAPI.getStreamUrl(videoUrl);
      if (result.success) {
        // Wrap the raw url in our ytforge:// proxy scheme to bypass CORS & handle SSRF checks
        const proxiedUrl = `ytforge://stream?url=${encodeURIComponent(result.url)}`;
        setStreamUrl(proxiedUrl);
        setError(null);
      } else {
        setError(result.error);
        if (result.errorType === 'AGE_RESTRICTED_ERROR') {
          // Special state for age restriction
          setError('AGE_RESTRICTED');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshMutex.current = false;
    }
  };

  useEffect(() => {
    if (forceLayer2 && layer === 2 && !streamUrl) {
      fetchStreamUrl();
    }
  }, [forceLayer2, layer, streamUrl]);

  // Attempt to switch to Layer 2
  const fallbackToNative = () => {
    if (layer !== 2) {
      setLayer(2);
      fetchStreamUrl();
    }
  };

  useEffect(() => {
    // If layer 2 is active and stream URL is ready, mount HLS or native playback
    if (layer === 2 && streamUrl && videoRef.current) {
      const video = videoRef.current;
      
      const handleSeeked = () => {
        if (onTimeUpdate) onTimeUpdate(video.currentTime);
      };

      const handleTimeUpdate = () => {
        lastCurrentTime.current = video.currentTime;
        if (onTimeUpdate) onTimeUpdate(video.currentTime);
      };

      const handleError = (e) => {
        // Stream stall or 403 Forbidden?
        console.warn('Video element error:', video.error);
        if (video.error && (video.error.code === 3 || video.error.code === 4)) {
          // Attempt refresh
          fetchStreamUrl(true);
        }
      };

      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('error', handleError);

      if (streamUrl.includes('.m3u8')) {
        if (Hls.isSupported()) {
          if (hlsRef.current) hlsRef.current.destroy();
          class ProxyLoader extends Hls.DefaultConfig.loader {
            constructor(config) {
              super(config);
            }
            load(context, config, callbacks) {
              if (context.url.startsWith('https://') && !context.url.startsWith('ytforge://')) {
                context.url = `ytforge://stream?url=${encodeURIComponent(context.url)}`;
              }
              super.load(context, config, callbacks);
            }
          }

          const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            pLoader: ProxyLoader,
            fLoader: ProxyLoader,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          
          hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.warn('HLS Network error, refreshing stream...', data);
                  fetchStreamUrl(true);
                  break;
                default:
                  hls.destroy();
                  setError('HLS Fatal Error: ' + data.details);
                  break;
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
        }
      } else {
        // Direct MP4 playback
        video.src = streamUrl;
      }

      return () => {
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('error', handleError);
        if (hlsRef.current) hlsRef.current.destroy();
      };
    }
  }, [layer, streamUrl]);

  // When streamUrl refreshes, seek to where we were
  useEffect(() => {
    if (layer === 2 && streamUrl && videoRef.current && lastCurrentTime.current > 0) {
      const onLoadedMetadata = () => {
        videoRef.current.currentTime = lastCurrentTime.current;
        videoRef.current.play().catch(e => console.warn('Auto-play after refresh prevented', e));
        videoRef.current.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
      videoRef.current.addEventListener('loadedmetadata', onLoadedMetadata);
    }
  }, [streamUrl]);

  return (
    <div className={`relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center ${className}`}>
      {layer === 1 && (
        <iframe
          className="w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onError={fallbackToNative}
        />
      )}

      {layer === 2 && !error && (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          controls
          autoPlay={autoPlay}
          crossOrigin="anonymous"
        />
      )}

      {/* Layer 1 Overlays */}
      {layer === 1 && (
        <div className="absolute top-2 right-2 opacity-50 hover:opacity-100 transition-opacity">
          <Button variant="secondary" size="sm" className="h-7 text-[10px] gap-1 px-2 bg-black/50 text-white border-none hover:bg-black/70" onClick={fallbackToNative}>
            Use Native Player
          </Button>
        </div>
      )}

      {/* Loading Overlays */}
      {loading && layer === 2 && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 text-white">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Loading stream...</p>
        </div>
      )}
      
      {refreshing && layer === 2 && !loading && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-black/80 px-4 py-2 rounded-full flex items-center gap-2 text-white/90 text-sm backdrop-blur-md">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Buffering stream... (Attempting refresh)</span>
          </div>
        </div>
      )}

      {/* Error Overlays */}
      {error && layer === 2 && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-4 text-center p-6">
          <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          {error === 'AGE_RESTRICTED' ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-white">⚠️ Age-restricted video</p>
              <p className="text-xs text-white/70 max-w-xs">Add your YouTube cookies to preview this.</p>
              <Button size="sm" onClick={() => setShowSettings(true)} className="mt-2 gap-1.5 h-8">
                <Settings className="w-3.5 h-3.5" />
                Go to Settings
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-white">Unable to load visual preview</p>
              <p className="text-xs text-destructive/80 max-w-sm line-clamp-3 leading-relaxed">
                {error}
              </p>
              <p className="text-[10px] text-white/50 mt-2">Please enter timestamps manually.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
