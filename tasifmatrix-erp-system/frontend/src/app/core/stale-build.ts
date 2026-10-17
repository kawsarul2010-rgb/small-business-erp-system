import { NavigationError } from '@angular/router';

const RELOADED_KEY = 'tasifmatrix.reloadedAt';

/**
 * True when a screen's code file could not be loaded. That happens to a tab left open across a
 * new release: the old build's files are gone from the server, so the next screen it has not
 * opened yet (often the login page after "Log out") fails to load and the page stays as it was.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(message);
}

/**
 * Loads <paramref name="url"/> as a fresh page, which fetches the new release. At most once a
 * minute, so a file that is really missing cannot reload the page forever. False when skipped.
 */
export function reloadTo(url: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: reload anyway */
  }
  window.location.assign(url);
  return true;
}

/** Router error handler: a screen from an older release that no longer exists -> reload into the new one. */
export function onNavigationError(e: NavigationError): void {
  if (isChunkLoadError(e.error)) reloadTo(e.url);
}
