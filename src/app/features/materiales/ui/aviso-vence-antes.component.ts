import { Component, EventEmitter, Input, Output } from '@angular/core';
import { estaVencido, fechaCortaVencimiento } from '../lotes-vencimiento.util';

/** Lo que el aviso necesita mostrar del lote sugerido. */
export interface LoteSugerido {
  codigo: string | null;
  fecha_vencimiento: string | null;
  libres: number;
  unidad: string | null;
}

/**
 * <app-aviso-vence-antes> — debajo del selector de lote: "Hay otro lote de este producto que vence antes…
 * [Usar ese lote]". También avisa si el lote elegido ya está vencido. Ver `lotes-vencimiento.util.ts`.
 */
@Component({
  selector: 'app-aviso-vence-antes',
  standalone: true,
  template: `
    @if (elegidoVencido) {
      <p class="mt-1 text-xs text-red-600">Este lote está vencido ({{ fecha(fechaElegido) }}).</p>
    }
    @if (sugerido) {
      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        <span>
          Hay otro lote de este producto que vence antes:
          <strong>{{ sugerido.codigo || 'sin código' }}</strong>, vence {{ fecha(sugerido.fecha_vencimiento) }}
          ({{ sugerido.libres }} {{ (sugerido.unidad || '').toLowerCase() }} libres).
        </span>
        <button type="button" (click)="usar.emit()" class="font-semibold text-[#2d8000] hover:underline">Usar ese lote</button>
      </div>
    }
  `,
})
export class AvisoVenceAntesComponent {
  @Input() sugerido: LoteSugerido | null = null;
  /** Vencimiento del lote elegido, para avisar si ya pasó. */
  @Input() fechaElegido: string | null | undefined = null;
  @Output() usar = new EventEmitter<void>();

  get elegidoVencido(): boolean {
    return estaVencido(this.fechaElegido);
  }

  fecha(f: string | null | undefined): string {
    return fechaCortaVencimiento(f);
  }
}
