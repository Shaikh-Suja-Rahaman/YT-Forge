import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from '../contexts/AppContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import Header from './Header';
import HistoryView from './HistoryView';
import DetailsView from './DetailsView';
import LoadingComponent from './LoadingComponent';
import { RefreshCw, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
