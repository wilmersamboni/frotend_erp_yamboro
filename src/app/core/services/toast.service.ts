import { Injectable } from '@angular/core';
import { toast } from 'ngx-sonner';

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error';

/**
 * Nest devuelve el NOMBRE del estado HTTP en inglés ("Conflict", "Forbidden"...) cuando el
 * backend no puso un mensaje propio, y en algunos errores de base de datos el texto crudo del
 * motor. Ninguno le dice nada al usuario: se cambian por una frase en español según el estado.
 * Un mensaje propio del backend (cualquier otro texto) se deja tal cual.
 */
const GENERICOS: Record<string, string> = {
  'conflict': 'No se puede completar la acción: el registro está en uso o tiene información asociada.',
  'forbidden': 'No tienes permiso para realizar esta acción.',
  'unauthorized': 'Tu sesión expiró. Vuelve a iniciar sesión.',
  'not found': 'No se encontró el registro solicitado.',
  'bad request': 'Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.',
  'internal server error': 'Ocurrió un error en el servidor. Inténtalo de nuevo en unos minutos.',
  'payload too large': 'El archivo es demasiado grande.',
  'too many requests': 'Demasiadas solicitudes seguidas. Espera un momento e inténtalo de nuevo.',
  'service unavailable': 'El servicio no está disponible en este momento.',
};

export function traducirErrorHttp(texto: string): string {
  const t = texto.trim();
  if (/violates foreign key constraint|update or delete on table/i.test(t)) return GENERICOS['conflict'];
  return GENERICOS[t.toLowerCase()] ?? t;
}

/**
 * Avisos globales con Sonner (`ngx-sonner`, el toast que usa Spartan). Requiere
 * `<ngx-sonner-toaster>` montado en `app.ts`. Sin summary, el detalle pasa a ser
 * el título (un aviso sin título se ve vacío).
 *
 * Uso:
 *   this.toast.ok('Guardado', 'El registro fue procesado correctamente.');
 *   this.toast.error('Error', 'No se pudo guardar el registro.');
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private mostrar(severity: ToastSeverity, summary: string, detail: string, life: number): void {
    // Errores y advertencias: si el detalle es un texto genérico del servidor ("Conflict"...), se traduce.
    if (severity === 'error' || severity === 'warn') detail = traducirErrorHttp(detail);
    const titulo = summary || detail;
    const opts = { description: summary && detail ? detail : undefined, duration: life };
    switch (severity) {
      case 'success':
        toast.success(titulo, opts);
        break;
      case 'info':
        toast.info(titulo, opts);
        break;
      case 'warn':
        toast.warning(titulo, opts);
        break;
      default:
        toast.error(titulo, opts);
    }
  }

  /** Aviso verde de éxito (3 s) */
  ok(summary: string, detail = '', life = 3000): void {
    this.mostrar('success', summary, detail, life);
  }

  /** Aviso informativo (3 s) */
  info(summary: string, detail = '', life = 3000): void {
    this.mostrar('info', summary, detail, life);
  }

  /** Aviso de advertencia (4 s) */
  warn(summary: string, detail = '', life = 4000): void {
    this.mostrar('warn', summary, detail, life);
  }

  /** Aviso rojo de error (4 s) */
  error(summary: string, detail = '', life = 4000): void {
    this.mostrar('error', summary, detail, life);
  }

  /**
   * Misma forma que `MessageService.add` de PrimeNG, para las pantallas que
   * llamaban `messageService.add({ severity, summary, detail, life })`.
   */
  add(m: { severity?: string; summary?: string; detail?: string; life?: number }): void {
    const sev: ToastSeverity =
      m.severity === 'success' || m.severity === 'info' || m.severity === 'warn' ? m.severity : 'error';
    this.mostrar(sev, m.summary ?? '', m.detail ?? '', m.life ?? 3000);
  }

  /**
   * Extrae el mensaje de un error HTTP de NestJS y muestra un aviso rojo.
   * Acepta objetos del tipo { error: { message: string | string[] } }.
   */
  httpError(e: any, fallback = 'Ha ocurrido un error inesperado.'): void {
    const raw = e?.error?.message ?? e?.error?.error ?? e?.message ?? fallback;
    const detail = traducirErrorHttp(Array.isArray(raw) ? raw.join(' · ') : String(raw));
    this.error('Error', detail);
  }
}
