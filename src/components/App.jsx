import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from '../contexts/AppContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import Header from './Header';
import HistoryView from './HistoryView';
import DetailsView from './DetailsView';
import LoadingComponent from './LoadingComponent';
import { AlertCircle, ArrowLeft, Download, CheckCircle2, RefreshCw, X, Youtube, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Main app content ─────────────────────────────────────────────────────────
const AppContent = () => {
  const {
    isLoading, videoDetails, fetchError,
    goBackToHistory, cancelFetchDetails,
    ytDlpStatus, pendingFetch,
    isAgeRestricted, loginYoutube,
  } = useAppContext();

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    await loginYoutube();
    setIsLoggingIn(false);
    goBackToHistory(); // Go back so they can try fetching again
  };

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
      if (isAgeRestricted) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="flex flex-col items-center gap-4 max-w-md text-center bg-secondary/30 p-8 rounded-2xl border border-border/40">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 shadow-sm shadow-red-500/10 mb-2">
                <Youtube className="h-7 w-7 text-red-500" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">Age-Restricted Content</p>
                <p className="text-sm text-muted-foreground leading-relaxed px-4">
                  This video requires you to confirm your age. Please sign in to your YouTube account to continue downloading.
                </p>
              </div>
              <Button
                variant="default"
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full mt-2 shadow-md hover:shadow-lg transition-all"
              >
                {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign in with Google
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={goBackToHistory}
              className="gap-1.5 text-muted-foreground hover:text-foreground text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Go back
            </Button>
          </div>
        );
      }

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
