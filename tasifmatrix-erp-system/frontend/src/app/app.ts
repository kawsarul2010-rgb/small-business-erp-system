import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlatformService } from './core/platform.service';
import { ThemeService } from './core/theme.service';
import { IconFontService } from './shared/icon-font.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App implements OnInit {
  private readonly platform = inject(PlatformService);
  private readonly icons = inject(IconFontService);
  /** Created at start-up so the light/dark choice (and the system setting) is applied everywhere. */
  private readonly theme = inject(ThemeService);

  ngOnInit(): void {
    this.icons.start();
    void this.platform.initialize();
  }
}
