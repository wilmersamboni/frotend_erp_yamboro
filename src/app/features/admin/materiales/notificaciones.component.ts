import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { MaterialesApiService, Notificacion } from '../../../core/services/materiales/materiales-api.service';

/**
 * Notificaciones propias de Materiales (distintas del sistema de
 * notificaciones general del ERP que ya existe en la barra superior) —
 * se generan solo como efecto secundario de Solicitudes/Traslados
 * (creación, aprobación, rechazo). Acá no hay alta manual, solo lectura
 * y "marcar como leída".
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
          @for (n of notificaciones; track n.id_notificacion) {
            <div class="flex items-start justify-between gap-4 p-4 rounded-xl border transition-colors"
              [class.border-gray-100]="n.leida" [class.bg-white]="n.leida"
              [class.border-[#39A900]/30]="!n.leida" [class.bg-[#39A900]/5]="!n.leida">
              <div>
                <p class="text-sm text-gray-700">{{ n.mensaje }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ n.fecha | date: 'short' }}</p>
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
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    const idUsuario = this.auth.user()?.id;
    if (!idUsuario) return;
    this.loading = true;
    try {
      this.notificaciones = await this.api.listarNotificaciones(idUsuario);
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las notificaciones.');
    } finally {
      this.loading = false;
    }
  }

  async marcarLeida(n: Notificacion): Promise<void> {
    try {
      await this.api.marcarNotificacionLeida(n.id_notificacion);
      n.leida = true;
    } catch (e) {
      this.toast.httpError(e, 'No se pudo marcar como leída.');
    }
  }
}
