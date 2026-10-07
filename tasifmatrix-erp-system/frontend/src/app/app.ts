import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlatformService } from './core/platform.service';
import { ThemeService } from './core/theme.service';
import { applyDocumentLang } from './core/i18n/i18n';
import { IconFontService } from './shared/icon-font.service';
import { AppUpdateService } from './core/app-update';
import { AppUpdateGate } from './shared/app-update-gate';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppUpdateGate],
  template: `<router-outlet /><app-update-gate />`,
})
export class App implements OnInit {
  private readonly platform = inject(PlatformService);
  private readonly icons = inject(IconFontService);
  /** Created at start-up so the light/dark choice (and the system setting) is applied everywhere. */
  private readonly theme = inject(ThemeService);
  private readonly updates = inject(AppUpdateService);

  ngOnInit(): void {
    this.icons.start();
    applyDocumentLang();
    void this.platform.initialize();
    // Android app only: is a newer version on Google Play, and must it be installed?
    void this.updates.start();
  }
}
