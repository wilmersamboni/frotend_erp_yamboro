import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { PersonaService } from '../../../core/services/persona.service';
import { Item, MaterialesApiService, Novedad, Sitio, TipoNovedad } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO: OpcionSelect[] = [
  { label: 'Daño', value: 'DAÑO' },
  { label: 'Pérdida', value: 'PERDIDA' },
  { label: 'Mantenimiento', value: 'MANTENIMIENTO' },
  { label: 'Discrepancia', value: 'DISCREPANCIA' },
  { label: 'Otro', value: 'OTRO' },
];

/**
 * Reportes de novedades sobre ítems (daño/pérdida/etc). Cadena de estados
 * PENDIENTE → EN_PROCESO → RESUELTA — el botón de fila cambia según el
 * estado actual, así que no encaja en AdminTableComponent (genérico,
 * edit/delete fijos) y usa una tabla propia con el mismo lenguaje visual.
 *
 * Gating de botones (Ronda 4, Fase 5): "Marcar en proceso"/"Marcar
 * resuelta" exigen además ser responsable real del sitio del ítem —
 * `NovedadesService.actualizarEstado` deja pasar a admin siempre, y a
 * cualquier otro solo si `sitio.id_responsable === userId` (sin excepción
 * cuando el sitio no tiene responsable — a diferencia de Traslados, ahí
 * nadie no-admin puede actuar). Eliminar no tiene este chequeo en el
 * backend, así que queda solo con el gate de servicio de siempre.
 *
 * Pulido (Ronda 4, Fase 9): columna "Reportado por" resolviendo
 * `n.id_usuario` contra `PersonaService.listarUsuarios()` (mismo servicio
 * ya usado en Sitios para "Responsable"), y tarjetas resumen
 * (Total/Pendientes/En proceso/Resueltas).
 */
