import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [url, setUrl] = useState("");
  const [videoDetails, setVideoDetails] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  // yt-dlp update lifecycle: null | 'checking' | 'downloading' | 'updated' | 'up-to-date' | 'error'
  const [ytDlpStatus, setYtDlpStatus] = useState(null);
  // True when user clicked "Get Video" while yt-dlp was still running
  const [pendingFetch, setPendingFetch] = useState(false);

  const fetchIdRef = useRef(0);
  const urlRef = useRef(url);
  urlRef.current = url;

  // Listen for yt-dlp update status. Now that main.js waits for did-finish-load
  // before calling updateYtDlp(), this listener is always registered in time.
  useEffect(() => {
    window.electronAPI.onYtDlpUpdateStatus(({ status }) => {
      setYtDlpStatus(status);
    });
  }, []);

  // Fetch history on mount
  useEffect(() => {
    window.electronAPI.getHistory().then(setHistory);
  }, []);



  // The actual fetch logic — uses urlRef so it's always fresh
  const runFetch = useCallback(async () => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;
    setIsLoading(true);
    setFetchError(null);
    const currentFetchId = ++fetchIdRef.current;
    try {
      const result = await window.electronAPI.getVideoInfo(currentUrl);
      if (currentFetchId !== fetchIdRef.current) return;
      if (result.success) {
        setVideoDetails(result);
      } else {
        console.error(`Error: ${result.error}`);
        setVideoDetails(null);
        setFetchError(result.error);
      }
    } catch (error) {
      if (currentFetchId !== fetchIdRef.current) return;
      console.error("Failed to fetch video details:", error);
      setVideoDetails(null);
      setFetchError(error.message || 'Something went wrong');
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []); // stable — uses refs internally

  // When yt-dlp finishes and there's a pending fetch queued, auto-trigger it
  const pendingFetchRef = useRef(pendingFetch);
  pendingFetchRef.current = pendingFetch;

  useEffect(() => {
    const done = !ytDlpStatus || ytDlpStatus === 'updated' || ytDlpStatus === 'up-to-date' || ytDlpStatus === 'error';
    if (!done) return;
    if (!pendingFetchRef.current) return;
    setPendingFetch(false);
    // Brief delay so the "up to date" indicator renders for a moment
    const timer = setTimeout(() => runFetch(), 500);
    return () => clearTimeout(timer);
  }, [ytDlpStatus, runFetch]);

  const isYtDlpBusy = ytDlpStatus === 'checking' || ytDlpStatus === 'downloading';

  const handleFetchDetails = () => {
    if (!urlRef.current || isDownloading) return;
    if (isYtDlpBusy) {
      // Queue: show loader with yt-dlp stage, auto-proceed when done
      setPendingFetch(true);
      setIsLoading(true);
      setFetchError(null);
      return;
    }
    runFetch();
  };

  const goBackToHistory = () => {
    setUrl("");
    setVideoDetails(null);
    setFetchError(null);
    setPendingFetch(false);
    setIsLoading(false);
  };

  const cancelFetchDetails = () => {
    fetchIdRef.current++;
    window.electronAPI.cancelInfoFetch();
    goBackToHistory();
  };

  const handleUrlChange = (newUrl) => {
    setUrl(newUrl);
    if (!newUrl.trim()) {
      setVideoDetails(null);
      setFetchError(null);
    }
  };

  const refreshHistory = async () => {
    const data = await window.electronAPI.getHistory();
    setHistory(data);
  };

  const value = {
    url,
    videoDetails,
    history,
    isLoading,
    isDownloading,
    fetchError,
    ytDlpStatus,
    pendingFetch,
    isYtDlpBusy,
    setUrl,
    setVideoDetails,
    setHistory,
    setIsLoading,
    setIsDownloading,
    handleUrlChange,
    handleFetchDetails,
    cancelFetchDetails,
    goBackToHistory,
    refreshHistory,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
