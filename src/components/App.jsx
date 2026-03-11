import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from '../contexts/AppContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import Header from './Header';
import HistoryView from './HistoryView';
import DetailsView from './DetailsView';
import LoadingComponent from './LoadingComponent';
import { RefreshCw, CheckCircle2, AlertCircle, ArrowLeft, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AppUpdateBanner = () => {
  const [updateState, setUpdateState] = useState(null); // null | 'available' | 'downloading' | 'downloaded'
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    window.electronAPI.onAppUpdateStatus((data) => {
      if (data.status === 'available') {
        setUpdateState('available');
        setVersion(data.version);
        setDismissed(false);
      } else if (data.status === 'downloading') {
        setUpdateState('downloading');
        setPercent(data.percent || 0);
        setDismissed(false);
      } else if (data.status === 'downloaded') {
        setUpdateState('downloaded');
        setDismissed(false);
      } else if (data.status === 'error' || data.status === 'up-to-date') {
        setUpdateState(null);
      }
    });
  }, []);

  if (!updateState || dismissed) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-card/95 backdrop-blur-md shadow-sm px-4 py-2.5 mb-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {updateState === 'available' && (
            <>
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 shrink-0">
                <Download className="h-3 w-3 text-blue-400" />
              </div>
              <span className="text-xs font-medium text-foreground truncate">
                Update v{version} available
              </span>
            </>
          )}
          {updateState === 'downloading' && (
            <>
              <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">
                Downloading update… {percent}%
              </span>
            </>
          )}
          {updateState === 'downloaded' && (
            <>
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 shrink-0">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-foreground">
                Update ready — restart to apply
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {updateState === 'available' && (
            <button
              onClick={() => window.electronAPI.downloadAppUpdate()}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2.5 py-1 rounded-md hover:bg-blue-500/10 transition-colors cursor-pointer"
            >
              Download
            </button>
          )}
          {updateState === 'downloaded' && (
            <button
              onClick={() => window.electronAPI.installAppUpdate()}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 px-2.5 py-1 rounded-md hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              Restart Now
            </button>
          )}
          {updateState !== 'downloading' && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {updateState === 'downloading' && (
        <div className="mt-2 h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
};

const UpdateBanner = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    window.electronAPI.onYtDlpUpdateStatus(({ updating, updated }) => {
      if (updating) {
        setIsUpdating(true);
        setJustUpdated(false);
        setVisible(true);
      } else {
        setIsUpdating(false);
        if (updated) {
          setJustUpdated(true);
          setTimeout(() => setVisible(false), 2500);
        } else {
          // No update was needed — dismiss quickly
          setTimeout(() => setVisible(false), 1200);
        }
      }
    });
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2.5 rounded-full border border-border/50 bg-card/95 backdrop-blur-md shadow-lg px-4 py-2">
        {isUpdating ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            <span className="text-xs font-medium text-muted-foreground">Updating packages...</span>
          </>
        ) : justUpdated ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-muted-foreground">Packages updated</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-xs font-medium text-muted-foreground/60">Up to date</span>
          </>
        )}
      </div>
    </div>
  );
};

const AppContent = () => {
  const { isLoading, videoDetails, fetchError, goBackToHistory, cancelFetchDetails } = useAppContext();

  return (
    <div className="flex flex-col gap-4 h-full">
      <AppUpdateBanner />
      <Header />
      <Card className="flex-1 overflow-hidden border-border/50">
        <CardContent className="flex flex-col h-full p-5">
          {isLoading ? (
            <LoadingComponent onCancel={cancelFetchDetails} />
          ) : videoDetails ? (
            <DetailsView />
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Couldn't fetch video</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The URL may be invalid, or the video might be unavailable. Please check and try again.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={goBackToHistory}
                className="gap-1.5 text-muted-foreground hover:text-foreground text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to history
              </Button>
            </div>
          ) : (
            <HistoryView />
          )}
        </CardContent>
      </Card>
      <UpdateBanner />
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <TooltipProvider delayDuration={300}>
        <AppContent />
      </TooltipProvider>
    </AppProvider>
  );
}

export default App;
