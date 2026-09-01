import { Injectable, inject } from '@angular/core';
import { ConfirmationService } from 'primeng/api';

/**
 * Wrapper `async/await` sobre el `ConfirmationService` de PrimeNG — para
 * reemplazar el `confirm()` nativo del navegador sin reescribir la lógica de
 * cada `eliminar()`: `if (!(await this.confirm.ask('¿Borrar?'))) return;`.
 *
 * El `<p-confirmDialog>` global vive en `app.ts` (ConfirmationService es
 * singleton, ver app.config.ts).
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly confirmSvc = inject(ConfirmationService);

  /**
   * Muestra el diálogo y resuelve `true` si el usuario acepta, `false` si
   * cancela o lo cierra.
   */
  ask(
    message: string,
    opts: { header?: string; acceptLabel?: string; rejectLabel?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.confirmSvc.confirm({
        message,
        header: opts.header ?? 'Confirmar',
        icon: 'pi pi-exclamation-triangle',
        acceptButtonProps: {
          label: opts.acceptLabel ?? 'Aceptar',
          severity: opts.danger === false ? 'primary' : 'danger',
        },
        rejectButtonProps: {
          label: opts.rejectLabel ?? 'Cancelar',
          severity: 'secondary',
          outlined: true,
        },
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }
}
