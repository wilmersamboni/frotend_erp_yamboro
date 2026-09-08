import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { ToastService } from '../../../core/services/toast.service';
import { Acta, MaterialesApiService } from '../../../core/services/materiales/materiales-api.service';

/**
 * Actas de entrega/devolución — solo lectura. El backend las genera solo
 * (PDF real, ver ActasService.generarSiNoExiste en backend-practica-
 * hexagonal): una de tipo ENTREGA al confirmar recepción de una solicitud,
 * y una de tipo DEVOLUCION al cerrar su devolución — son independientes,
 * una misma solicitud puede (y normalmente va a) tener las dos. No hay alta
 * ni edición manual acá — el "+ Nueva" no existe a propósito.
 *
 * El resumen de qué se entregó/devolvió vive DENTRO del PDF (generado con
 * los datos de la solicitud en ese momento), no en esta lista — por eso la
 * tabla se mantiene liviana: fecha + tipo + referencia a la solicitud +
 * acción para abrir el documento.
 */
@Component({
  selector: 'app-materiales-actas',
  standalone: true,
  imports: [FormsModule, AdminTableComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Actas</h1>
          <p class="text-sm text-gray-500 mt-0.5">Generadas automáticamente al entregar o devolver un préstamo.</p>
        </div>
        <input [(ngModel)]="filtroTexto" placeholder="Buscar por solicitud…"
          class="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
      </div>

      <div class="grid grid-cols-2 gap-3 mb-5 max-w-md">
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Total actas</p>
          <p class="text-xl font-bold text-gray-800">{{ actas.length }}</p>
        </div>
        <div class="rounded-xl border border-gray-100 px-4 py-3">
          <p class="text-xs text-gray-500">Este mes</p>
          <p class="text-xl font-bold text-[#39A900]">{{ contarEsteMes() }}</p>
        </div>
      </div>

      <app-admin-table
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por solicitud…'"
        [columns]="['fecha', 'tipo', 'referencia', 'estado_solicitud']"
        [columnLabels]="columnLabels"
        [statusColumn]="'estado_solicitud'"
        [loading]="loading"
        [canEdit]="false"
        [canDelete]="false"
        [selectable]="true"
        (rowSelected)="verPdf($event)" />

      @if (descargando) {
        <div class="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div class="bg-white rounded-2xl px-6 py-5 flex items-center gap-3 shadow-lg">
            <div class="w-5 h-5 border-2 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
            <span class="text-sm text-gray-600">Abriendo PDF…</span>
          </div>
        </div>
      }
    </div>
  `,
})
export class MaterialesActasComponent implements OnInit {
  actas: Acta[] = [];
  loading = false;
  descargando = false;
  filtroTexto = '';

  columnLabels: Record<string, string> = {
    tipo: 'Tipo',
    referencia: 'Solicitud',
    estado_solicitud: 'Estado',
  };

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get filas(): any[] {
    const texto = this.filtroTexto.trim().toLowerCase();
    return this.actas
      .filter((a) => !texto || a.id_solicitud.toLowerCase().includes(texto))
      .map((a) => ({
        ...a,
        fecha: new Date(a.fecha).toLocaleString('es-CO'),
        tipo: a.tipo === 'DEVOLUCION' ? 'Devolución' : 'Entrega',
        referencia: `#${a.id_solicitud.slice(0, 8)}`,
        estado_solicitud: a.solicitud?.estado ?? '—',
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  contarEsteMes(): number {
    const ahora = new Date();
    return this.actas.filter((a) => {
      const f = new Date(a.fecha);
      return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
    }).length;
  }

  async verPdf(acta: Acta): Promise<void> {
    if (!acta.url_pdf) {
      this.toast.warn('Sin archivo', 'Esta acta no tiene un PDF asociado.');
      return;
    }
    this.descargando = true;
    try {
      const blob = await this.api.descargarActaPdf(acta.url_pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo abrir el PDF del acta.');
    } finally {
      this.descargando = false;
    }
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.actas = await this.api.listarActas();
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las actas.');
    } finally {
      this.loading = false;
    }
  }
}
