import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../contexts/AppContext';
import CookieSettings from './CookieSettings';

const SettingsView = () => {
  const { setShowSettings } = useAppContext();

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowSettings(false)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-4">
        <div className="max-w-2xl space-y-6">
          <CookieSettings />
          {/* Add more settings components here in the future */}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
