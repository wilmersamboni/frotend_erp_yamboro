import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { StatCardComponent } from '../../../shared/components/stat-card.component';
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
  imports: [FormsModule, AdminTableComponent, StatCardComponent],
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

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <app-stat-card label="Total actas" [value]="actas.length" tono="neutral">
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </app-stat-card>
        <app-stat-card label="Entregas" [value]="contarTipo('ENTREGA')" tono="success">
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </app-stat-card>
        <app-stat-card label="Devoluciones" [value]="contarTipo('DEVOLUCION')" tono="warning">
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 14l-4-4m0 0l4-4m-4 4h11a4 4 0 010 8h-1"/></svg>
        </app-stat-card>
        <app-stat-card label="Este mes" [value]="contarEsteMes()" tono="info">
          <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        </app-stat-card>
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

  contarTipo(tipo: 'ENTREGA' | 'DEVOLUCION'): number {
    return this.actas.filter((a) => a.tipo === tipo).length;
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
