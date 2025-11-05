import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { formatBytes } from '../utils/formatBytes';

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
    details.formats[0]?.itag || ""
  );
  const [selectedType, setSelectedType] = useState("mp4");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [downloadedFilePath, setDownloadedFilePath] = useState(null);

  const estimatedSize = useMemo(() => {
    if (selectedType === 'mp3') {
      return details.audioSizeFormatted || 'N/A';
    }
    const format = details.formats.find(f => f.itag == selectedQuality);
    return format?.sizeFormatted || "N/A";
  }, [selectedQuality, selectedType, details.formats, details.audioSizeFormatted]);

  useEffect(() => {
    const listener = ({ percent, downloaded, total }) => {
      setProgress(percent);
      setProgressText(`${formatBytes(downloaded)} / ${formatBytes(total)}`);
    };
    window.electronAPI.onDownloadProgress(listener);
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    setProgress(0);
    setProgressText("");
    setDownloadedFilePath(null);
    console.log("Initializing download...");

    const qualityLabel = details.formats.find(
      (f) => f.itag == selectedQuality
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
      console.log("Success! File saved.");
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
    console.log("Download canceled by user.");
  };

  const handleThumbnailDownload = async () => {
    console.log("Saving thumbnail...");
    const result = await window.electronAPI.downloadThumbnail({
      url: details.thumbnailUrl,
      title: details.title,
    });
    if (result.success) {
      console.log(`Thumbnail saved!`);
    } else {
      console.error(`Error: ${result.error}`);
    }
  };

  return (
    <div className="details-view">
      <button
        className="view-title"
        onClick={goBackToHistory}
        disabled={isDownloading}
        style={{
          color: isDownloading ? "#8b949e" : "inherit",
          cursor: isDownloading ? "not-allowed" : "pointer"
        }}
      >
        &larr; BACK TO HISTORY
      </button>

      <div className="details-layout-container">
        {/* Left Column */}
        <div className="details-left-column">
          <div className="details-top-content">
            <img
              src={details.thumbnailUrl}
              className="thumbnail"
              alt="Video Thumbnail"
            />

            <button
              className="header-button show-in-folder-button"
              onClick={handleThumbnailDownload}
              disabled={isDownloading}
            >
              Download Thumbnail
            </button>

            <div className="details-controls">
              <select
                className="details-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                disabled={isDownloading}
              >
                <option value="mp4">MP4 (Video)</option>
                <option value="mp3">MP3 (Audio)</option>
              </select>
              <select
                className="details-select"
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                disabled={isDownloading || selectedType === "mp3"}
              >
                {details.formats.map((f) => (
                  <option key={f.itag} value={f.itag}>
                    {f.quality}
                  </option>
                ))}
              </select>
            </div>

            <div className="download-actions">
              {isDownloading ? (
                <>
                  <button className="header-button" disabled>Downloading...</button>
                  <button className="header-button cancel-button" onClick={handleCancelDownload}>Cancel</button>
                </>
              ) : (
                <div className="download-composite-button">
                  <button className="download-main-button" onClick={handleDownload}>
                    Download
                  </button>
                  <span className="download-size-indicator">{estimatedSize}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Status Area */}
          <div className="status-area">
            {isDownloading && (
              <div className="progress-container">
                <p className="progress-text">{progressText}</p>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
            {!isDownloading && downloadedFilePath && (
              <button
                className="header-button show-in-folder-button"
                onClick={() => window.electronAPI.openFileLocation(downloadedFilePath)}
              >
                Show in Folder
              </button>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="details-right-column">
          <h3 className="video-title">{details.title}</h3>
          <div className="description-wrapper">
            <p className="video-description">{details.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailsView;
