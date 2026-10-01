import { Component, input } from '@angular/core';
import { EstadoConexion } from '../../../core/services/admin/tenant-salud.service';

/** Indicador de conexión a la base de un centro: sin revisar, revisando, bien o sin conexión. */
@Component({
  selector: 'app-admin-conexion',
  standalone: true,
  template: `
    @if (inactivo()) {
      <span class="text-xs text-gray-400" title="Un centro inactivo no se comprueba: su acceso está cerrado a propósito.">No aplica (inactivo)</span>
    } @else {
    @switch (estado()) {
      @case ('ok') {
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style="background:var(--ok-bg);color:var(--ok-text);">
          <span class="w-1.5 h-1.5 rounded-full" style="background:var(--ok-text);"></span>Base responde
        </span>
      }
      @case ('falla') {
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style="background:var(--err-bg);color:var(--err-text);">
          <span class="w-1.5 h-1.5 rounded-full" style="background:var(--err-text);"></span>Base sin respuesta
        </span>
      }
      @case ('verificando') {
        <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style="background:var(--surface3);color:var(--text-muted);">
          <span class="w-3 h-3 border-2 rounded-full animate-spin" style="border-color:var(--border-strong);border-top-color:var(--text-muted);"></span>Revisando
        </span>
      }
      @default {
        <span class="text-xs text-gray-400">Sin revisar</span>
      }
    }
    }
  `,
})
export class AdminConexionComponent {
  estado = input<EstadoConexion | undefined>();
  /** Centro desactivado: no se comprueba (su base puede responder igual, y eso confunde). */
  inactivo = input(false);
}
