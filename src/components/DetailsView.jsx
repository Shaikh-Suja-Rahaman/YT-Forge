import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatBytes } from '../utils/formatBytes';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Download,
  ImageDown,
  FolderOpen,
  Loader2,
  X,
  HardDrive,
  CheckCircle2,
  Info,
  Pause,
  Play,
  WifiOff,
} from 'lucide-react';

const formatTime = (totalSeconds) => {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const DetailsView = () => {
  const {
    videoDetails: details,
    url,
    goBackToHistory,
    isDownloading,
    setIsDownloading,
    refreshHistory
  } = useAppContext();

  const [selectedQuality, setSelectedQuality] = useState(
    String(details.formats[0]?.itag || "")
  );
  const [selectedType, setSelectedType] = useState("mp4");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [downloadStage, setDownloadStage] = useState('starting');
  const [downloadedFilePath, setDownloadedFilePath] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState(null); // null | 'user' | 'network'

  // New progress stats
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const isVP9 = useMemo(() => {
    if (selectedType === 'mp3') return false;
    const format = details.formats.find(f => String(f.itag) === selectedQuality);
    return format ? !format.isH264 : false;
  }, [selectedQuality, selectedType, details.formats]);

  const estimatedSize = useMemo(() => {
    if (selectedType === 'mp3') {
      return details.audioSizeFormatted || 'N/A';
    }
    const format = details.formats.find(f => String(f.itag) === selectedQuality);
    return format?.sizeFormatted || "N/A";
  }, [selectedQuality, selectedType, details.formats, details.audioSizeFormatted]);

  const stageLabels = {
    starting: 'Preparing download...',
    video: 'Downloading video...',
    audio: 'Downloading audio...',
    merging: 'Merging video & audio...',
    processing: 'Processing audio...',
    done: 'Complete!',
  };

  useEffect(() => {
    const listener = (data) => {
      // Handle pause/resume status events
      if (data.paused !== undefined) {
        setIsPaused(data.paused);
        setPauseReason(data.reason || null);
        if (data.stage) setDownloadStage(data.stage);
        return;
      }

      const { percent = 0, downloadedBytes = 0, totalBytes = 0, stage = 'starting', speed = 0, eta = 0, elapsed = 0 } = data;
      setProgress(percent);
      setDownloadStage(stage);
      setSpeed(speed);
      setEta(eta);
      setElapsed(elapsed);

      if (stage === 'merging' || stage === 'processing') {
        setProgressText(stageLabels[stage]);
      } else if (totalBytes > 0) {
        setProgressText(`${percent.toFixed(1)}% — ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`);
      } else if (percent > 0) {
        setProgressText(`${percent.toFixed(1)}%`);
      } else {
        setProgressText('Starting...');
      }
    };
    window.electronAPI.onDownloadProgress(listener);
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    setProgress(0);
    setProgressText("Preparing download...");
    setDownloadedFilePath(null);

    const qualityLabel = details.formats.find(
      (f) => String(f.itag) === selectedQuality
    )?.quality;

    const options = {
      ...details,
      url,
      quality: selectedQuality,
      qualityLabel,
      type: selectedType,
    };

    const result = await window.electronAPI.downloadVideo(options);
    if (result.success) {
      setDownloadedFilePath(result.path);
      await refreshHistory();
    } else {
      if (result.error !== "Download was canceled.") {
        console.error(`Error: ${result.error}`);
      }
    }
    setIsDownloading(false);
  };

  const handleCancelDownload = () => {
    window.electronAPI.cancelDownload();
    setIsDownloading(false);
    setIsPaused(false);
    setPauseReason(null);
    setProgress(0);
  };

  const handlePauseDownload = () => {
    window.electronAPI.pauseDownload();
  };

  const handleResumeDownload = () => {
    window.electronAPI.resumeDownload();
  };

  const handleThumbnailDownload = async () => {
    const result = await window.electronAPI.downloadThumbnail({
      url: details.thumbnailUrl,
      title: details.title,
    });
    if (!result.success) {
      console.error(`Error: ${result.error}`);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={goBackToHistory}
        disabled={isDownloading}
        className="self-start -ml-2 mb-4 gap-1.5 text-muted-foreground hover:text-foreground h-7 text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Button>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Left Column — Thumbnail, Controls, Download */}
        <div className="flex flex-col min-w-0">
          {/* Thumbnail with save overlay */}
          <div className="relative rounded-lg overflow-hidden bg-secondary group">
            <img
              src={details.thumbnailUrl}
              className="w-full aspect-video object-cover"
              alt="Video Thumbnail"
            />
            <button
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-2 py-1 text-[10px] text-white/80 hover:text-white hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none"
              onClick={handleThumbnailDownload}
              disabled={isDownloading}
            >
              <ImageDown className="h-3 w-3" />
              Save
            </button>
          </div>

          {/* Controls section */}
          <div className="flex flex-col gap-2.5 mt-4">
            {/* Format & Quality — equal grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <Select
                value={selectedType}
                onValueChange={setSelectedType}
                disabled={isDownloading}
              >
                <SelectTrigger className="h-9 bg-secondary/50 border-border/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 (Video)</SelectItem>
                  <SelectItem value="mp3">MP3 (Audio)</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={selectedQuality}
                onValueChange={setSelectedQuality}
                disabled={isDownloading || selectedType === "mp3"}
              >
                <SelectTrigger className="h-9 bg-secondary/50 border-border/50 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {details.formats.map((f) => (
                    <SelectItem key={f.itag} value={String(f.itag)}>
                      {f.quality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* VP9 compatibility note */}
            {isVP9 && !isDownloading && (
              <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/15">
                <Info className="h-3 w-3 text-amber-500/70 mt-0.5 shrink-0" />
                <p className="text-[11px] leading-snug text-amber-500/70">
                  VP9 may not be supported by some editors <span className="text-amber-500/50">(Premiere Pro, Final Cut)</span> and older players.
                </p>
              </div>
            )}

            {/* Download & Size — equal grid, matching format/quality */}
            {isDownloading ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr,auto] gap-2.5">
                  {isPaused && pauseReason !== 'network' ? (
                    <Button className="gap-2 h-9" onClick={handleResumeDownload}>
                      <Play className="h-4 w-4" />
                      Resume
                    </Button>
                  ) : !isPaused ? (
                    <Button
                      variant="secondary"
                      className="gap-2 h-9"
                      onClick={handlePauseDownload}
                      disabled={downloadStage === 'merging' || downloadStage === 'processing'}
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </Button>
                  ) : (
                    <Button disabled className="gap-2 h-9">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Waiting...
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="h-9 px-4"
                      >
                        Cancel
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel download?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The download will be stopped and the partial file will be deleted. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep downloading</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleCancelDownload}
                          className="bg-destructive text-white hover:bg-destructive/80"
                        >
                          Yes, cancel
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {/* Network-paused info badge */}
                {isPaused && pauseReason === 'network' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/15">
                    <WifiOff className="h-3 w-3 text-amber-500/70 shrink-0" />
                    <p className="text-[11px] leading-snug text-amber-500/70">
                      No internet — will resume automatically
                    </p>
                  </div>
                )}
              </div>
            ) : downloadedFilePath ? (
              <Button
                variant="outline"
                className="w-full gap-2 h-9 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300"
                onClick={() => window.electronAPI.openFileLocation(downloadedFilePath)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Show in Folder
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <Button className="gap-2 h-9" onClick={handleDownload}>
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <div className="flex items-center justify-center rounded-md border border-border/50 bg-secondary/40 text-xs text-muted-foreground font-medium h-9 gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 opacity-60" />
                  {estimatedSize}
                </div>
              </div>
            )}
          </div>

          {/* Progress Area (pushed to bottom) */}
          {isDownloading && (
            <div className="mt-auto pt-4 flex flex-col gap-2">
              {/* Stats Row */}
              {(downloadStage === 'video' || downloadStage === 'audio') && progress > 0 && (
                <div className="flex bg-secondary/30 border border-border/30 rounded-lg divide-x divide-border/30 overflow-hidden shadow-sm animate-in fade-in duration-200">
                  <div className="flex-1 px-2 py-1.5 flex flex-col items-center justify-center">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Speed</span>
                    <span className="text-xs font-mono tabular-nums font-medium text-foreground">{!isPaused && speed > 0 ? `${formatBytes(speed)}/s` : '--'}</span>
                  </div>
                  <div className="flex-1 px-2 py-1.5 flex flex-col items-center justify-center">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Elapsed</span>
                    <span className="text-xs font-mono tabular-nums font-medium text-foreground">{formatTime(elapsed)}</span>
                  </div>
                  <div className="flex-1 px-2 py-1.5 flex flex-col items-center justify-center">
                    <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">Time Left</span>
                    <span className="text-xs font-mono tabular-nums font-medium text-foreground">{!isPaused && speed > 0 && eta > 0 ? formatTime(eta) : '--:--'}</span>
                  </div>
                </div>
              )}

              <div className={`rounded-lg border p-3 ${isPaused
                  ? 'border-amber-500/20 bg-amber-500/5'
                  : 'border-border/30 bg-secondary/30'
                }`}>
                <div className="flex justify-between items-center gap-3 mb-2 min-w-0">
                  <span className={`text-xs font-medium whitespace-nowrap ${isPaused ? 'text-amber-400' : 'text-foreground'
                    }`}>
                    {isPaused
                      ? pauseReason === 'network'
                        ? 'Waiting for connection...'
                        : 'Paused'
                      : stageLabels[downloadStage] || 'Downloading...'}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums tracking-tight text-muted-foreground whitespace-nowrap truncate min-w-0">
                    {progressText}
                  </span>
                </div>
                <Progress
                  value={progress}
                  indeterminate={progress <= 0 && !isPaused}
                  paused={isPaused}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column — Title & Description */}
        <div className="flex flex-col min-w-0 min-h-0">
          <h3 className="text-base font-semibold leading-snug mb-3 truncate" title={details.title}>
            {details.title}
          </h3>
          <div className="flex-1 overflow-y-auto rounded-lg bg-secondary/20 border border-border/20 min-h-0">
            <div className="p-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {details.description || 'No description available.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailsView;
