import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error';

/**
 * Wrapper global sobre PrimeNG MessageService.
 * Requiere que `<p-toast>` esté en el AppComponent y
 * `MessageService` registrado como provider en app.config.ts.
 *
 * Uso:
 *   constructor(private toast: ToastService) {}
 *   this.toast.ok('Guardado', 'El registro fue procesado correctamente.');
 *   this.toast.error('Error', 'No se pudo guardar el registro.');
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  constructor(private msg: MessageService) {}

  /** Toast verde de éxito (3 s) */
  ok(summary: string, detail = '', life = 3000): void {
    this.msg.add({ severity: 'success', summary, detail, life });
  }

  /** Toast azul informativo (3 s) */
  info(summary: string, detail = '', life = 3000): void {
    this.msg.add({ severity: 'info', summary, detail, life });
  }

  /** Toast amarillo de advertencia (4 s) */
  warn(summary: string, detail = '', life = 4000): void {
    this.msg.add({ severity: 'warn', summary, detail, life });
  }

  /** Toast rojo de error (4 s) */
  error(summary: string, detail = '', life = 4000): void {
    this.msg.add({ severity: 'error', summary, detail, life });
  }

  /**
   * Extrae el mensaje de un error HTTP de NestJS y muestra un toast rojo.
   * Acepta objetos del tipo { error: { message: string | string[] } }.
   */
  httpError(e: any, fallback = 'Ha ocurrido un error inesperado.'): void {
    const raw = e?.error?.message ?? e?.error?.error ?? e?.message ?? fallback;
    const detail = Array.isArray(raw) ? raw.join(' · ') : String(raw);
    this.error('Error', detail);
  }
}
