import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AiStore } from '../core/ai';
import { ApiService, errorMessage } from '../core/api.service';
import { currentLang } from '../core/i18n/i18n';
import { LayoutService } from '../core/layout.service';
import { PlatformService } from '../core/platform.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { AuthService } from '../core/auth.service';
import { AssistantLink, BusinessAnswer, HelpAnswer, HelpSource, HelpTurn } from '../core/models';

type Mode = 'help' | 'business';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: HelpSource[];
  links?: AssistantLink[];
  usageId?: string | null;
  rating?: 1 | -1 | null;
  error?: boolean;
}

/** Each tab keeps its conversation while the panel is closed and reopened, until the page is reloaded. */
const conversations: Record<Mode, ReturnType<typeof signal<ChatMessage[]>>> = { help: signal([]), business: signal([]) };

const MODE_KEY = 'tasifmatrix.assistant.mode';

const SUGGESTIONS: Record<Mode, Record<'en' | 'bn', string[]>> = {
  help: {
    en: ['How do I add a previous due for a customer?', 'How do I record a payment?', 'How do I enter my opening stock?'],
    bn: ['গ্রাহকের আগের বাকি কীভাবে যোগ করব?', 'পেমেন্ট কীভাবে যোগ করব?', 'শুরুর স্টক কীভাবে দেব?'],
  },
  business: {
    en: ['How much did I sell this month?', 'Which customers owe me the most?', 'Which products are low on stock?'],
    bn: ['এই মাসে কত বিক্রি হয়েছে?', 'কার কাছে সবচেয়ে বেশি বাকি?', 'কোন পণ্যের স্টক কম?'],
  },
};
const ADMIN_SUGGESTION = { en: 'What is my profit this month?', bn: 'এই মাসে লাভ কত হলো?' };

/**
 * The AI assistant, two tabs:
 *  - Help (AI plan, feature 1): how to do something in the app, answered from the user guide with links to it.
 *  - My business (feature 2, admins and managers): "How much does Karim owe?", answered from the
 *    business's own figures through read-only tools, with links to the screen each figure came from.
 */
