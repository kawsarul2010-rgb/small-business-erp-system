import { Injectable, inject, signal } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { APP_INFO } from './app-info';
import { AppVersionCheck } from './models';
import { PlatformService } from './platform.service';

const LATER_KEY = 'tasifmatrix.updateLater';
/** "Later" on an optional update hides it for this long. */
const LATER_MS = 3 * 24 * 60 * 60 * 1000;
/** Coming back to the app checks again when the last check is older than this. */
const RECHECK_MS = 60 * 60 * 1000;
const FALLBACK_APP_ID = 'tasifmatrix.business.management.app';

/**
 * Asks the server whether this Android app is out of date (see the super admin's App versions).
 * A minor update is offered and can be put off; a major one blocks the app until it is updated.
 * The website is always the newest version, so it never asks.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly api = inject(ApiService);
  private readonly platform = inject(PlatformService);

  /** The latest answer; null until the first check (or on the website). */
  readonly check = signal<AppVersionCheck | null>(null);
  readonly installed = signal<string>(APP_INFO.version);
  /** The optional-update message is showing (cleared by Later). */
  readonly offerVisible = signal(false);

  private appId = FALLBACK_APP_ID;
  private lastCheck = 0;
  private started = false;

  /** Called once at start-up. */
  async start(): Promise<void> {
    if (!this.platform.isNative || this.started) return;
    this.started = true;
    try {
      const info = await CapacitorApp.getInfo();
      if (info.version) this.installed.set(info.version);
      if (info.id) this.appId = info.id;
    } catch {
      /* the bundled version is the same as the installed one */
    }
    await this.refresh();
    CapacitorApp.addListener('resume', () => {
      if (Date.now() - this.lastCheck > RECHECK_MS) void this.refresh();
    }).catch(() => undefined);
  }

  async refresh(): Promise<void> {
    this.lastCheck = Date.now();
    try {
      const c = await firstValueFrom(this.api.get<AppVersionCheck>('/app/version', { platform: 'android', current: this.installed() }));
      this.check.set(c);
      this.offerVisible.set(c.advice === 'OPTIONAL' && !this.putOff(c.latestVersion));
    } catch {
      /* offline or server unreachable: never block the app for that */
    }
  }

  /** "Later" on an optional update: ask again in a few days, or as soon as a newer version appears. */
  later(): void {
    this.offerVisible.set(false);
    try {
      localStorage.setItem(LATER_KEY, JSON.stringify({ version: this.check()?.latestVersion, at: Date.now() }));
    } catch {
      /* asked again next time */
    }
  }

  /** Opens the app's page in Google Play, where the Update button is. */
  openStore(): void {
    window.open(`https://play.google.com/store/apps/details?id=${encodeURIComponent(this.appId)}`, '_system');
  }

  private putOff(version: string | null): boolean {
    try {
      const saved = JSON.parse(localStorage.getItem(LATER_KEY) ?? 'null') as { version?: string; at?: number } | null;
      return !!saved && saved.version === version && Date.now() - (saved.at ?? 0) < LATER_MS;
    } catch {
      return false;
    }
  }
}
