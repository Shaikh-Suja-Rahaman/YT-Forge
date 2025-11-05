import React from 'react';
import { AppProvider, useAppContext } from '../contexts/AppContext';
import Header from './Header';
import HistoryView from './HistoryView';
import DetailsView from './DetailsView';
import LoadingComponent from './LoadingComponent';

const AppContent = () => {
  const { isLoading, videoDetails } = useAppContext();

  return (
    <div className="app-container">
      <Header />
      <main className="content-box">
        {isLoading ? (
          <LoadingComponent />
        ) : videoDetails ? (
          <DetailsView />
        ) : (
          <HistoryView />
        )}
      </main>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
