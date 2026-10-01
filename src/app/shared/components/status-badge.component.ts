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
    ACTIVO: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    ACTIVA: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    DISPONIBLE: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    APROBADO: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    APROBADA: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    RESUELTA: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    ENTREGADA: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    DEVUELTA: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    CONSUMIDA: { bg: 'var(--indigo-bg)', fg: 'var(--indigo-text)' },
    BUENO: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    CONFIRMADA: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },

    // En curso / pendiente / requiere atención
    PENDIENTE: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
    EN_PROCESO: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
    EN_ENTREGA: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
    REGULAR: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
    EN_MANTENIMIENTO: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
    AGOTADO: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
    // Negativo / rechazado / de baja
    RECHAZADA: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    RECHAZADO: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    CANCELADA: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    DAÑADO: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    PERDIDO: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    INACTIVO: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    ANULADA: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    VENCIDO: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    DADO_DE_BAJA: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    // Neutral / informativo
    PRESTADO: { bg: 'var(--info-bg)', fg: 'var(--info-text)' },
    DEVOLUTIVO: { bg: 'var(--info-bg)', fg: 'var(--info-text)' },
    CONSUMO: { bg: 'var(--indigo-bg)', fg: 'var(--indigo-text)' },
    PERECEDERO: { bg: 'var(--indigo-bg)', fg: 'var(--indigo-text)' },
    // Kardex (tipo de movimiento)
    ENTRADA: { bg: 'var(--ok-bg)', fg: 'var(--ok-text)' },
    SALIDA: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
    AJUSTE: { bg: 'var(--warn-bg)', fg: 'var(--warn-text)' },
    TRASLADO: { bg: 'var(--info-bg)', fg: 'var(--info-text)' },
    BAJA: { bg: 'var(--err-bg)', fg: 'var(--err-text)' },
  };

  private static readonly ETIQUETAS: Record<string, string> = {
    EN_PROCESO: 'En proceso',
    EN_ENTREGA: 'En entrega',
    EN_MANTENIMIENTO: 'En mantenimiento',
    DADO_DE_BAJA: 'Dado de baja',
  };

  color = computed(() => {
    const key = this._value().toUpperCase().trim();
    return StatusBadgeComponent.PALETA[key] ?? { bg: 'var(--surface3)', fg: 'var(--text-2)' };
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
