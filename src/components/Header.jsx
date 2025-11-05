import React from 'react';
import { useAppContext } from '../contexts/AppContext';

const Header = () => {
  const { url, handleUrlChange, handleFetchDetails, isLoading, isDownloading } = useAppContext();

  return (
    <header className="header">
      <input
        type="text"
        className="url-input"
        placeholder="Paste Video URL here"
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleFetchDetails()}
        disabled={isDownloading}
      />
      <button
        className="header-button"
        onClick={handleFetchDetails}
        disabled={!url || isLoading || isDownloading}
      >
        {isLoading ? "..." : "GET VIDEO"}
      </button>
    </header>
  );
};

export default Header;
