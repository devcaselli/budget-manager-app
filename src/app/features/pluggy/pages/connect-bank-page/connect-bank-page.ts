import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { PluggyService } from '../../services/pluggy.service';
import { PluggyWidgetService } from '../../services/pluggy-widget.service';

@Component({
  selector: 'app-connect-bank-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './connect-bank-page.html',
  styleUrl: './connect-bank-page.scss',
})
export class ConnectBankPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly pluggyService = inject(PluggyService);
  private readonly pluggyWidget = inject(PluggyWidgetService);

  protected readonly isSaving = toSignal(this.pluggyService.saving$, { initialValue: false });
  protected readonly errorMessage = toSignal(this.pluggyService.error$, { initialValue: null });

  /** True while the widget is opening (token fetch + SDK load). */
  protected readonly opening = signal(false);
  protected readonly widgetError = signal<string | null>(null);

  protected connectBank(): void {
    this.opening.set(true);
    this.widgetError.set(null);

    this.pluggyService
      .getConnectToken()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (token) => this.openWidget(token),
        error: () => {
          this.opening.set(false);
          this.widgetError.set('Não foi possível iniciar a conexão. Tente novamente.');
        },
      });
  }

  private openWidget(token: string): void {
    this.pluggyWidget
      .open(token, {
        onSuccess: (itemId) => this.registerItem(itemId),
        onError: () => {
          this.opening.set(false);
          this.widgetError.set('O widget do Pluggy retornou um erro.');
        },
        onExit: () => this.opening.set(false),
      })
      .catch(() => {
        this.opening.set(false);
        this.widgetError.set('Não foi possível carregar o widget do Pluggy.');
      });
  }

  private registerItem(itemId: string): void {
    this.pluggyService
      .registerItem(itemId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.opening.set(false);
          void this.router.navigate(['/connected-accounts']);
        },
        error: () => {
          this.opening.set(false);
          this.widgetError.set('Conexão criada, mas não foi possível registrá-la.');
        },
      });
  }
}
