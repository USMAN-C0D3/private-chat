import { useCallback, useEffect, useMemo, useState } from "react";

import type { Username } from "@/types/api";


const STORAGE_PREFIX = "premium-private-chat:wallpaper:";
const MAX_DIMENSION = 1600;
const OUTPUT_QUALITY = 0.82;


async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read the image."));
    };
    reader.onerror = () => reject(new Error("Unable to read the image."));
    reader.readAsDataURL(file);
  });
}


async function loadImage(source: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load the image."));
    image.src = source;
  });
}


async function compressWallpaper(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(rawDataUrl);
  const largestSide = Math.max(image.width, image.height);
  const scale = largestSide > MAX_DIMENSION ? MAX_DIMENSION / largestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return rawDataUrl;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#0f1014";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/webp", OUTPUT_QUALITY);
}


function getStorageKey(username: Username | null) {
  return `${STORAGE_PREFIX}${username ?? "guest"}`;
}


interface UseChatWallpaperState {
  wallpaperUrl: string | null;
  isProcessing: boolean;
  error: string | null;
  setWallpaperFromFile: (file: File | null) => Promise<void>;
  clearWallpaper: () => void;
  clearError: () => void;
}


export function useChatWallpaper(username: Username | null): UseChatWallpaperState {
  const storageKey = useMemo(() => getStorageKey(username), [username]);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(storageKey);
      setWallpaperUrl(storedValue);
    } catch {
      setWallpaperUrl(null);
    }
  }, [storageKey]);

  const setWallpaperFromFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        const nextWallpaperUrl = await compressWallpaper(file);
        window.localStorage.setItem(storageKey, nextWallpaperUrl);
        setWallpaperUrl(nextWallpaperUrl);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error && caughtError.message
            ? caughtError.message
            : "Unable to save this wallpaper.";
        setError(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [storageKey],
  );

  const clearWallpaper = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage cleanup issues and still clear the local state.
    }

    setWallpaperUrl(null);
  }, [storageKey]);

  return {
    wallpaperUrl,
    isProcessing,
    error,
    setWallpaperFromFile,
    clearWallpaper,
    clearError: () => setError(null),
  };
}
