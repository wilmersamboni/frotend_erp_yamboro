import { Component, input } from '@angular/core';

@Component({
  selector: 'app-admin-badge-estado',
  standalone: true,
  template: `
    @if (estado() === 'activo') {
      <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style="background: rgba(57,169,0,0.1); color:#007832;">
        <span class="w-1.5 h-1.5 rounded-full" style="background:#39A900;"></span>
        Activo
      </span>
    } @else {
      <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
        <span class="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
        Inactivo
      </span>
    }
  `,
})
export class AdminBadgeEstadoComponent {
  estado = input.required<'activo' | 'inactivo'>();
}
