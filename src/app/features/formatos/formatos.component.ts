import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Formato } from '../../shared/models';
import { NotificacionService } from '../../core/services/notificacion.service';

import { FormatoCardComponent } from './components/formato-card.component';
import { SubirFormatoModalComponent } from './components/subir-formato-modal.component';

const TIPOS = [
  { value: 'bitacora',         label: 'Bitácora',        icon: '📋' },
  { value: 'acta_seguimiento', label: 'Acta seguimiento', icon: '📝' },
  { value: 'otro',             label: 'Otro',             icon: '📁' },
];

@Component({
  selector: 'app-formatos',
  standalone: true,
  imports: [ToastModule, ConfirmDialogModule, FormatoCardComponent, SubirFormatoModalComponent],
  providers: [MessageService, ConfirmationService],
  styles: [`
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { animation: spin 0.8s linear infinite; }
  `],
  template: `
    <p-toast position="top-right" [baseZIndex]="9999" />
    <p-confirmdialog />

    <section class="min-h-screen bg-gray-50 px-4 py-10">
      <div class="max-w-6xl mx-auto space-y-8">

        <!-- ── Header ──────────────────────────────────────────────── -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Formatos</h1>
            <p class="text-muted text-sm mt-0.5">
              {{ formatos().length }} archivo{{ formatos().length !== 1 ? 's' : '' }}
              disponible{{ formatos().length !== 1 ? 's' : '' }}
            </p>
          </div>

          @if (puedeGestionar()) {
            <button
              (click)="mostrarForm.set(!mostrarForm())"
              class="inline-flex items-center gap-2 px-4 py-2 bg-[#39A900] hover:bg-[#2d8400]
                     text-white text-sm font-semibold rounded-xl transition-all duration-200
                     shadow-sm hover:shadow-md active:scale-95">
              <span class="text-base leading-none">{{ mostrarForm() ? '✕' : '+' }}</span>
              {{ mostrarForm() ? 'Cancelar' : 'Subir formato' }}
            </button>
          }
        </div>

        <!-- ── Formulario de subida ─────────────────────────────────── -->
        @if (puedeGestionar() && mostrarForm()) {
          <app-subir-formato-modal
            [tipos]="tipos"
            (subido)="onSubido($event.nombre, $event.tipo)"
          />
        }

        <!-- ── Filtros ───────────────────────────────────────────────── -->
        @if (formatos().length > 0 || filtroTipo()) {
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Filtrar:</span>

            <button
              (click)="filtroTipo.set('')"
              [class]="'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
                (filtroTipo() === '' ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300')">
              Todos
            </button>

            @for (t of tipos; track t.value) {
              <button
                (click)="filtroTipo.set(filtroTipo() === t.value ? '' : t.value)"
                [class]="'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
                  (filtroTipo() === t.value
                    ? 'bg-[#39A900] text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-[#39A900]/40')">
                {{ t.icon }} {{ t.label }}
              </button>
            }
          </div>
        }

        <!-- ── Cargando ──────────────────────────────────────────────── -->
        @if (loading()) {
          <div class="flex justify-center items-center py-20">
            <div class="flex flex-col items-center gap-3">
              <svg class="w-8 h-8 text-[#39A900] spinner" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              <span class="text-sm text-gray-400">Cargando formatos...</span>
            </div>
          </div>
        }

        <!-- ── Estado vacío ──────────────────────────────────────────── -->
        @if (!loading() && formatosFiltrados().length === 0) {
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl mb-4">📂</div>
            <p class="text-gray-500 font-medium">
              {{ filtroTipo() ? 'No hay formatos de este tipo' : 'No hay formatos registrados' }}
            </p>
            <p class="text-sm text-gray-400 mt-1">
              {{ puedeGestionar() ? 'Sube el primer formato con el botón de arriba.' : 'Consulta con el administrador.' }}
            </p>
          </div>
        }

        <!-- ── Grilla de cards ───────────────────────────────────────── -->
        @if (!loading() && formatosFiltrados().length > 0) {
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            @for (f of formatosFiltrados(); track f.id) {
              <app-formato-card
                [formato]="f"
                [esAdmin]="puedeAdministrar()"
                (eliminar)="handleEliminar($event)"
              />
            }
          </div>
        }

      </div>
    </section>
  `,
})
export class FormatosComponent implements OnInit {
  private auth            = inject(AuthService);
  private api             = inject(ApiService);
  private toast           = inject(ToastService);
  private confirm         = inject(ConfirmationService);
  private notificacionSvc = inject(NotificacionService);