@Component({
  selector: 'app-help-chat',
  imports: [TranslatePipe, FormsModule, RouterLink, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  template: `
    <div class="chat">
      <header class="head">
        <span class="icon-badge"><mat-icon>support_agent</mat-icon></span>
        <div class="titles">
          <h2>{{ 'Assistant' | t }}</h2>
          <div class="sub">{{ (mode() === 'business' ? 'Answers from your business figures. It can only read, never change.' : 'Answers from the user guide') | t }}@if (left() !== null) { · {{ '{n} questions left today' | t: { n: left() } }} }</div>
        </div>
        <button mat-icon-button mat-dialog-close [attr.aria-label]="'Close' | t"><mat-icon>close</mat-icon></button>
      </header>
      @if (canAskBusiness()) {
        <div class="modes">
          <mat-button-toggle-group [value]="mode()" (change)="setMode($event.value)" [attr.aria-label]="'Assistant' | t">
            <mat-button-toggle value="business"><mat-icon>bar_chart</mat-icon>{{ 'My business' | t }}</mat-button-toggle>
            <mat-button-toggle value="help"><mat-icon>menu_book</mat-icon>{{ 'Help' | t }}</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
      }

      <div class="messages" #scroller>
        @if (messages().length === 0) {
          <div class="welcome">
            <p>{{ (mode() === 'help' ? 'Ask how to do something in the app - in Bangla or English.'
              : auth.isAdmin() ? 'Ask about your sales, dues, stock, purchases and profit - in Bangla or English.'
              : 'Ask about your sales, customer dues and stock - in Bangla or English.') | t }}</p>
            <div class="suggestions">
              @for (s of suggestions(); track s) { <button mat-stroked-button (click)="ask(s)">{{ s }}</button> }
            </div>
          </div>
        }
        @for (m of messages(); track $index) {
          <div class="msg" [class.user]="m.role === 'user'" [class.error]="m.error">
            <div class="bubble">{{ m.text }}</div>
            @if (m.sources?.length) {
              <div class="sources">
                <span class="muted">{{ 'From the guide:' | t }}</span>
                @for (s of m.sources; track s.sectionId) {
                  <a class="source" routerLink="/guide" [fragment]="s.sectionId" (click)="ref.close()"><mat-icon>menu_book</mat-icon>{{ s.title }}</a>
                }
              </div>
            }
            @if (m.links?.length) {
              <div class="sources">
                @for (l of m.links; track $index) {
                  <a class="source" [routerLink]="l.route" [queryParams]="l.query ?? {}" (click)="ref.close()"><mat-icon>open_in_new</mat-icon>{{ l.label | t: (l.params ?? undefined) }}</a>
                }
              </div>
            }
            @if (m.role === 'assistant' && m.usageId) {
              <div class="rate">
                <button mat-icon-button [class.on]="m.rating === 1" [disabled]="!!m.rating" (click)="rate(m, 1)"
                        [matTooltip]="'Helpful' | t" [attr.aria-label]="'Helpful' | t"><mat-icon>thumb_up</mat-icon></button>
                <button mat-icon-button [class.on]="m.rating === -1" [disabled]="!!m.rating" (click)="rate(m, -1)"
                        [matTooltip]="'Not helpful' | t" [attr.aria-label]="'Not helpful' | t"><mat-icon>thumb_down</mat-icon></button>
                @if (m.rating) { <span class="muted thanks">{{ 'Thanks for the feedback.' | t }}</span> }
              </div>
            }
          </div>
        }
        @if (busy()) {
          <div class="msg"><div class="bubble thinking">{{ (mode() === 'business' ? 'Looking at your figures…' : 'Looking in the guide…') | t }}</div></div>
        }
      </div>
      @if (busy()) { <mat-progress-bar mode="indeterminate" /> }

      <form class="composer" (ngSubmit)="ask(draft())">
        <textarea [ngModel]="draft()" (ngModelChange)="draft.set($event)" name="q" rows="1" maxlength="500"
                  [placeholder]="'Type your question…' | t" (keydown.enter)="onEnter($event)" [disabled]="limitReached()"></textarea>
        <button mat-icon-button type="submit" class="send" [disabled]="busy() || !draft().trim() || limitReached()" [attr.aria-label]="'Send' | t">
          <mat-icon>send</mat-icon>
        </button>
      </form>
      <div class="note muted">{{ (limitReached() ? 'Your business has used today\\'s questions. The assistant is available again tomorrow.' : 'AI can make mistakes. If something looks wrong, check the user guide.') | t }}</div>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .chat { display: flex; flex-direction: column; height: min(78vh, 720px); }
    :host-context(.sheet-dialog) .chat { height: 100vh; height: 100dvh; }
    .head { display: flex; align-items: center; gap: 12px; padding: 14px 12px 12px 18px; border-bottom: 1px solid var(--erp-border); }
    .head h2 { margin: 0; font-size: 17px; }
    .modes { padding: 10px 18px; border-bottom: 1px solid var(--erp-border); }
    .modes mat-button-toggle-group { width: 100%; }
    .modes mat-button-toggle { flex: 1; }
    .modes mat-icon { font-size: 18px; width: 18px; height: 18px; margin-right: 6px; vertical-align: -4px; }
    .titles { flex: 1; min-width: 0; }
    .sub { font-size: 12px; color: var(--erp-muted); }
    .icon-badge { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--erp-brand-soft); color: var(--erp-brand-fg); }
    .messages { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; background: var(--erp-bg); }
    .welcome p { margin: 0 0 12px; color: var(--erp-muted); }
    .suggestions { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
    .suggestions button { white-space: normal; text-align: left; height: auto; padding: 8px 14px; line-height: 1.35; }
    .msg { display: flex; flex-direction: column; align-items: flex-start; max-width: 92%; }
    .msg.user { align-self: flex-end; align-items: flex-end; }
    .bubble { white-space: pre-line; line-height: 1.5; padding: 10px 14px; border-radius: 14px 14px 14px 4px; background: var(--erp-card); border: 1px solid var(--erp-border); }
    .msg.user .bubble { background: var(--erp-brand); color: #fff; border-color: transparent; border-radius: 14px 14px 4px 14px; }
    .msg.error .bubble { color: var(--erp-chip-danger-fg); background: var(--erp-chip-danger-bg); border-color: transparent; }
    .thinking { color: var(--erp-muted); font-style: italic; }
    .sources { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; }
    .source { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; background: var(--erp-brand-soft); color: var(--erp-brand-fg); text-decoration: none; font-weight: 500; }
    .source mat-icon { font-size: 15px; width: 15px; height: 15px; }
    .rate { display: flex; align-items: center; margin-top: 2px; }
    .rate button { transform: scale(.8); color: var(--erp-faint); }
    .rate button.on { color: var(--erp-brand); }
    .thanks { font-size: 12px; }
    .composer { display: flex; align-items: flex-end; gap: 6px; padding: 10px 10px 4px 16px; border-top: 1px solid var(--erp-border); background: var(--erp-card); }
    .composer textarea { flex: 1; resize: none; border: 1px solid var(--erp-border-strong); border-radius: 12px; padding: 10px 12px; font: inherit; max-height: 120px; background: var(--erp-card); color: var(--erp-text); field-sizing: content; }
    .composer textarea:focus { outline: 2px solid var(--erp-brand); outline-offset: -1px; }
    .send { color: var(--erp-brand); }
    .note { font-size: 11px; padding: 2px 16px 10px; background: var(--erp-card); }
  `,
})
export class HelpChat {
  readonly ref = inject(MatDialogRef<HelpChat>);
  private readonly api = inject(ApiService);
  private readonly ai = inject(AiStore);
  private readonly layout = inject(LayoutService);
  private readonly platform = inject(PlatformService);
  readonly auth = inject(AuthService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /** Admins and managers can also ask about the business's own figures. */
  readonly canAskBusiness = computed(() => !!this.ai.status()?.business);
  readonly mode = signal<Mode>(this.initialMode());
  readonly messages = computed(() => conversations[this.mode()]());
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly suggestions = computed(() => {
    const lang = currentLang() === 'bn' ? 'bn' : 'en';
    const list = SUGGESTIONS[this.mode()][lang];
    return this.mode() === 'business' && this.auth.isAdmin() ? [ADMIN_SUGGESTION[lang], ...list] : list;
  });
  readonly left = computed(() => {
    const s = this.ai.status();
    return s?.available ? Math.max(0, s.dailyLimit - s.usedToday) : null;
  });
  readonly limitReached = computed(() => this.left() === 0);

  constructor() {
    queueMicrotask(() => this.scrollDown());
  }

  onEnter(e: Event): void {
    const k = e as KeyboardEvent;
    if (k.shiftKey || k.isComposing) return; // Shift+Enter: new line; Bangla keyboards compose with Enter.
    e.preventDefault();
    this.ask(this.draft());
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* not remembered */ }
    this.scrollDown();
  }

  private initialMode(): Mode {
    if (!this.ai.status()?.business) return 'help';
    try { return localStorage.getItem(MODE_KEY) === 'help' ? 'help' : 'business'; } catch { return 'business'; }
  }

  ask(text: string): void {
    const question = text.trim();
    if (!question || this.busy() || this.limitReached()) return;
    const mode = this.mode();
    const conversation = conversations[mode];
    // The last few exchanges, so a follow-up ("and for last month?") is understood.
    const history: HelpTurn[] = conversation().filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    conversation.update((list) => [...list, { role: 'user', text: question }]);
    this.draft.set('');
    this.busy.set(true);
    this.scrollDown();
    const done = (reply: ChatMessage, usedToday: number, dailyLimit: number) => {
      conversation.update((list) => [...list, reply]);
      this.ai.used(usedToday, dailyLimit);
      this.busy.set(false);
      this.scrollDown();
    };
    const failed = (e: unknown) => {
      conversation.update((list) => [...list, { role: 'assistant', text: errorMessage(e), error: true }]);
      this.busy.set(false);
      this.ai.load();
      this.scrollDown();
    };
    if (mode === 'business') {
      this.api.post<BusinessAnswer>('/ai/business/ask', { question, lang: currentLang(), history }).subscribe({
        next: (a) => done({ role: 'assistant', text: a.answer, links: a.links, usageId: a.usageId, rating: null }, a.usedToday, a.dailyLimit),
        error: failed,
      });
      return;
    }
    // The guide's steps differ a little on a computer ("Click ... in the left menu").
    const device = this.platform.isNative || this.layout.isHandset() ? 'mobile' : 'desktop';
    this.api.post<HelpAnswer>('/ai/help/ask', { question, lang: currentLang(), history, device }).subscribe({
      next: (a) => done({ role: 'assistant', text: a.answer, sources: a.sources, usageId: a.usageId, rating: null }, a.usedToday, a.dailyLimit),
      error: failed,
    });
  }

  rate(m: ChatMessage, rating: 1 | -1): void {
    if (!m.usageId || m.rating) return;
    conversations[this.mode()].update((list) => list.map((x) => (x === m ? { ...x, rating } : x)));
    this.api.post<void>(`/ai/answers/${m.usageId}/rating`, { rating }).subscribe({ error: () => undefined });
  }

  private scrollDown(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
