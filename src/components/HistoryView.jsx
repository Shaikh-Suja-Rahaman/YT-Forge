import React from 'react';
import { useAppContext } from '../contexts/AppContext';

const HistoryView = () => {
  const { history, setHistory } = useAppContext();

  const handleClearHistory = async () => {
    const isConfirmed = window.confirm(
      "Are you sure you want to clear the history? This cannot be undone."
    );

    if (isConfirmed) {
      await window.electronAPI.clearHistory();
      setHistory([]);
    }
  };

  return (
    <div className="history-view">
      <div className="history-header">
        <h2 className="view-title">HISTORY</h2>
        {history.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="clear-history-button"
          >
            Clear All
          </button>
        )}
      </div>
      <div className="history-list">
        {history.length > 0 ? (
          history.map((item) => (
            <div key={item.timestamp} className="history-item">
              <img
                src={item.thumbnailUrl}
                className="history-thumbnail"
                alt="Video thumbnail"
              />
              <div className="history-info">
                <p
                  className="history-title"
                  onClick={() => window.electronAPI.openExternalLink(item.url)}
                >
                  {item.title}
                </p>
                <p className="history-quality-format">{item.format}</p>
                <button
                  className="history-button"
                  onClick={() =>
                    window.electronAPI.openFileLocation(item.path)
                  }
                >
                  Show in Folder
                </button>
              </div>
            </div>
          ))
        ) : (
          <p>Your download history will appear here.</p>
        )}
      </div>
    </div>
  );
};

export default HistoryView;
