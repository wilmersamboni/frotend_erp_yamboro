import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Notificacion } from '../../../layout/navbar/notificaciones-campana.component';

/**
 * Notificaciones propias de Materiales — hasta la Fase 3 del plan de fusión
 * de notificaciones esta pantalla leía de un endpoint propio de Materiales
 * (`/api2/notificaciones`), separado del feed que ya usa la campana del
 * navbar. Desde la Fase 4, ambos leen de la MISMA fuente (`/api/notificaciones`,
 * backend-erp) — acá solo se filtra client-side por `tipo` con prefijo
 * `materiales_` para mantener el recorte ("solo lo mío de Materiales") sin
 * tener una fuente de datos aparte. Solo lectura y "marcar como leída", sin
 * alta manual (se generan como efecto secundario de Solicitudes/Traslados).
 */
@Component({
  selector: 'app-materiales-notificaciones',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Notificaciones de Materiales</h1>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (notificaciones.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No tenés notificaciones</p>
      } @else {
        <div class="space-y-2">
          @for (n of notificaciones; track n.id) {
            <div class="flex items-start justify-between gap-4 p-4 rounded-xl border transition-colors"
              [class.border-gray-100]="n.leida" [class.bg-white]="n.leida"
              [class.border-[#39A900]/30]="!n.leida" [class.bg-[#39A900]/5]="!n.leida">
              <div>
                <p class="text-sm text-gray-700">{{ n.mensaje }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ n.createdAt | date: 'short' }}</p>
              </div>
              @if (!n.leida) {
                <button (click)="marcarLeida(n)"
                  class="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#39A900]/10 text-[#39A900] hover:bg-[#39A900]/20 transition-colors">
                  Marcar leída
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class MaterialesNotificacionesComponent implements OnInit {
  notificaciones: Notificacion[] = [];
  loading = false;

  constructor(
    private api: ApiService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const todas: Notificacion[] = await this.api.listarNotificaciones();
      this.notificaciones = todas.filter((n) => n.tipo?.startsWith('materiales_'));
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las notificaciones.');
    } finally {
      this.loading = false;
    }
  }

  async marcarLeida(n: Notificacion): Promise<void> {
    try {
      await this.api.marcarNotificacionLeida(n.id);
      n.leida = true;
    } catch (e) {
      this.toast.httpError(e, 'No se pudo marcar como leída.');
    }
  }
}
