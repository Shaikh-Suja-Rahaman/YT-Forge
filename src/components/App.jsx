import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from '../contexts/AppContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import Header from './Header';
import HistoryView from './HistoryView';
import DetailsView from './DetailsView';
import LoadingComponent from './LoadingComponent';
import { AlertCircle, ArrowLeft, Download, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── App-level update Modal (for the app itself via electron-updater) ────────
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

const AppUpdateModal = () => {
  const {
    appUpdateState: updateState,
    appUpdateVersion: version,
    appUpdatePercent: percent,
    showAppUpdateModal: open,
    setShowAppUpdateModal: setOpen,
  } = useAppContext();

  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!updateState) return null;

  const handleDownload = () => {
    window.electronAPI.downloadAppUpdate();
  };

  const handleRestart = () => {
    window.electronAPI.installAppUpdate();
  };

  const handleSkip = () => {
    if (dontAskAgain) {
      localStorage.setItem('skipAppUpdateVersion', version);
    }
    setOpen(false);
  };

  // Prevent closing when downloading
  const handleOpenChange = (isOpen) => {
    if (updateState === 'downloading') return;
    setOpen(isOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-sm bg-background border-border/40 shadow-xl p-0 overflow-hidden outline-none rounded-xl">
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-3">
            <div className="text-left space-y-2">
              <AlertDialogTitle className="text-lg font-medium text-foreground tracking-tight flex items-baseline gap-2">
                {updateState === 'available' && "Update Available"}
                {updateState === 'downloading' && "Downloading Update"}
                {updateState === 'downloaded' && "Update Ready"}

                {updateState === 'available' && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-sm">
                    {version}
                  </span>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
                {updateState === 'available' && "A new version of YT-FORGE is available. Download now to get the latest improvements."}
                {updateState === 'downloading' && (
                  <span className="flex flex-col gap-3 mt-4">
                    <span className="flex justify-between items-center text-xs font-medium text-foreground">
                      <span>Downloading</span>
                      <span>{percent}%</span>
                    </span>
                    <Progress value={percent} className="h-1.5 w-full bg-secondary" />
                  </span>
                )}
                {updateState === 'downloaded' && "The update is ready. Restart YT-FORGE to apply the changes."}
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
        </div>

        {updateState !== 'downloading' && (
          <div className="px-6 py-4 bg-muted/30 border-t border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-2">
            {updateState === 'available' ? (
              <label className="flex items-center gap-2 cursor-pointer outline-none group">
                <input 
                  type="checkbox" 
                  checked={dontAskAgain} 
                  onChange={(e) => setDontAskAgain(e.target.checked)}
                  className="rounded border-border bg-muted/50 text-foreground cursor-pointer focus:ring-1 focus:ring-primary/30 h-3.5 w-3.5 accent-foreground"
                />
                <span className="text-[11.5px] text-muted-foreground group-hover:text-foreground transition-colors select-none">
                  Don't prompt for this version
                </span>
              </label>
            ) : (
              <div /> // Spacer for flex-between
            )}
            
            <div className={`flex justify-end gap-2 ${updateState !== 'available' ? 'w-full' : 'w-full sm:w-auto'}`}>
              <Button variant="ghost" onClick={handleSkip} className="h-8 px-3 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground">
                Skip
              </Button>

              {updateState === 'available' ? (
                <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDownload(); }} asChild>
                  <Button className="h-8 px-4 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors">
                    Download
                  </Button>
                </AlertDialogAction>
              ) : (
                <AlertDialogAction onClick={handleRestart} asChild>
                  <Button className="h-8 px-4 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors">
                    Restart
                  </Button>
                </AlertDialogAction>
              )}
            </div>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

// ─── Main app content ─────────────────────────────────────────────────────────
const AppContent = () => {
  const {
    isLoading, videoDetails, fetchError,
    goBackToHistory, cancelFetchDetails,
    ytDlpStatus, pendingFetch,
  } = useAppContext();

  const renderCardContent = () => {
    if (isLoading) {
      return (
        <LoadingComponent
          onCancel={cancelFetchDetails}
          ytDlpStatus={ytDlpStatus}
          pendingFetch={pendingFetch}
        />
      );
    }
    if (videoDetails) return <DetailsView />;
    if (fetchError) {
      return (
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
      );
    }
    return <HistoryView />;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <AppUpdateModal />
      <Header />
      <Card className="flex-1 overflow-hidden border-border/50">
        <CardContent className="flex flex-col h-full p-5">
          {renderCardContent()}
        </CardContent>
      </Card>
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
