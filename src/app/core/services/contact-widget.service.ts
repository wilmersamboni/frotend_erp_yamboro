import { Injectable, signal } from '@angular/core';

/**
 * Estado compartido entre el disparador (botón "Contáctanos" en el sidebar)
 * y la ventana de chat (app-floating-buttons, montada una sola vez en
 * app.ts) — son dos componentes hermanos, no padre/hijo, así que necesitan
 * un servicio para coordinarse en vez de @Input/@Output.
 */
@Injectable({ providedIn: 'root' })
export class ContactWidgetService {
  readonly chatAbierto = signal(false);

  abrirChat(): void {
    this.chatAbierto.set(true);
  }

  cerrarChat(): void {
    this.chatAbierto.set(false);
  }
}
