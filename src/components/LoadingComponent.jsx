import React from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LoadingComponent = ({ onCancel }) => (
  <div className="flex flex-col items-center justify-center h-full gap-4">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-sm font-medium text-foreground/80">Fetching Video Info</span>
      <span className="text-xs text-muted-foreground/60">This may take a moment...</span>
    </div>
    {onCancel && (
      <Button
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="gap-1.5 text-muted-foreground hover:text-foreground text-xs"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Cancel
      </Button>
    )}
  </div>
);

export default LoadingComponent;
