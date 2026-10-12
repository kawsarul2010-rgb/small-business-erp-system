import { Component } from '@angular/core';
import { LegalLayout } from '../legal/legal-layout';
import { GuideView } from './guide-view';

/** "User guide" in the menu: the sections for the signed-in user's role. */
@Component({
  selector: 'app-guide-page',
  imports: [GuideView],
  template: `<div class="page"><app-guide-view /></div>`,
})
export class GuidePage {}

/** The same guide for anyone, signed in or not - linked from the sign-in and sign-up screens. */
@Component({
  selector: 'app-help-page',
  imports: [LegalLayout, GuideView],
  template: `<app-legal-layout [plain]="true"><app-guide-view [forRole]="false" /></app-legal-layout>`,
})
export class HelpPage {}
