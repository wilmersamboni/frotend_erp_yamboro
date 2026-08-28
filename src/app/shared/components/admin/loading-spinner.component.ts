import { Component, input } from '@angular/core';

@Component({
  selector: 'app-admin-loading-spinner',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center py-16">
      <svg class="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="3">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
      @if (mensaje()) {
        <p class="text-sm text-gray-400 mt-3">{{ mensaje() }}</p>
      }
    </div>
  `,
})
export class AdminLoadingSpinnerComponent {
  mensaje = input('Cargando...');
}
