import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { PlatformService } from './platform.service';

/**
 * The super admin's posts as this screen sees them. The Android app asks for "app" posts and the
 * website for "web" posts, because a post can be meant for only one of them.
 * Holds the unread count for the menu badge.
 */
@Injectable({ providedIn: 'root' })
export class PostsStore {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly platform = inject(PlatformService);

  readonly unread = signal(0);
  private loadedAt = 0;
  private static readonly STALE_MS = 3 * 60_000;

  /** "app" inside the Android app, "web" in a browser (phone or computer). */
  get channel(): 'app' | 'web' {
    return this.platform.isNative ? 'app' : 'web';
  }

  /** Refreshes the badge. Businesses only: the super admin writes posts, it does not receive them. */
  loadUnread(): void {
    const user = this.auth.user();
    if (!user || user.role === 'SUPER_ADMIN') {
      this.unread.set(0);
      return;
    }
    this.loadedAt = Date.now();
    this.api.get<{ count: number }>('/posts/unread-count', { channel: this.channel }).subscribe({
      next: (r) => this.unread.set(r.count),
      error: () => this.unread.set(0),
    });
  }

  /** Reloads the count when it is a few minutes old. */
  refreshIfStale(): void {
    if (Date.now() - this.loadedAt > PostsStore.STALE_MS) this.loadUnread();
  }

  /** Everything shown so far counts as read. */
  markSeen(): void {
    this.unread.set(0);
    this.api.post<void>('/posts/seen').subscribe({ error: () => undefined });
  }
}
