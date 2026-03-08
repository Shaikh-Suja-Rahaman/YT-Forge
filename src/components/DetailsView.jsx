import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatBytes } from '../utils/formatBytes';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';

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
    const listener = ({ percent = 0, downloadedBytes = 0, totalBytes = 0, stage = 'starting' }) => {
      setProgress(percent);
      setDownloadStage(stage);
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
    setProgress(0);
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

            {/* Download & Size — equal grid, matching format/quality */}
            {isDownloading ? (
              <div className="grid grid-cols-[1fr,auto] gap-2.5">
                <Button disabled className="gap-2 h-9">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Downloading...
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-9 w-full"
                  onClick={handleCancelDownload}
                >
                  {/* <X className="h-4 w-4" /> */}
                  Cancel
                </Button>
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
            <div className="mt-auto pt-4">
              <div className="rounded-lg border border-border/30 bg-secondary/30 p-3">
                <div className="flex justify-between items-center gap-3 mb-2 min-w-0">
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">
                    {stageLabels[downloadStage] || 'Downloading...'}
                  </span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap truncate min-w-0">
                    {progressText}
                  </span>
                </div>
                <Progress
                  value={progress}
                  indeterminate={progress <= 0}
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