@Component({
  selector: 'app-materiales-novedades',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Novedades</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nueva novedad
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (novedades.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay novedades registradas</p>
      } @else {
        <div class="grid grid-cols-4 gap-3 mb-5">
          <div class="rounded-xl border border-gray-100 px-4 py-3">
            <p class="text-xs text-gray-500">Total</p>
            <p class="text-xl font-bold text-gray-800">{{ novedades.length }}</p>
          </div>
          <div class="rounded-xl border border-gray-100 px-4 py-3">
            <p class="text-xs text-gray-500">Pendientes</p>
            <p class="text-xl font-bold text-amber-600">{{ contarEstado('PENDIENTE') }}</p>
          </div>
          <div class="rounded-xl border border-gray-100 px-4 py-3">
            <p class="text-xs text-gray-500">En proceso</p>
            <p class="text-xl font-bold text-blue-600">{{ contarEstado('EN_PROCESO') }}</p>
          </div>
          <div class="rounded-xl border border-gray-100 px-4 py-3">
            <p class="text-xs text-gray-500">Resueltas</p>
            <p class="text-xl font-bold text-green-600">{{ contarEstado('RESUELTA') }}</p>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Tipo</th>
                <th class="px-4 py-3 text-left font-medium">Descripción</th>
                <th class="px-4 py-3 text-left font-medium">Ítem</th>
                <th class="px-4 py-3 text-left font-medium">Reportado por</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (n of novedades; track n.id_novedad) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ n.tipo }}</td>
                  <td class="px-4 py-3 text-gray-700 max-w-[280px] truncate">{{ n.descripcion }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ n.item?.codigo_sku ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreUsuario(n.id_usuario) }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-amber-100]="n.estado === 'PENDIENTE'" [class.text-amber-700]="n.estado === 'PENDIENTE'"
                      [class.bg-blue-100]="n.estado === 'EN_PROCESO'" [class.text-blue-700]="n.estado === 'EN_PROCESO'"
                      [class.bg-green-100]="n.estado === 'RESUELTA'" [class.text-green-700]="n.estado === 'RESUELTA'">
                      {{ n.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ n.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1.5">
                      <button (click)="verDetalle(n)"
                        class="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors">
                        Ver
                      </button>
                      @if (puedeEditar && n.estado === 'PENDIENTE' && esResponsableDelSitio(n)) {
                        <button (click)="cambiarEstado(n, 'EN_PROCESO')"
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                          Marcar en proceso
                        </button>
                      }
                      @if (puedeEditar && n.estado === 'EN_PROCESO' && esResponsableDelSitio(n)) {
                        <button (click)="cambiarEstado(n, 'RESUELTA')"
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                          Marcar resuelta
                        </button>
                      }
                      @if (puedeEliminar) {
                        <button (click)="eliminar(n)"
                          class="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Eliminar">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7
                                 m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="null"
      labelSingular="novedad"
      [columns]="['tipo', 'descripcion', 'id_item']"
      [form]="form"
      [opciones]="opciones"
      [columnLabels]="columnLabels"
      [placeholders]="placeholders"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />

    @if (detalleAbierto && detalle) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="detalleAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Detalle de la novedad</h2>
            <button (click)="detalleAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Tipo</dt><dd class="text-gray-800 font-medium text-right">{{ detalle.tipo }}</dd></div>
            <div><dt class="text-gray-500 mb-1">Descripción</dt><dd class="text-gray-800">{{ detalle.descripcion }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Ítem</dt><dd class="text-gray-800 text-right">{{ detalle.item?.producto?.nombre ?? detalle.item?.codigo_sku ?? '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Reportado por</dt><dd class="text-gray-800 text-right">{{ nombreUsuario(detalle.id_usuario) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Estado</dt><dd class="text-gray-800 text-right">{{ detalle.estado }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha</dt><dd class="text-gray-800 text-right">{{ detalle.fecha | date: 'medium' }}</dd></div>
          </dl>
          <div class="flex justify-end mt-6">
            <button (click)="detalleAbierto = false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cerrar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesNovedadesComponent implements OnInit {
  private readonly confirm = inject(ConfirmService);

  novedades: Novedad[] = [];
  items: Item[] = [];
  sitios: Sitio[] = [];
  usuarios: any[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  /** "Ver detalles" (Fase 9). */
  detalleAbierto = false;
  detalle: Novedad | null = null;

  placeholders: Record<string, string> = { descripcion: 'Ej: La carcasa llegó rajada / falta 1 unidad respecto al conteo' };

  columnLabels: Record<string, string> = { id_item: 'Ítem (opcional)' };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private personaApi: PersonaService,
  ) {}

  /**
   * Gateados por servicio (`materiales.novedades.editar`/`.eliminar`), no
   * por cargo — ver plan "Ronda 3".
   */
  get puedeEditar(): boolean {
    return this.auth.tieneServicio('materiales.novedades.editar');
  }
  get puedeEliminar(): boolean {
    return this.auth.tieneServicio('materiales.novedades.eliminar');
  }

  /**
   * Admin siempre puede cambiar el estado; cualquier otro rol solo si es el
   * responsable real del sitio donde está el ítem — sin excepción cuando el
   * sitio no tiene responsable asignado (replica `NovedadesService.actualizarEstado`).
   */
  esResponsableDelSitio(n: Novedad): boolean {
    if (this.auth.isAdmin()) return true;
    const idSitio = n.item?.id_sitio;
    const sitio = idSitio ? this.sitios.find((s) => s.id_sitio === idSitio) : undefined;
    return !!sitio?.id_responsable && sitio.id_responsable === this.auth.user()?.id;
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      tipo: OPCIONES_TIPO,
      // El ítem es opcional (ej. daño general al sitio, discrepancia de conteo):
      // el backend acepta `id_item` nulo. La opción "— Sin ítem —" deja
      // reportar sin ninguno y volver a quitarlo si se eligió por error.
      id_item: [
        { label: '— Sin ítem —', value: null },
        ...this.items.map((i) => ({ label: `${i.codigo_sku}${i.placa_sena ? ' — ' + i.placa_sena : ''}`, value: i.id_item })),
      ],
    };
  }

  ngOnInit(): void {
    this.cargar();
  }

  /** "N.N. — cargo" del usuario que reportó, o el id crudo si no se pudo resolver. */
  nombreUsuario(idUsuario: string): string {
    const u = this.usuarios.find((x) => x.idUsuario === idUsuario);
    return u ? `${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''}`.trim() || idUsuario : idUsuario;
  }

  contarEstado(estado: string): number {
    return this.novedades.filter((n) => n.estado === estado).length;
  }

  verDetalle(n: Novedad): void {
    this.detalle = n;
    this.detalleAbierto = true;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [novedades, items, sitios, usuarios] = await Promise.all([
        this.api.listarNovedades(),
        this.api.listarItems(),
        this.api.listarSitios(),
        this.personaApi.listarUsuarios(),
      ]);
      this.novedades = novedades;
      this.items = items;
      this.sitios = sitios;
      this.usuarios = usuarios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las novedades.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    this.form = { tipo: 'OTRO', descripcion: '', id_item: null };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    if (!form['descripcion']?.trim()) {
      this.error = 'La descripción es obligatoria.';
      return;
    }
    this.saving = true;
    this.error = null;
    try {
      await this.api.crearNovedad({
        tipo: form['tipo'] as TipoNovedad,
        descripcion: form['descripcion'],
        id_item: form['id_item'] || undefined,
      });
      this.toast.ok('Novedad registrada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la novedad.';
    } finally {
      this.saving = false;
    }
  }

  async cambiarEstado(n: Novedad, estado: 'EN_PROCESO' | 'RESUELTA'): Promise<void> {
    try {
      await this.api.actualizarNovedad(n.id_novedad, estado);
      this.toast.ok('Novedad actualizada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo actualizar la novedad.');
    }
  }

  async eliminar(n: Novedad): Promise<void> {
    if (!(await this.confirm.ask(`¿Eliminar la novedad "${n.descripcion}"?`))) return;
    try {
      await this.api.eliminarNovedad(n.id_novedad);
      this.toast.ok('Novedad eliminada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar la novedad.');
    }
  }
}