  readonly tipos = TIPOS;

  formatos    = signal<Formato[]>([]);
  loading     = signal(false);
  mostrarForm = signal(false);
  filtroTipo  = signal('');

  /**
   * Gateados por servicio (`practica.formatos.gestionar`/`.administrar`),
   * no por cargo — antes `esAdmin()` (cargo puro) ocultaba "Subir formato"
   * a cualquiera que no fuera admin sin importar el permiso otorgado. Ver
   * plan "Ronda 3": el backend ya exigía estos servicios exactos, el
   * frontend nunca los consultaba.
   */
  puedeGestionar    = computed(() => this.auth.tieneServicio('practica.formatos.gestionar'));
  puedeAdministrar  = computed(() => this.auth.tieneServicio('practica.formatos.administrar'));

  formatosFiltrados() {
    const tipo = this.filtroTipo();
    return tipo ? this.formatos().filter(f => f.tipo === tipo) : this.formatos();
  }

  ngOnInit(): void { this.cargarFormatos(); }

  async cargarFormatos(): Promise<void> {
    this.loading.set(true);
    try {
      this.formatos.set(await this.api.listarFormatos());
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudieron cargar los formatos.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Llamado por el modal de subida cuando el admin sube un formato nuevo */
  async onSubido(formatoNombre?: string, formatoTipo?: string): Promise<void> {
    this.mostrarForm.set(false);
    await this.cargarFormatos();

    // Notificar a instructores y aprendices del nuevo formato
    if (this.puedeGestionar()) {
      const adminNombre = this.auth.user()?.nombre ?? 'El administrador';
      const { instructorIds, aprendizIds } =
        await this.notificacionSvc.obtenerIdsInstructoresYAprendices();
      const destinatarios = [...instructorIds, ...aprendizIds];

      if (destinatarios.length > 0) {
        await this.notificacionSvc.notificarFormatoNuevo({
          destinatarios,
          formatoNombre: formatoNombre ?? 'Nuevo formato',
          formatoTipo:   formatoTipo   ?? 'documento',
          adminNombre,
        });
      }
    }
  }

  handleEliminar(id: string): void {
    if (!this.puedeAdministrar()) return;

    // Guarda el nombre del formato antes de eliminar
    const formato = this.formatos().find(f => f.id === id);
    const nombre  = formato?.nombre ?? 'Formato';

    this.confirm.confirm({
      message: '¿Estás seguro de que deseas eliminar este formato? Esta acción no se puede deshacer.',
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.api.eliminarFormato(id);
          this.toast.ok('Eliminado', 'Formato eliminado correctamente.');
          await this.cargarFormatos();

          // Notificar a instructores y aprendices de la eliminación
          const adminNombre = this.auth.user()?.nombre ?? 'El administrador';
          const { instructorIds, aprendizIds } =
            await this.notificacionSvc.obtenerIdsInstructoresYAprendices();
          const destinatarios = [...instructorIds, ...aprendizIds];

          if (destinatarios.length > 0) {
            await this.notificacionSvc.notificarFormatoEliminado({
              destinatarios,
              formatoNombre: nombre,
              adminNombre,
            });
          }
        } catch (e: any) {
          this.toast.httpError(e, 'Error al eliminar el formato.');
        }
      },
    });
  }
}
