import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Download, FolderOpen, ListVideo, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from '@/components/ui/switch';

const PlaylistView = () => {
  const { 
    playlistDetails, 
    goBackToHistory, 
    isDownloading,
    ytDlpStatus,
    setIsDownloading,
    refreshHistory
  } = useAppContext();

  // If playlist details are null, we don't render. App.jsx handles this.
  if (!playlistDetails) return null;

  const [selectedVideos, setSelectedVideos] = useState(new Set(playlistDetails.videos.map(v => v.id)));
  const [globalQuality, setGlobalQuality] = useState('best');
  const [targetDir, setTargetDir] = useState(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false); // default: overwrite
  
  // Download Queue State
  const [downloadQueue, setDownloadQueue] = useState([]);
  const [currentDownloadIndex, setCurrentDownloadIndex] = useState(-1);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  const toggleVideo = (id) => {
    const next = new Set(selectedVideos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVideos(next);
  };

  const handleSelectAll = () => setSelectedVideos(new Set(playlistDetails.videos.map(v => v.id)));
  const handleSelectNone = () => setSelectedVideos(new Set());

  const handleChooseFolder = async () => {
    const dir = await window.electronAPI.chooseDirectory();
    if (dir) setTargetDir(dir);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Live';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startBatchDownload = async () => {
    if (!targetDir) {
      alert("Please choose a destination folder first.");
      return;
    }
    const toDownload = playlistDetails.videos.filter(v => selectedVideos.has(v.id));
    if (toDownload.length === 0) return;

    setDownloadQueue(toDownload);
    setCurrentDownloadIndex(0);
    setIsBatchDownloading(true);
    setIsDownloading(true);
  };

  // The Queue Manager Effect
  useEffect(() => {
    let isCancelled = false;
    
    const runNextDownload = async () => {
      if (!isBatchDownloading || currentDownloadIndex < 0 || currentDownloadIndex >= downloadQueue.length) {
        if (isBatchDownloading && currentDownloadIndex >= downloadQueue.length) {
          // Finished
          setIsBatchDownloading(false);
          setIsDownloading(false);
          
          // Save a consolidated playlist history item
          const historyItem = {
            id: 'playlist-' + Date.now(),
            type: 'playlist',
            title: playlistDetails.title,
            uploader: playlistDetails.uploader,
            thumbnailUrl: downloadQueue[0]?.thumbnail || '',
            url: playlistDetails.videos[0]?.url || '',
            format: globalQuality === 'audio' ? 'AUDIO (MP3)' : (globalQuality === 'best' ? 'Best (MP4)' : `${globalQuality}p (MP4)`),
            path: targetDir,
            timestamp: new Date().toISOString(),
            downloadedVideos: downloadQueue.map(v => ({ title: v.title, url: v.url }))
          };
          await window.electronAPI.addHistoryItem(historyItem);
          
          await refreshHistory();
          goBackToHistory();
        }
        return;
      }

      const video = downloadQueue[currentDownloadIndex];
      const type = globalQuality === 'audio' ? 'mp3' : 'mp4';
      const qualityParam = globalQuality === 'audio' ? 'best' : globalQuality;
      
      const options = {
        videoId: video.id,
        url: video.url,
        title: video.title,
        thumbnailUrl: video.thumbnail,
        type: type,
        quality: qualityParam,
        qualityLabel: globalQuality === 'audio' ? 'MP3' : (globalQuality === 'best' ? 'Best' : `${globalQuality}p`),
        convertToH264: false,
        targetDir: targetDir,
        allowDuplicates: allowDuplicates,
        skipHistory: true // Don't spam the history with individual files
      };

      try {
        await window.electronAPI.downloadVideo(options);
        if (!isCancelled) {
          setCurrentDownloadIndex(prev => prev + 1);
        }
      } catch (err) {
        console.error("Batch download error:", err);
        if (!isCancelled) {
           setCurrentDownloadIndex(prev => prev + 1);
        }
      }
    };

    if (isBatchDownloading && currentDownloadIndex >= 0) {
      runNextDownload();
    }

    return () => { isCancelled = true; };
  }, [isBatchDownloading, currentDownloadIndex, downloadQueue, targetDir, globalQuality, allowDuplicates]);

  useEffect(() => {
    if (!isDownloading && isBatchDownloading) {
      setIsBatchDownloading(false);
    }
  }, [isDownloading]);

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header Area */}
      <div className="flex-none border-b border-border/40 p-4 space-y-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={goBackToHistory} className="mt-1 shrink-0" disabled={isBatchDownloading}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate tracking-tight text-foreground">{playlistDetails.title}</h2>
            <p className="text-sm text-muted-foreground truncate">
              {playlistDetails.videos.length} videos • by {playlistDetails.uploader}
            </p>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-secondary/20 p-3 rounded-xl border border-border/40">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={globalQuality} onValueChange={setGlobalQuality} disabled={isBatchDownloading}>
              <SelectTrigger className="w-[140px] h-9 text-sm bg-background border-border/50">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="best">Best Available</SelectItem>
                <SelectItem value="2160">Up to 4K (2160p)</SelectItem>
                <SelectItem value="1440">Up to 2K (1440p)</SelectItem>
                <SelectItem value="1080">Up to 1080p</SelectItem>
                <SelectItem value="720">Up to 720p</SelectItem>
                <SelectItem value="audio">MP3 Audio Only</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              className={`h-9 px-3 gap-2 border-border/50 bg-background hover:bg-secondary transition-colors ${targetDir ? 'text-primary border-primary/30' : ''}`}
              onClick={handleChooseFolder}
              disabled={isBatchDownloading}
            >
              <FolderOpen className="h-4 w-4" />
              <span className="truncate max-w-[120px]">{targetDir ? targetDir.split(/[\\/]/).pop() : "Choose Folder"}</span>
            </Button>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center space-x-2">
              <Switch 
                id="overwrite" 
                checked={!allowDuplicates} 
                onCheckedChange={(c) => setAllowDuplicates(!c)} 
                disabled={isBatchDownloading}
              />
              <label htmlFor="overwrite" className="text-xs font-medium text-muted-foreground select-none cursor-pointer">
                Overwrite Files
              </label>
            </div>
            <Button 
              className="h-9 px-4 gap-2 transition-all shadow-sm hover:shadow"
              onClick={startBatchDownload}
              disabled={selectedVideos.size === 0 || isBatchDownloading}
            >
              <Download className="h-4 w-4" />
              Download {selectedVideos.size > 0 && `(${selectedVideos.size})`}
            </Button>
          </div>
        </div>
        
        {/* Selection Controls */}
        <div className="flex items-center justify-between pt-1">
           <div className="flex items-center gap-2">
             <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-7 text-xs px-2" disabled={isBatchDownloading}>Select All</Button>
             <Button variant="ghost" size="sm" onClick={handleSelectNone} className="h-7 text-xs px-2" disabled={isBatchDownloading}>Select None</Button>
           </div>
           <span className="text-xs text-muted-foreground font-medium">{selectedVideos.size} selected</span>
        </div>
      </div>

      {/* List Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2 pb-24">
          {playlistDetails.videos.map((video, index) => {
            const isSelected = selectedVideos.has(video.id);
            const isCurrent = currentDownloadIndex >= 0 && downloadQueue[currentDownloadIndex]?.id === video.id;
            const isFinished = currentDownloadIndex >= 0 && downloadQueue.findIndex(v => v.id === video.id) < currentDownloadIndex;
            
            return (
              <div 
                key={video.id}
                className={`flex items-center gap-4 p-3 rounded-xl border transition-all duration-200
                  ${isSelected ? 'bg-secondary/10 border-primary/20' : 'bg-background border-border/20 opacity-70'}
                  ${isCurrent ? 'ring-1 ring-primary/50 bg-primary/5' : ''}
                  ${isFinished ? 'opacity-50' : ''}
                `}
              >
                <Checkbox 
                  checked={isSelected}
                  onCheckedChange={() => toggleVideo(video.id)}
                  disabled={isBatchDownloading}
                  className="mt-1"
                />
                <div className="relative w-28 aspect-video rounded-lg overflow-hidden shrink-0 bg-secondary/30 border border-border/30">
                  <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                  <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm font-medium">
                    {formatDuration(video.duration)}
                  </div>
                  {isCurrent && (
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <ListVideo className="h-6 w-6 text-white animate-pulse" />
                     </div>
                  )}
                  {isFinished && (
                     <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                        <CheckCircle2 className="h-6 w-6 text-primary drop-shadow-md" />
                     </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="font-semibold text-sm text-foreground truncate">{video.title}</h3>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{video.uploader}</p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      
      {/* Absolute floating batch progress if downloading */}
      {isBatchDownloading && (
        <div className="absolute bottom-4 left-4 right-4 bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl p-4 shadow-2xl z-50 animate-in slide-in-from-bottom-5">
           <div className="flex flex-col gap-2">
             <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-semibold text-foreground">
                  Downloading {currentDownloadIndex + 1} of {downloadQueue.length}
                </span>
                <Button variant="ghost" size="sm" onClick={() => {
                  window.electronAPI.cancelDownload({ keepOriginal: false });
                  setIsBatchDownloading(false);
                  setIsDownloading(false);
                }} className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                  Cancel Batch
                </Button>
             </div>
             <BatchProgress />
           </div>
        </div>
      )}
    </div>
  );
};

const BatchProgress = () => {
  const [percent, setPercent] = useState(0);
  const [text, setText] = useState('Preparing download...');
  
  useEffect(() => {
    const listener = (data) => {
      const { percent = 0, downloadedBytes = 0, totalBytes = 0, stage = 'starting' } = data;
      setPercent(percent);
      
      const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024, dm = 2, sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
      };

      if (stage === 'merging' || stage === 'processing') {
        setText('Merging / Processing Audio & Video...');
      } else if (totalBytes > 0) {
        setText(`${percent.toFixed(1)}% — ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`);
      } else if (percent > 0) {
        setText(`${percent.toFixed(1)}%`);
      } else {
        setText('Starting yt-dlp...');
      }
    };
    window.electronAPI.onDownloadProgress(listener);
  }, []);

  return (
    <div className="space-y-2">
      <div className="h-1.5 w-full bg-secondary/50 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300 ease-out rounded-full" 
          style={{ width: `${Math.max(2, percent)}%` }} 
        />
      </div>
      <p className="text-xs text-muted-foreground font-medium text-right">{text}</p>
    </div>
  );
};

export default PlaylistView;
