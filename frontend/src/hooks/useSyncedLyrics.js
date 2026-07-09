/**
 * useSyncedLyrics — parses .lrc format and tracks current line
 */
import { useState, useEffect } from 'react';
import { useAppStore } from '../store';

export function useSyncedLyrics(syncedLyrics) {
  const [lines, setLines] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const currentTime = useAppStore((s) => s.currentTime);

  useEffect(() => {
    if (!syncedLyrics || syncedLyrics.trim().length === 0) {
      setLines([]);
      return;
    }

    const parsed = [];
    // Match various LRC formats: [mm:ss.xx], [mm:ss.xxx], [mm:ss]
    const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/g;
    let match;

    while ((match = regex.exec(syncedLyrics)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const frac = match[3] ? parseInt(match[3].padEnd(2, '0'), 10) : 0;
      const time = minutes * 60 + seconds + frac / 100;
      const text = match[4].trim();

      if (text.length > 0) {
        parsed.push({ time, text });
      }
    }

    parsed.sort((a, b) => a.time - b.time);
    setLines(parsed);
    setCurrentIndex(parsed.length > 0 ? 0 : -1);
  }, [syncedLyrics]);

  useEffect(() => {
    if (lines.length === 0) { setCurrentIndex(-1); return; }

    let idx = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].time - 0.3) { idx = i; break; }
    }
    setCurrentIndex(idx);
  }, [currentTime, lines]);

  return { lines, currentIndex };
}
