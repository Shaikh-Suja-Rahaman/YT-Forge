import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Trash2, FolderOpen, X, Info, ExternalLink, CheckCircle2, ArrowUpCircle } from 'lucide-react';

const HistoryView = () => {
  const { history, setHistory } = useAppContext();
  const [appVersion, setAppVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [versionChecked, setVersionChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.electronAPI.getAppVersion().then(v => {
      if (!mounted) return;
      setAppVersion(v);
      fetch('https://api.github.com/repos/Shaikh-Suja-Rahaman/YT-Forge/releases/latest')
        .then(res => res.json())
        .then(data => {
          if (!mounted || !data?.tag_name) return;
          const latest = data.tag_name.replace(/^v/, '');
          setLatestVersion(latest);
          if (latest.localeCompare(v, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
            setHasNewVersion(true);
          }
          setVersionChecked(true);
        })
        .catch(() => setVersionChecked(true));
    });
    return () => { mounted = false; };
  }, []);

  const handleClearHistory = async () => {
    await window.electronAPI.clearHistory();
    setHistory([]);
  };

  const handleDeleteItem = async (timestamp) => {
    const updated = await window.electronAPI.deleteHistoryItem(timestamp);
    setHistory(updated);
  };

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Downloads
        </h2>

        <div className="flex items-center gap-2">

          {/* ── Info / About button ── */}
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="relative text-muted-foreground hover:text-white gap-1.5 h-7 text-xs"
                  >
                    <Info className="h-3 w-3" />
                    Info
                    {hasNewVersion && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                        <span className=" absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                      </span>
                    )}
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>

              {
                hasNewVersion && (
                  <TooltipContent side="bottom" className="text-xs">
                    Newer version available
                  </TooltipContent>
                )
              }


            </Tooltip>

            <AlertDialogContent className="sm:max-w-sm bg-background border-border/40 shadow-xl p-0 overflow-hidden outline-none rounded-xl">
              {/* Top accent bar */}
              <div className={`h-[2px] w-full `} />

              <div className="px-6 pt-5 pb-4">
                <AlertDialogHeader className="space-y-4">
                  {/* App name + version */}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <AlertDialogTitle className="text-base font-semibold tracking-tight">
                        YT-Forge
                      </AlertDialogTitle>

                    </div>
                    <span className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg bg-secondary/70 text-foreground border border-border/50">
                      v{appVersion || '—'}
                    </span>
                  </div>

                  {/* Status card */}
                  <div className={`flex items-start gap-3 rounded-lg px-4 py-3 ${hasNewVersion ? 'bg-primary/[0.07] border border-primary/20' : 'bg-secondary/30 border border-border/40'}`}>
                    {hasNewVersion ? (
                      <>
                        <ArrowUpCircle className="w-[18px] h-[18px] text-primary mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold text-primary">Update available</span>
                          <AlertDialogDescription className="text-xs text-muted-foreground m-0 p-0">
                            Version <span className="font-semibold text-foreground/80">v{latestVersion}</span> is available on GitHub.
                          </AlertDialogDescription>
                        </div>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-[18px] h-[18px] text-emerald-400 mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold text-foreground">You're up to date</span>
                          <AlertDialogDescription className="text-xs text-muted-foreground m-0 p-0">
                            {versionChecked ? 'Running the latest release.' : 'Checking for updates…'}
                          </AlertDialogDescription>
                        </div>
                      </>
                    )}
                  </div>
                </AlertDialogHeader>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 bg-muted/20 border-t border-border/30 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                  onClick={() => window.electronAPI.openExternalLink('https://github.com/Shaikh-Suja-Rahaman/YT-Forge/releases/latest')}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View releases on GitHub
                </Button>
                <AlertDialogCancel className="h-8 px-4 text-xs m-0">
                  Close
                </AlertDialogCancel>
              </div>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── Clear history button ── */}
          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-white gap-1.5 h-7 text-xs">
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear download history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove all download history entries. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearHistory} className="bg-destructive text-white hover:bg-destructive/80">
                    Clear History
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      {/* ── End Header ── */}

      {/* History List — identical to original */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col gap-2.5">
          {history.length > 0 ? (
            history.map((item) => (
              <div
                key={item.timestamp}
                className="group flex items-center gap-4 rounded-lg p-3 hover:bg-secondary/40 transition-colors min-w-0"
              >
                {/* Thumbnail */}
                <img
                  src={item.thumbnailUrl}
                  className="w-28 aspect-video rounded-md object-cover shrink-0"
                  alt=""
                />

                {/* Info */}
                <div className="flex flex-col min-w-0 flex-1 gap-1">
                  <span
                    className="hover:underline text-sm font-medium text-foreground/90 truncate block text-left hover:text-foreground transition-colors cursor-pointer leading-tight"
                    onClick={() => window.electronAPI.openExternalLink(item.url)}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  <span className="text-xs text-muted-foreground/70 font-medium">
                    {item.format}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {/* Folder button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/50 hover:text-white"
                        onClick={() => window.electronAPI.openFileLocation(item.path)}
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Show in Folder
                    </TooltipContent>
                  </Tooltip>

                  {/* Delete single item button */}
                  <AlertDialog>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground/50 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Remove
                      </TooltipContent>
                    </Tooltip>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove from history?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This item will be deleted from the download history. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteItem(item.timestamp)} className="bg-destructive text-white hover:bg-destructive/80">
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-100 text-muted-foreground">
              <p className="text-sm">Your download history will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryView;