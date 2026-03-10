import React, { useState } from 'react';
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
import { Trash2, FolderOpen, X } from 'lucide-react';

const HistoryView = () => {
  const { history, setHistory } = useAppContext();

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
        <h2 className="text-lg font-semibold tracking-tight">Downloads</h2>
        {history.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive-foreground gap-1.5 h-7 text-xs">
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
                <AlertDialogAction onClick={handleClearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/80">
                  Clear History
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* History List */}
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
                        className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
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
                            className="h-8 w-8 text-muted-foreground/50 hover:text-destructive-foreground"
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
                        <AlertDialogAction onClick={() => handleDeleteItem(item.timestamp)} className="bg-destructive text-destructive-foreground hover:bg-destructive/80">
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
