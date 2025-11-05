import React, { createContext, useContext, useState, useEffect } from 'react';

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

  // Fetch history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      const data = await window.electronAPI.getHistory();
      setHistory(data);
    };
    fetchHistory();
  }, []);

  const handleUrlChange = (newUrl) => {
    setUrl(newUrl);
    if (!newUrl.trim()) setVideoDetails(null);
  };

  const handleFetchDetails = async () => {
    if (!url || isDownloading) return;
    setIsLoading(true);
    console.log("Fetching details...");
    try {
      const result = await window.electronAPI.getVideoInfo(url);
      if (result.success) {
        setVideoDetails(result);
      } else {
        console.error(`Error: ${result.error}`);
        setVideoDetails(null);
      }
    } catch (error) {
      console.error("Failed to fetch video details:", error);
      setVideoDetails(null);
    } finally {
      setIsLoading(false);
    }
  };

  const goBackToHistory = () => {
    setUrl("");
    setVideoDetails(null);
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
    setUrl,
    setVideoDetails,
    setHistory,
    setIsLoading,
    setIsDownloading,
    handleUrlChange,
    handleFetchDetails,
    goBackToHistory,
    refreshHistory,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
