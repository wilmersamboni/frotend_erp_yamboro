import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { AccionPendiente } from './indexed-db.service';
import { SyncQueueService } from './sync-queue.service';

/**
 * Diálogo genérico de reconciliación — una acción encolada pasa a
 * `conflicto` cuando el backend la rechaza (no un fallo de red, sino un
 * rechazo real: placa ya en uso, ítem ya no disponible, etc.). Nunca se
 * reintenta sola (ver `SyncQueueService`) — siempre queda a la vista acá
 * hasta que una persona decida qué hacer.
 *
 * Genérico a propósito: no sabe qué es una "placa" ni una "solicitud", solo
 * muestra el error crudo del backend y ofrece Descartar / Reintentar tal
 * cual. Un flujo (Fase 2/3) que necesite algo más específico — por ejemplo,
 * reabrir su propio modal con los datos precargados para editarlos antes de
 * reintentar — puede escuchar `(reintentarConDatos)` y decidir qué hacer
 * con el `payload`, en vez de este diálogo intentar adivinar la forma de
 * cada tipo de acción.
 */
@Component({
  selector: 'app-reconciliation-dialog',
  standalone: true,
  imports: [DatePipe, LucideAngularModule],
  template: `
    @if (abierto) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrado.emit()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800">Acciones pendientes de revisión</h2>
            <button (click)="cerrado.emit()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          @if (acciones.length === 0) {
            <p class="text-sm text-gray-400 py-6 text-center">No hay nada pendiente ni en conflicto.</p>
          } @else {
            <div class="space-y-3">
              @for (a of acciones; track a.id) {
                <div class="rounded-xl border p-3"
                  [class.border-amber-200]="a.estado === 'conflicto'"
                  [class.bg-amber-50]="a.estado === 'conflicto'"
                  [class.border-gray-100]="a.estado !== 'conflicto'">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm font-semibold text-gray-800">{{ etiquetaTipo(a.tipo) }}</span>
                    <span class="text-[11px] font-semibold rounded-full px-2 py-0.5"
                      [class.bg-amber-100]="a.estado === 'conflicto'"
                      [class.text-amber-700]="a.estado === 'conflicto'"
                      [class.bg-gray-100]="a.estado !== 'conflicto'"
                      [class.text-gray-600]="a.estado !== 'conflicto'">
                      {{ a.estado === 'conflicto' ? 'Conflicto' : 'Pendiente de enviar' }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-400 mb-2">{{ a.creadoEn | date: 'dd/MM HH:mm' }}</p>
                  @if (a.ultimoError) {
                    <p class="text-xs text-red-600 mb-2">{{ a.ultimoError }}</p>
                  }
                  <div class="flex gap-2 justify-end">
                    <button type="button" (click)="descartar(a)" class="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      Descartar
                    </button>
                    <button type="button" (click)="reintentar(a)" class="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors" style="background-color: #39A900">
                      Reintentar
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ReconciliationDialogComponent implements OnChanges {
  @Input() abierto = false;
  @Output() cerrado = new EventEmitter<void>();

  private readonly syncQueue = inject(SyncQueueService);

  acciones: AccionPendiente[] = [];

  async ngOnChanges(): Promise<void> {
    if (this.abierto) {
      this.acciones = await this.syncQueue.listarPendientesYConflictos();
    }
  }

  /** Etiquetas legibles por tipo — cada flujo nuevo agrega la suya acá. */
  etiquetaTipo(tipo: string): string {
    const etiquetas: Record<string, string> = {
      'materiales.asignarPlacas': 'Asignación de placas SENA',
      'materiales.entregarSolicitud': 'Entrega de solicitud',
    };
    return etiquetas[tipo] ?? tipo;
  }

  async descartar(a: AccionPendiente): Promise<void> {
    await this.syncQueue.descartar(a.id!);
    this.acciones = await this.syncQueue.listarPendientesYConflictos();
  }

  async reintentar(a: AccionPendiente): Promise<void> {
    await this.syncQueue.reintentarManualmente(a.id!);
    this.acciones = await this.syncQueue.listarPendientesYConflictos();
  }
}
