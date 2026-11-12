import { Injectable, inject } from '@angular/core';
import { BrnDialogService } from '@spartan-ng/brain/dialog';
import { firstValueFrom } from 'rxjs';
import {
  ConfirmDialogComponent,
  type ConfirmDialogContext,
  type OpcionConfirm,
} from '../../shared/ui/confirm-dialog.component';

/**
 * Forma "PrimeNG" de una confirmación con callbacks. Se conserva para que las
 * pantallas que llamaban a `ConfirmationService.confirm({...})` migren solo
 * cambiando el servicio inyectado; los campos visuales de PrimeNG que ya no
 * aplican (icon, acceptButtonStyleClass...) se interpretan o se ignoran.
 */
export interface ConfirmacionCallbacks {
  message: string;
  header?: string;
  icon?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  acceptButtonProps?: { label?: string; severity?: string; [k: string]: unknown };
  rejectButtonProps?: { label?: string; [k: string]: unknown };
  acceptButtonStyleClass?: string;
  accept?: () => void | Promise<void>;
  reject?: () => void | Promise<void>;
}

/**
 * Confirmaciones globales con el diálogo de alerta de Spartan (`BrnDialogService`
 * + `ConfirmDialogComponent`). Cerrar con Esc cuenta como "no".
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialogs = inject(BrnDialogService);

  ask(
    message: string,
    opts: { header?: string; acceptLabel?: string; rejectLabel?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    const contexto: ConfirmDialogContext = {
      message,
      header: opts.header ?? 'Confirmar',
      acceptLabel: opts.acceptLabel ?? 'Aceptar',
      rejectLabel: opts.rejectLabel ?? 'Cancelar',
      danger: opts.danger !== false,
    };
    const ref = this.dialogs.open<ConfirmDialogContext, boolean>(ConfirmDialogComponent, undefined, contexto, {
      role: 'alertdialog',
      closeOnOutsidePointerEvents: false,
      autoFocus: 'first-tabbable',
      backdropClass: ['bg-black/50', 'backdrop-blur-[1px]'],
      panelClass: 'confirm-dialog-panel',
    });
    return firstValueFrom(ref.closed$, { defaultValue: undefined }).then((r) => r === true);
  }

  /**
   * Elegir entre varias acciones, siempre con "Cancelar" (2026-11-12). Antes una
   * pregunta de tres salidas se armaba con `ask` usando el botón de cancelar
   * como segunda acción ("Solo desactivar"), y el diálogo no tenía forma de
   * salir sin hacer nada. Devuelve el `id` elegido, o `null` si se canceló.
   */
  elegir(
    message: string,
    opciones: OpcionConfirm[],
    opts: { header?: string; cancelLabel?: string; danger?: boolean } = {},
  ): Promise<string | null> {
    const contexto: ConfirmDialogContext = {
      message,
      header: opts.header ?? 'Elige una opción',
      acceptLabel: '',
      rejectLabel: opts.cancelLabel ?? 'Cancelar',
      danger: opts.danger ?? opciones.some((o) => o.danger),
      opciones,
    };
    const ref = this.dialogs.open<ConfirmDialogContext, string | null>(ConfirmDialogComponent, undefined, contexto, {
      role: 'alertdialog',
      closeOnOutsidePointerEvents: false,
      autoFocus: 'first-tabbable',
      backdropClass: ['bg-black/50', 'backdrop-blur-[1px]'],
      panelClass: 'confirm-dialog-panel',
    });
    return firstValueFrom(ref.closed$, { defaultValue: undefined }).then((r) =>
      typeof r === 'string' && opciones.some((o) => o.id === r) ? r : null,
    );
  }

  /** Misma forma que `ConfirmationService.confirm` de PrimeNG (ver `ConfirmacionCallbacks`). */
  confirm(c: ConfirmacionCallbacks): void {
    const peligro = /danger/.test(c.acceptButtonStyleClass ?? '') || c.acceptButtonProps?.severity === 'danger';
    void this.ask(c.message, {
      header: c.header,
      acceptLabel: c.acceptLabel ?? c.acceptButtonProps?.label,
      rejectLabel: c.rejectLabel ?? c.rejectButtonProps?.label,
      danger: peligro,
    }).then((ok) => (ok ? c.accept?.() : c.reject?.()));
  }
}
