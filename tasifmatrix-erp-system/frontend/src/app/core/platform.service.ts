import { t } from './i18n/i18n';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { Style, StatusBar } from '@capacitor/status-bar';

/**
 * Everything that behaves differently inside the Android app (Capacitor) compared to the browser:
 * status bar, splash screen, hardware back button and opening generated PDFs.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly router = inject(Router);

  readonly isNative = Capacitor.isNativePlatform();

  /** Called once at start-up from the root component. */
  async initialize(): Promise<void> {
    if (!this.isNative) return;
    try {
      // Light icons on the indigo app bar colour, in both light and dark mode.
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#2b2775' });
      Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => undefined);
      await SplashScreen.hide();
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        // Leave the app only from a top-level screen.
        if (canGoBack && !isRootRoute(this.router.url)) history.back();
        else void CapacitorApp.exitApp();
      });
    } catch {
      /* the app still works if a plugin is unavailable */
    }
  }

  /**
   * Opens a generated PDF. In the browser this is a new tab or a download;
   * in the Android app the file is written to the cache and handed to the system share/open sheet.
   */
  async openPdf(blob: Blob, fileName: string, download: boolean): Promise<void> {
    if (!this.isNative) {
      if (download) this.savePdf(blob, fileName);
      else {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      return;
    }

    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    await Share.share({ title: fileName, url: written.uri, dialogTitle: t('Open or share the PDF') });
  }

  /** Saves the PDF to the browser's downloads folder. */
  savePdf(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /**
   * Whether this platform can hand the file itself to a share sheet.
   *
   * On Android that is always true. In a browser it needs the Web Share API with file support,
   * which Safari has on macOS and iOS and Chrome has on Android and Windows - but not Chrome on
   * macOS or Firefox. Callers must offer another route when this is false, because there is no
   * way for a web page to attach a file to WhatsApp or an email on its own.
   */
  canShareFile(fileName = 'report.pdf'): boolean {
    if (this.isNative) return true;
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    try {
      return nav.canShare({ files: [new File([new Blob()], fileName, { type: 'application/pdf' })] });
    } catch {
      return false;
    }
  }

  /**
   * Hands the PDF to the system share sheet, where the user picks WhatsApp, email or anything
   * else installed. Returns false when the user dismissed the sheet without choosing.
   */
  async sharePdf(blob: Blob, fileName: string, title: string, text?: string): Promise<boolean> {
    if (this.isNative) {
      const base64 = await blobToBase64(blob);
      const written = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
      await Share.share({ title, text, url: written.uri, dialogTitle: t('Share the PDF') });
      return true;
    }

    const file = new File([blob], fileName, { type: 'application/pdf' });
    try {
      await navigator.share({ files: [file], title, text });
      return true;
    } catch (e) {
      // Dismissing the sheet is not a failure worth reporting.
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      // Some browsers reject files combined with a title or text; the file alone is what matters.
      if (e instanceof TypeError) {
        try {
          await navigator.share({ files: [file] });
          return true;
        } catch (inner) {
          if (inner instanceof DOMException && inner.name === 'AbortError') return false;
          throw inner;
        }
      }
      throw e;
    }
  }

  /** Opens an external address (WhatsApp Web, for instance) without keeping a handle on it. */
  openExternal(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Hands a mailto: link to whatever mail client the computer uses. Assigning to location is
   * deliberate: window.open on a mailto: leaves an empty tab behind in several browsers.
   */
  openMailClient(url: string): void {
    window.location.href = url;
  }
}

function isRootRoute(url: string): boolean {
  const path = url.split('?')[0];
  return ['/', '/sales-orders', '/purchase-orders', '/stock', '/more'].includes(path);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}
