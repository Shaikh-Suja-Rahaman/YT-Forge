import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Search, Github } from 'lucide-react';

const Header = () => {
  const { url, handleUrlChange, handleFetchDetails, isLoading, isDownloading } = useAppContext();

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
