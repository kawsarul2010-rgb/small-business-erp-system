import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, map } from 'rxjs';
import { ConfirmDialog, ConfirmDialogData } from '../shared/confirm-dialog';
import { errorMessage } from './api.service';
import { TParams, t, tServer } from './i18n/i18n';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** English text (translated here) with optional {placeholders}. */
  success(message: string, params?: TParams): void {
    this.snack.open(t(message, params), t('OK'), { duration: 3500, panelClass: 'snack-success' });
  }

  /** A server error, or an English message (translated here). */
  error(error: unknown, params?: TParams): void {
    const text = typeof error === 'string' ? (params ? t(error, params) : tServer(error)) : errorMessage(error);
    this.snack.open(text, t('Close'), { duration: 8000, panelClass: 'snack-error' });
  }

  confirm(data: ConfirmDialogData): Observable<boolean> {
    return this.dialog
      .open(ConfirmDialog, { data, width: '440px', autoFocus: 'dialog' })
      .afterClosed()
      .pipe(map((r) => r === true));
  }
}
