import { Injectable, inject } from '@angular/core';
import { ToastService, erroresYaAvisados, mensajeDeError } from '../services/toast.service';

@Injectable({ providedIn: 'root' })
export class AdminToastService {
  private readonly msg = inject(ToastService);

  success(text: string): void {
    this.msg.add({ severity: 'success', summary: 'Éxito', detail: text, life: 4000 });
  }

  error(text: string): void {
    this.msg.add({ severity: 'error', summary: 'Error', detail: text, life: 5000 });
  }

  /** Aviso rojo con el mensaje del backend (traducido) o, si no lo hay, `fallback`. */
  httpError(e: unknown, fallback: string): void {
    if (e && typeof e === 'object' && erroresYaAvisados.has(e)) return;   // ya lo avisó el interceptor
    this.error(mensajeDeError(e, fallback));
  }

  info(text: string): void {
    this.msg.add({ severity: 'info', summary: 'Info', detail: text, life: 4000 });
  }

  show(text: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    const severityMap: Record<string, string> = {
      success: 'success', error: 'error', info: 'info', warning: 'warn',
    };
    this.msg.add({ severity: severityMap[type], detail: text, life: 4000 });
  }
}
