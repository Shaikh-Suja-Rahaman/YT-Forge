import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Search, Github, Settings, Youtube } from 'lucide-react';
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
} from "@/components/ui/alert-dialog";

const Header = () => {
  const { 
    url, handleUrlChange, handleFetchDetails, isLoading, isDownloading, 
    isAuthenticated, loginYoutube, logoutYoutube 
  } = useAppContext();
  
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    await loginYoutube();
    setIsLoggingIn(false);
  };

  return (
    <header className="flex items-center gap-3">
      <Input
        type="text"
        placeholder="Paste a YouTube URL..."
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleFetchDetails()}
        disabled={isDownloading}
        className="flex-1 h-10 bg-card border-border/50 text-sm placeholder:text-muted-foreground/60"
      />
      <Button
        onClick={handleFetchDetails}
        disabled={!url || isLoading || isDownloading}
        className="h-10 px-5 min-w-32.5 font-semibold"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Search className="h-4 w-4" />
            Get Video
          </>
        )}
      </Button>

      <AlertDialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 text-muted-foreground hover:text-white transition-colors"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Settings
          </TooltipContent>
        </Tooltip>
        
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Settings</AlertDialogTitle>
            <AlertDialogDescription>
              Configure app settings and preferences.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col space-y-3 p-4 bg-secondary/50 rounded-lg border border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Youtube className="h-5 w-5 text-red-500" />
                  <span className="font-semibold text-sm">YouTube Account</span>
                </div>
                {isAuthenticated ? (
                  <span className="text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">Signed In</span>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">Not Signed In</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sign in to YouTube to download <strong>age-restricted videos</strong>. 
                This feature is completely optional and normal downloads will work without it.
                <br /><br />
                <em>Note: For security reasons, the session may expire after some time (usually around 30 days), requiring you to sign in again.</em>
              </p>
              
              <div className="pt-2">
                {isAuthenticated ? (
                  <Button variant="destructive" size="sm" onClick={logoutYoutube} className="w-full">
                    Sign Out
                  </Button>
                ) : (
                  <Button variant="default" size="sm" onClick={handleLogin} disabled={isLoggingIn} className="w-full">
                    {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sign in with Google
                  </Button>
                )}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-white transition-colors"
            onClick={() => window.electronAPI.openExternalLink('https://github.com/Shaikh-Suja-Rahaman/YT-Forge')}
          >
            <Github className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Support this project ❤️
        </TooltipContent>
      </Tooltip>
    </header>
  );
};

export default Header;
