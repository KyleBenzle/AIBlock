import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, sanitizeSettings, saveSettings } from '../storage/settings';
import type { Settings } from '../types';

const area = () => browser.storage.local as any;

export function useSettings(): [Settings, (fn: (s: Settings) => Settings) => void, boolean] {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    loadSettings(area()).then((v) => {
      setS(v);
      setLoaded(true);
    });
    const l = (c: Record<string, { newValue?: unknown }>, a: string) => {
      if (a === 'local' && c[SETTINGS_KEY]) setS(sanitizeSettings(c[SETTINGS_KEY].newValue));
    };
    browser.storage.onChanged.addListener(l);
    return () => browser.storage.onChanged.removeListener(l);
  }, []);
  const update = (fn: (s: Settings) => Settings) => {
    setS((cur) => {
      const next = fn(structuredClone(cur));
      saveSettings(area(), next);
      return next;
    });
  };
  return [s, update, loaded];
}

export function useTheme(theme: Settings['theme']) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
