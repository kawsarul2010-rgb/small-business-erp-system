import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { AiStatus } from './models';

/**
 * Whether this business may use the AI assistant (the super admin turns it on per business), and
 * how many questions are left today. The help button shows only when it is available.
 */
@Injectable({ providedIn: 'root' })
export class AiStore {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly status = signal<AiStatus | null>(null);

  load(): void {
    const user = this.auth.user();
    if (!user || user.role === 'SUPER_ADMIN') {
      this.status.set(null);
      return;
    }
    this.api.get<AiStatus>('/ai/status').subscribe({
      next: (s) => this.status.set(s),
      error: () => this.status.set(null),
    });
  }

  /** After an answer: the server says how many questions the business has used today. */
  used(usedToday: number, dailyLimit: number): void {
    this.status.update((s) => ({ available: true, business: s?.business ?? false, memo: s?.memo ?? false, usedToday, dailyLimit }));
  }
}
