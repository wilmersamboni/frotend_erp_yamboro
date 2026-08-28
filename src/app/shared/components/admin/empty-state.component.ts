import { Component, input } from '@angular/core';

@Component({
  selector: 'app-admin-empty-state',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
      </svg>
      <p class="text-sm mt-3">{{ mensaje() }}</p>
      <ng-content />
    </div>
  `,
})
export class AdminEmptyStateComponent {
  mensaje = input('No hay datos para mostrar');
}
