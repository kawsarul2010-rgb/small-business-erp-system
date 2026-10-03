import { Injectable, effect, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { APP_INFO } from './app-info';
import { t } from './i18n/i18n';

/**
 * Keeps the browser title in sync and exposes the current page title as a signal
 * so the top bars can show it. The title is kept in English and translated where it is shown.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private static readonly AppName = APP_INFO.name;
  readonly pageTitle = signal<string>(AppTitleStrategy.AppName);

  constructor(private readonly title: Title) {
    super();
    // Re-runs when the page or the language changes.
    effect(() => {
      const page = this.pageTitle();
      const app = AppTitleStrategy.AppName;
      this.title.setTitle(page && page !== app ? `${t(page)} · ${app}` : app);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.pageTitle.set(this.buildTitle(snapshot) ?? AppTitleStrategy.AppName);
  }
}
