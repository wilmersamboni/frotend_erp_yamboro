import { Component, Input, computed, signal } from '@angular/core';

export type StatCardTono = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

/**
 * Tarjeta de resumen para dashboards/listados — reemplaza las cajitas planas
 * (borde + número) repetidas a mano en Existencias, Kardex, Novedades, etc.
 * Un icono en una placa de color, el número grande, y una franja de acento
 * arriba — mismo lenguaje visual que las píldoras de StatusBadgeComponent
 * (misma paleta neutral/success/info/warning/danger).
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: `
    <div class="relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm"
         [style.border-color]="paleta().borde">
      <div class="absolute inset-x-0 top-0 h-1" [style.background-color]="paleta().acento"></div>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{{ label }}</p>
          <p class="mt-1 text-2xl font-bold text-gray-800 tabular-nums">{{ value }}</p>
          @if (hint) {
            <p class="mt-0.5 text-xs text-gray-400">{{ hint }}</p>
          }
        </div>
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
             [style.background-color]="paleta().placaFondo" [style.color]="paleta().acento">
          <ng-content />
        </div>
      </div>
    </div>
  `,
})
export class StatCardComponent {
  @Input({ required: true }) label = '';
  @Input({ required: true }) value: string | number = 0;
  @Input() hint: string | null = null;
  @Input() set tono(v: StatCardTono) {
    this._tono.set(v);
  }

  private _tono = signal<StatCardTono>('neutral');

  private static readonly PALETA: Record<StatCardTono, { borde: string; acento: string; placaFondo: string }> = {
    neutral: { borde: '#E5E7EB', acento: '#6B7280', placaFondo: '#F3F4F6' },
    success: { borde: '#BBF7D0', acento: '#15803D', placaFondo: '#DCFCE7' },
    info:    { borde: '#BFDBFE', acento: '#1D4ED8', placaFondo: '#DBEAFE' },
    warning: { borde: '#FDE68A', acento: '#B45309', placaFondo: '#FEF3C7' },
    danger:  { borde: '#FECACA', acento: '#B91C1C', placaFondo: '#FEE2E2' },
  };

  paleta = computed(() => StatCardComponent.PALETA[this._tono()]);
}
