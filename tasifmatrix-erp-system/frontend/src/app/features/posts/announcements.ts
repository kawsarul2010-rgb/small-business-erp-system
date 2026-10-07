import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ApiService, problemOf } from '../../core/api.service';
import { APP_INFO } from '../../core/app-info';
import { PostItem } from '../../core/models';
import { PostsStore } from '../../core/posts';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PostBody } from '../../shared/post-body';

/**
 * Posts from the super admin for this business: news, maintenance notices, tips. Pinned posts
 * stay on top; posts that arrived since the last visit are marked New. Opening the page marks
 * everything as read. Open even when the subscription has run out.
 */
@Component({
  selector: 'app-announcements',
  imports: [TranslatePipe, DatePipe, MatIconModule, MatProgressBarModule, PostBody],
  template: `
    <div class="page narrow">
      <div class="page-header">
        <div>
          <h1>{{ 'Announcements' | t }}</h1>
          <div class="subtitle">{{ 'News and notices from {name}.' | t: { name: product } }}</div>
        </div>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) { <div class="card card-pad negative">{{ error() | t }}</div> }

      @for (p of posts(); track p.uuid) {
        <article class="card post" [class.pinned]="p.isPinned" [class.unread]="p.unread">
          <header class="post-head">
            <span class="post-icon"><mat-icon>{{ p.isPinned ? 'push_pin' : 'campaign' }}</mat-icon></span>
            <div class="post-title">
              <h2>{{ p.title }}</h2>
              <div class="meta">
                <time [attr.datetime]="p.publishedDate">{{ p.publishedDate | date: 'd MMM yyyy, h:mm a' }}</time>
                @if (p.isPinned) { <span class="tag pin">{{ 'Pinned' | t }}</span> }
                @if (p.unread) { <span class="tag new">{{ 'New' | t }}</span> }
              </div>
            </div>
          </header>
          <app-post-body class="post-body" [text]="p.body" />
        </article>
      } @empty {
        @if (!loading() && !error()) {
          <div class="card empty-card">
            <span class="empty-icon"><mat-icon>campaign</mat-icon></span>
            <h2>{{ 'No announcements yet' | t }}</h2>
            <p>{{ 'News and notices from {name} will appear here.' | t: { name: product } }}</p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 860px; }
    .post { padding: 18px 20px 20px; margin-bottom: 14px; }
    .post.unread { border-left: 4px solid var(--erp-brand); }
    .post-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .post-icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px;
      background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .pinned .post-icon { background: var(--erp-tint-amber-bg); color: var(--erp-tint-amber-fg); }
    .post-icon mat-icon { font-size: 21px; width: 21px; height: 21px; }
    .post-title { min-width: 0; flex: 1; }
    .post-title h2 { margin: 0; font-size: 16.5px; font-weight: 700; line-height: 1.35; letter-spacing: -0.01em; overflow-wrap: anywhere; }
    .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 3px; font-size: 12.5px; color: var(--erp-muted); }
    .tag { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 999px; }
    .tag.pin { background: var(--erp-chip-warn-bg); color: var(--erp-chip-warn-fg); }
    .tag.new { background: var(--erp-brand); color: #fff; }
    .post-body { font-size: 14.5px; color: var(--erp-text); }
    .empty-card { padding: 44px 24px; text-align: center; }
    .empty-icon { display: inline-grid; place-items: center; width: 56px; height: 56px; border-radius: 18px; margin-bottom: 12px;
      background: var(--erp-tint-indigo-bg); color: var(--erp-tint-indigo-fg); }
    .empty-icon mat-icon { font-size: 28px; width: 28px; height: 28px; }
    .empty-card h2 { margin: 0 0 4px; font-size: 16px; font-weight: 650; }
    .empty-card p { margin: 0; color: var(--erp-muted); font-size: 13.5px; }
    @media (max-width: 600px) {
      .post { padding: 14px 14px 16px; }
      .post-icon { width: 36px; height: 36px; border-radius: 11px; }
    }
  `,
})
export class AnnouncementsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly store = inject(PostsStore);

  readonly product = APP_INFO.name;
  readonly posts = signal<PostItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.get<PostItem[]>('/posts', { channel: this.store.channel }).subscribe({
      next: (posts) => {
        this.posts.set(posts);
        this.loading.set(false);
        // "New" stays visible on this visit; next time these count as read.
        if (posts.some((p) => p.unread)) this.store.markSeen();
        else this.store.unread.set(0);
      },
      error: (e) => {
        this.error.set(problemOf(e).title ?? 'Could not load announcements.');
        this.loading.set(false);
      },
    });
  }
}
