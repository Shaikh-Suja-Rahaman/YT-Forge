import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, FileText, Trash2, Upload, ExternalLink } from 'lucide-react';

const CookieSettings = () => {
  const [cookieInfo, setCookieInfo] = useState({ status: 'missing', ageInDays: 0, path: '' });
  const [error, setError] = useState(null);

  const refreshInfo = async () => {
    const info = await window.electronAPI.getCookiesInfo();
    setCookieInfo(info);
    setError(null);
  };

  useEffect(() => {
    refreshInfo();
  }, []);

  const handleSelectFile = async () => {
    const result = await window.electronAPI.selectCookiesFile();
    if (result.canceled) return;
    
    if (result.valid) {
      setCookieInfo({
        status: result.status,
        ageInDays: result.ageInDays,
        path: result.path
      });
      setError(null);
    } else {
      setError(result.reason);
    }
  };

  const handleRemove = async () => {
    await window.electronAPI.removeCookies();
    await refreshInfo();
  };

  const renderBadge = () => {
    switch (cookieInfo.status) {
      case 'ok':
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 gap-1.5 py-1 px-2.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Loaded (updated {Math.floor(cookieInfo.ageInDays)} days ago)
          </Badge>
        );
      case 'stale':
        return (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 gap-1.5 py-1 px-2.5">
            <AlertCircle className="w-3.5 h-3.5" />
            May be expired (older than 14 days)
          </Badge>
        );
      case 'missing':
      default:
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5 py-1 px-2.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Not set
          </Badge>
        );
    }
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Cookie Management</CardTitle>
          {renderBadge()}
        </div>
        <CardDescription>
          Required for downloading age-restricted videos.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {cookieInfo.status !== 'missing' ? (
          <div className="flex items-center justify-between p-3 rounded-md bg-secondary/50 border border-border/50">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-2 bg-background rounded text-muted-foreground">
                <FileText className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="text-sm font-medium truncate">{cookieInfo.path}</p>
                <p className="text-xs text-muted-foreground">cookies.txt</p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Button variant="outline" size="sm" onClick={handleSelectFile} className="gap-1.5 h-8">
                <Upload className="w-3.5 h-3.5" /> Replace
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRemove} className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full gap-2 border-dashed" onClick={handleSelectFile}>
            <Upload className="w-4 h-4" />
            Select cookies.txt
          </Button>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-primary" />
            How to get your cookies
          </h4>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside ml-1">
            <li>
              Install the "Get cookies.txt LOCALLY" extension.
              <div className="flex gap-3 mt-2 ml-4 mb-3">
                <Button variant="link" className="h-auto p-0 text-xs gap-1" onClick={() => window.electronAPI.openExternalLink('https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpgnnhmhfjkik')}>
                  Chrome Web Store <ExternalLink className="w-3 h-3" />
                </Button>
                <Button variant="link" className="h-auto p-0 text-xs gap-1" onClick={() => window.electronAPI.openExternalLink('https://addons.mozilla.org/en-US/firefox/addon/get-cookies-txt-locally/')}>
                  Firefox Add-ons <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </li>
            <li>Log into YouTube in your browser.</li>
            <li>Click the extension icon and export <code className="bg-background px-1.5 py-0.5 rounded text-foreground text-xs font-mono">cookies.txt</code>.</li>
            <li>Select that file using the button above.</li>
          </ol>
          <div className="mt-4 pt-3 border-t border-border/50 flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-500/70" />
            <p>Your file stays entirely on your device. YT-FORGE never uploads or reads its contents for any other purpose.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CookieSettings;
