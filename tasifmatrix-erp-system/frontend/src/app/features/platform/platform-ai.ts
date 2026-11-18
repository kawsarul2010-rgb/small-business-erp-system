import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService, errorMessage } from '../../core/api.service';
import { LayoutService } from '../../core/layout.service';
import { AiBusiness, AiModel, AiSettings, AiTestResult, HelpEvalRun } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { applyServerErrors, controlError } from '../../shared/form-errors';

/** Offered when the model list cannot be loaded (no key yet): the ids the app knows the price of. */
const KNOWN_MODELS: AiModel[] = [
  { id: 'claude-haiku-5-5', displayName: 'Claude Haiku 5.5', inputPricePerMillion: 0.1, outputPricePerMillion: 0.5 },
  { id: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', inputPricePerMillion: 2, outputPricePerMillion: 10 },
  { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', inputPricePerMillion: 4, outputPricePerMillion: 20 },
];

/**
 * The super admin's AI page: AI on/off, which model each feature uses, effort and limits, which
 * businesses have AI, what they used this month, and the help assistant's eval run.
 */
@Component({
  selector: 'app-platform-ai',
  imports: [TranslatePipe, DatePipe, DecimalPipe, ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressBarModule, MatSelectModule, MatSlideToggleModule, MatTooltipModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>{{ 'AI settings' | t }}</h1>
          <div class="subtitle">{{ 'Which model each AI feature uses, the daily limit, and which businesses have AI. The API key is a server variable (ANTHROPIC_API_KEY), never stored here.' | t }}</div>
        </div>
      </div>

      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }

      @if (settings(); as s) {
        @if (!s.keyConfigured) {
          <div class="card card-pad warn">
            <mat-icon>key_off</mat-icon>
            <div>{{ 'No API key on the server yet. Create one in the Claude Console, add it in Railway → your service → Variables as ANTHROPIC_API_KEY, and redeploy. Settings can be saved now.' | t }}</div>
          </div>
        }

        <form class="card card-pad" [formGroup]="form" (ngSubmit)="save()">
          <h2 class="card-title">{{ 'Settings' | t }}</h2>
          <mat-slide-toggle formControlName="aiEnabled">{{ 'AI features on for the platform' | t }}</mat-slide-toggle>
          <p class="muted hint">{{ 'Off: no business can use AI, whatever its own switch says.' | t }}</p>

          <div class="form-grid">
            <mat-form-field>
              <mat-label>{{ 'Help assistant model' | t }}</mat-label>
              <mat-select formControlName="helpModel">
                @for (m of modelChoices(); track m.id) { <mat-option [value]="m.id">{{ m.displayName }} <span class="muted">({{ m.id }}){{ price(m) }}</span></mat-option> }
              </mat-select>
              <mat-hint>{{ 'Answers from the user guide.' | t }}</mat-hint>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ '"Ask your business" model' | t }}</mat-label>
              <mat-select formControlName="businessModel">
                @for (m of modelChoices(); track m.id) { <mat-option [value]="m.id">{{ m.displayName }} <span class="muted">({{ m.id }}){{ price(m) }}</span></mat-option> }
              </mat-select>
              <mat-hint>{{ 'Answers from each business\'s own figures.' | t }}</mat-hint>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Memo scan model' | t }}</mat-label>
              <mat-select formControlName="memoModel">
                @for (m of modelChoices(); track m.id) { <mat-option [value]="m.id">{{ m.displayName }} <span class="muted">({{ m.id }}){{ price(m) }}</span></mat-option> }
              </mat-select>
              <mat-hint>{{ 'Reads supplier memo photos into purchase orders. Handwriting reads better on a larger model.' | t }}</mat-hint>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Thinking effort' | t }}</mat-label>
              <mat-select formControlName="effort">
                <mat-option value="low">{{ 'Low - fastest and cheapest' | t }}</mat-option>
                <mat-option value="medium">{{ 'Medium' | t }}</mat-option>
                <mat-option value="high">{{ 'High - slower, for hard questions' | t }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Questions per business per day' | t }}</mat-label>
              <input matInput type="number" min="1" max="10000" formControlName="dailyLimitPerBusiness" />
              <mat-error>{{ err('dailyLimitPerBusiness', 'Daily limit') }}</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'Longest answer (tokens)' | t }}</mat-label>
              <input matInput type="number" min="256" max="16000" formControlName="maxOutputTokens" />
              <mat-hint>{{ 'Includes the model\\'s thinking. 2048 is plenty for help answers.' | t }}</mat-hint>
              <mat-error>{{ err('maxOutputTokens', 'Longest answer') }}</mat-error>
            </mat-form-field>
          </div>
          @if (modelsError()) { <p class="muted small">{{ 'Model list: {error}' | t: { error: modelsError() } }}</p> }
          @if (error()) { <p class="negative">{{ error() }}</p> }

          <div class="actions-row">
            <span class="muted small">{{ 'Last changed {date} by {name}' | t: { date: (s.updatedDate | date: 'dd MMM yyyy, h:mm a'), name: s.updatedByUserName } }}</span>
            <span class="spacer"></span>
            <button mat-stroked-button type="button" [disabled]="testing() || !s.keyConfigured" (click)="test()"><mat-icon>bolt</mat-icon>{{ 'Test the model' | t }}</button>
            <button mat-flat-button type="submit" [disabled]="saving()">{{ 'Save' | t }}</button>
          </div>
          @if (testResult(); as r) {
            <div class="test-result">
              <div><strong>{{ r.model }}</strong> · {{ r.latencyMs | number }} ms · {{ r.inputTokens }} + {{ r.outputTokens }} {{ 'tokens' | t }}@if (r.costUsd !== null) { · \${{ r.costUsd | number: '1.6-6' }} }</div>
              <div class="reply">{{ r.reply }}</div>
            </div>
          }
        </form>

        <section class="card">
          <div class="card-pad head-row">
            <div>
              <h2 class="card-title">{{ 'Businesses' | t }}</h2>
              <div class="muted small">{{ 'This month: questions answered, failed, cost and thumbs up/down. The questions themselves are not stored.' | t }}</div>
            </div>
            <div class="total">{{ 'Total this month' | t }}: <strong>\${{ totalCost() | number: '1.2-4' }}</strong></div>
          </div>
          <div class="table-wrap">
            <table class="plain">
              <thead><tr><th>{{ 'Business' | t }}</th><th>{{ 'AI' | t }}</th><th class="num">{{ 'Questions' | t }}</th><th class="num">{{ 'Failed' | t }}</th><th class="num">{{ 'Cost (USD)' | t }}</th><th class="num">👍 / 👎</th><th class="num">{{ 'Memo scans' | t }}</th><th class="num">{{ 'Memo lines kept' | t }}</th><th>{{ 'Last used' | t }}</th></tr></thead>
              <tbody>
                @for (b of businesses(); track b.uuid) {
                  <tr>
                    <td>{{ b.tenantName }} <span class="code">{{ b.tenantCode }}</span></td>
                    <td><mat-slide-toggle [checked]="b.aiEnabled" (change)="setBusiness(b, $event.checked)" [attr.aria-label]="'AI for {name}' | t: { name: b.tenantName }" /></td>
                    <td class="num">{{ b.questions }}</td>
                    <td class="num" [class.negative]="b.failed > 0">{{ b.failed }}</td>
                    <td class="num">{{ b.costUsd | number: '1.2-4' }}</td>
                    <td class="num">{{ b.thumbsUp }} / {{ b.thumbsDown }}</td>
                    <td class="num">{{ b.memoScans }}</td>
                    <td class="num" [matTooltip]="'Lines saved exactly as read, of the lines in saved scans' | t">
                      @if (b.memoLines > 0) { {{ b.memoLinesKept * 100 / b.memoLines | number: '1.0-0' }}% <span class="muted">({{ b.memoLinesKept }}/{{ b.memoLines }})</span> }
                    </td>
                    <td class="muted nowrap">{{ b.lastUsed ? (b.lastUsed | date: 'dd MMM, h:mm a') : '' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="card card-pad">
          <div class="head-row">
            <div>
              <h2 class="card-title">{{ 'Evals' | t }}</h2>
              <div class="muted small">{{ 'Help: asks every test question and checks the answer cites the right guide section (or none, for questions outside the app). My business: runs with fixed test figures - never a business\'s data - and checks the tools called, the numbers repeated, what a manager is refused, and that names in the data cannot give orders. Run both after changing a model. Each run costs a few US cents.' | t }}</div>
            </div>
            <div class="eval-buttons">
              <button mat-stroked-button [disabled]="evaluating() || !s.keyConfigured" (click)="runEvals('help')"><mat-icon>play_arrow</mat-icon>{{ 'Run help evals' | t }}</button>
              <button mat-stroked-button [disabled]="evaluating() || !s.keyConfigured" (click)="runEvals('business')"><mat-icon>play_arrow</mat-icon>{{ 'Run business evals' | t }}</button>
            </div>
          </div>
          @if (evaluating()) { <mat-progress-bar mode="indeterminate" /> }
          @if (evalRun(); as run) {
            <div class="score" [class.good]="run.scorePercent >= 85">
              {{ (evalKind() === 'business' ? 'My business' : 'Help') | t }}: {{ run.passed }} / {{ run.total }} ({{ run.scorePercent }}%) · {{ run.model }} · {{ run.averageLatencyMs | number }} ms {{ 'average' | t }} · \${{ run.costUsd | number: '1.4-4' }}
            </div>
            <div class="table-wrap">
              <table class="plain evals">
                <thead><tr><th></th><th>{{ 'Question' | t }}</th><th>{{ 'Expected' | t }}</th><th>{{ (evalKind() === 'business' ? 'Tools called' : 'Cited') | t }}</th><th>{{ 'Answer' | t }}</th></tr></thead>
                <tbody>
                  @for (i of run.items; track $index) {
                    <tr [class.fail]="!i.passed">
                      <td><mat-icon [class.ok]="i.passed">{{ i.passed ? 'check_circle' : 'cancel' }}</mat-icon></td>
                      <td>{{ i.question }}@if (i.searches.length) { <div class="muted small">{{ (evalKind() === 'business' ? 'Calls: {q}' : 'Searched: {q}') | t: { q: i.searches.join(' | ') } }}</div> }</td>
                      <td class="code expected">{{ i.expected.join(evalKind() === 'business' ? '\n' : ', ') }}</td>
                      <td class="code">{{ i.sources.join(', ') || '-' }}</td>
                      <td class="answer">{{ i.error ?? i.answer }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .card + .card, .card-pad + .card, form + section { margin-top: 16px; }
    .warn { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; background: var(--erp-tint-amber-bg); color: var(--erp-tint-amber-fg); }
    .hint { font-size: 12px; margin: 4px 0 16px; }
    .small { font-size: 12px; }
    .actions-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
    .spacer { flex: 1; }
    .test-result { margin-top: 12px; padding: 12px; border-radius: 10px; background: var(--erp-card-2); font-size: 13px; }
    .test-result .reply { margin-top: 6px; white-space: pre-line; }
    .head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .total { font-size: 14px; }
    table.plain { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.plain th { text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--erp-muted); padding: 10px 16px; border-bottom: 1px solid var(--erp-border); }
    table.plain td { padding: 8px 16px; border-bottom: 1px solid var(--erp-border); vertical-align: top; }
    table.plain .num { text-align: right; }
    .score { margin: 12px 0; font-weight: 600; color: var(--erp-chip-danger-fg); }
    .score.good { color: var(--erp-chip-success-fg); }
    .evals mat-icon { color: var(--erp-chip-danger-fg); font-size: 20px; width: 20px; height: 20px; }
    .evals mat-icon.ok { color: var(--erp-chip-success-fg); }
    .evals .answer { white-space: pre-line; max-width: 420px; }
    .evals .expected { white-space: pre-line; }
    .eval-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
    .evals tr.fail td { background: var(--erp-chip-danger-bg); }
  `,
})
export class PlatformAiPage implements OnInit {
  readonly layout = inject(LayoutService);
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);

  readonly settings = signal<AiSettings | null>(null);
  readonly models = signal<AiModel[]>([]);
  readonly modelsError = signal<string | null>(null);
  readonly businesses = signal<AiBusiness[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly evaluating = signal(false);
  readonly error = signal<string | null>(null);
  readonly testResult = signal<AiTestResult | null>(null);
  readonly evalRun = signal<HelpEvalRun | null>(null);
  readonly evalKind = signal<'help' | 'business'>('help');
  readonly totalCost = computed(() => this.businesses().reduce((sum, b) => sum + b.costUsd, 0));

  readonly form = inject(FormBuilder).nonNullable.group({
    aiEnabled: [false],
    helpModel: ['claude-haiku-5-5', Validators.required],
    businessModel: ['claude-haiku-5-5', Validators.required],
    memoModel: ['claude-haiku-5-5', Validators.required],
    effort: ['low' as AiSettings['effort']],
    dailyLimitPerBusiness: [30, [Validators.required, Validators.min(1), Validators.max(10000)]],
    maxOutputTokens: [2048, [Validators.required, Validators.min(256), Validators.max(16000)]],
  });

  /** The models from the API (or the known ones), plus whatever is saved now so it always shows. */
  readonly modelChoices = computed(() => {
    const list = this.models().length ? this.models() : KNOWN_MODELS;
    const s = this.settings();
    const extra = [...new Set([s?.helpModel, s?.businessModel, s?.memoModel])].filter((id): id is string => !!id && !list.some((m) => m.id === id))
      .map((id) => ({ id, displayName: id, inputPricePerMillion: null, outputPricePerMillion: null }));
    return [...list, ...extra];
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.api.get<AiSettings>('/platform/ai/settings').subscribe({
      next: (s) => {
        this.apply(s);
        this.loading.set(false);
        if (s.keyConfigured) this.loadModels();
      },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
    this.loadBusinesses();
  }

  price(m: AiModel): string {
    return m.inputPricePerMillion !== null ? ` · $${m.inputPricePerMillion} / $${m.outputPricePerMillion} per M` : '';
  }

  err(name: string, label: string): string {
    return controlError(this.form.get(name), label);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.error.set(null);
    this.api.put<AiSettings>('/platform/ai/settings', this.form.getRawValue()).subscribe({
      next: (s) => { this.apply(s); this.saving.set(false); this.notify.success('AI settings saved.'); },
      error: (e) => { this.error.set(applyServerErrors(this.form, e)); this.saving.set(false); },
    });
  }

  test(): void {
    this.testing.set(true);
    this.testResult.set(null);
    this.api.post<AiTestResult>('/platform/ai/test', { model: this.form.controls.helpModel.value }).subscribe({
      next: (r) => { this.testResult.set(r); this.testing.set(false); },
      error: (e) => { this.notify.error(e); this.testing.set(false); },
    });
  }

  setBusiness(b: AiBusiness, on: boolean): void {
    this.api.put<void>(`/platform/ai/businesses/${b.uuid}`, { aiEnabled: on }).subscribe({
      next: () => {
        this.businesses.update((list) => list.map((x) => (x.uuid === b.uuid ? { ...x, aiEnabled: on } : x)));
        this.notify.success(on ? 'AI turned on for {name}.' : 'AI turned off for {name}.', { name: b.tenantName });
      },
      error: (e) => { this.notify.error(e); this.loadBusinesses(); },
    });
  }

  runEvals(kind: 'help' | 'business'): void {
    this.evaluating.set(true);
    this.evalRun.set(null);
    this.evalKind.set(kind);
    const model = kind === 'business' ? this.form.controls.businessModel.value : this.form.controls.helpModel.value;
    this.api.post<HelpEvalRun>(`/platform/ai/evals/${kind}`, { model }).subscribe({
      next: (r) => { this.evalRun.set(r); this.evaluating.set(false); },
      error: (e) => { this.notify.error(e); this.evaluating.set(false); },
    });
  }

  private apply(s: AiSettings): void {
    this.settings.set(s);
    this.form.reset({
      aiEnabled: s.aiEnabled, helpModel: s.helpModel, businessModel: s.businessModel, memoModel: s.memoModel, effort: s.effort,
      dailyLimitPerBusiness: s.dailyLimitPerBusiness, maxOutputTokens: s.maxOutputTokens,
    });
  }

  private loadModels(): void {
    this.api.get<AiModel[]>('/platform/ai/models').subscribe({
      next: (m) => { this.models.set(m); this.modelsError.set(null); },
      error: (e) => this.modelsError.set(errorMessage(e)),
    });
  }

  private loadBusinesses(): void {
    this.api.get<AiBusiness[]>('/platform/ai/businesses').subscribe({ next: (b) => this.businesses.set(b) });
  }
}
