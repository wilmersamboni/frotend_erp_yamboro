import { Component, Input, computed, signal } from '@angular/core';

/**
 * Píldora de estado sólida (fondo saturado + texto blanco), estilo tablero
 * ejecutivo — reemplaza los badges pastel (bg-*-100/text-*-700) que había
 * repetidos a mano en Novedades/Traslados/Solicitudes/etc. Un solo lugar
 * para el mapeo texto→color: agregar un estado nuevo en el backend no debe
 * exigir tocar cada pantalla que lo muestra.
 *
 * Si el valor no está en el mapa conocido, cae a un gris neutro con el
 * texto tal cual — nunca revienta ni queda en blanco.
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span
      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      [style.background-color]="color().bg"
      [style.color]="color().fg"
    >
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input({ required: true }) set value(v: string | null | undefined) {
    this._value.set(v ?? '');
  }
  @Input() labelOverride: string | null = null;

  private _value = signal('');

  private static readonly PALETA: Record<string, { bg: string; fg: string }> = {
    // Positivo / activo / completo
    ACTIVO: { bg: '#DCFCE7', fg: '#15803D' },
    ACTIVA: { bg: '#DCFCE7', fg: '#15803D' },
    DISPONIBLE: { bg: '#DCFCE7', fg: '#15803D' },
    APROBADO: { bg: '#DCFCE7', fg: '#15803D' },
    APROBADA: { bg: '#DCFCE7', fg: '#15803D' },
    RESUELTA: { bg: '#DCFCE7', fg: '#15803D' },
    ENTREGADA: { bg: '#DCFCE7', fg: '#15803D' },
    DEVUELTA: { bg: '#DCFCE7', fg: '#15803D' },
    BUENO: { bg: '#DCFCE7', fg: '#15803D' },
    CONFIRMADA: { bg: '#DCFCE7', fg: '#15803D' },
    // En curso / pendiente / requiere atención
    PENDIENTE: { bg: '#FEF3C7', fg: '#B45309' },
    EN_PROCESO: { bg: '#FEF3C7', fg: '#B45309' },
    EN_ENTREGA: { bg: '#FEF3C7', fg: '#B45309' },
    REGULAR: { bg: '#FEF3C7', fg: '#B45309' },
    EN_MANTENIMIENTO: { bg: '#FEF3C7', fg: '#B45309' },
    AGOTADO: { bg: '#FEF3C7', fg: '#B45309' },
    // Negativo / rechazado / de baja
    RECHAZADA: { bg: '#FEE2E2', fg: '#B91C1C' },
    RECHAZADO: { bg: '#FEE2E2', fg: '#B91C1C' },
    CANCELADA: { bg: '#FEE2E2', fg: '#B91C1C' },
    DAÑADO: { bg: '#FEE2E2', fg: '#B91C1C' },
    PERDIDO: { bg: '#FEE2E2', fg: '#B91C1C' },
    INACTIVO: { bg: '#FEE2E2', fg: '#B91C1C' },
    ANULADA: { bg: '#FEE2E2', fg: '#B91C1C' },
    VENCIDO: { bg: '#FEE2E2', fg: '#B91C1C' },
    DADO_DE_BAJA: { bg: '#FEE2E2', fg: '#B91C1C' },
    // Neutral / informativo
    PRESTADO: { bg: '#DBEAFE', fg: '#1D4ED8' },
    DEVOLUTIVO: { bg: '#DBEAFE', fg: '#1D4ED8' },
    CONSUMO: { bg: '#E0E7FF', fg: '#4338CA' },
    PERECEDERO: { bg: '#E0E7FF', fg: '#4338CA' },
    // Kardex (tipo de movimiento)
    ENTRADA: { bg: '#DCFCE7', fg: '#15803D' },
    SALIDA: { bg: '#FEE2E2', fg: '#B91C1C' },
    AJUSTE: { bg: '#FEF3C7', fg: '#B45309' },
    TRASLADO: { bg: '#DBEAFE', fg: '#1D4ED8' },
    BAJA: { bg: '#FEE2E2', fg: '#B91C1C' },
  };

  private static readonly ETIQUETAS: Record<string, string> = {
    EN_PROCESO: 'En proceso',
    EN_ENTREGA: 'En entrega',
    EN_MANTENIMIENTO: 'En mantenimiento',
    DADO_DE_BAJA: 'Dado de baja',
  };

  color = computed(() => {
    const key = this._value().toUpperCase().trim();
    return StatusBadgeComponent.PALETA[key] ?? { bg: '#F3F4F6', fg: '#374151' };
  });

  label = computed(() => {
    if (this.labelOverride) return this.labelOverride;
    const raw = this._value();
    const key = raw.toUpperCase().trim();
    const bonito = StatusBadgeComponent.ETIQUETAS[key];
    if (bonito) return bonito;
    if (!raw) return '—';
    // Por defecto: capitaliza solo la primera letra (ACTIVO -> Activo)
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  });
}
