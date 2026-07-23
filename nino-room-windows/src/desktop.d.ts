export {};

declare global {
  interface Window {
    ninoDesktop: {
      getWindowState(): Promise<{ zoom: number; fullScreen: boolean }>;
      setZoom(zoom: number): Promise<void>;
      toggleFullScreen(): Promise<void>;
      onZoomChanged(listener: (zoom: number) => void): () => void;
      listFiles(): Promise<DesktopFile[]>;
      pickFiles(): Promise<DesktopFile[]>;
      removeFile(path: string): Promise<DesktopFile[]>;
    };
  }
  type DesktopFile = { name: string; path: string; url: string; size: number };
}
