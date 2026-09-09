import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../../../core/services/realtime/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { StatCardComponent } from '../../../shared/components/stat-card.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { PermisosService } from '../../../core/services/permisos.service';
import { AuthService } from '../../../core/services/auth.service';
import { PersonaService } from '../../../core/services/persona.service';
import { EstadoItem, Item, MaterialesApiService, Novedad, Sitio, TipoNovedad } from '../../../core/services/materiales/materiales-api.service';

/** Estados en los que puede quedar el ítem al mover una novedad (Tier SigMat M7). */
const OPCIONES_ESTADO_ITEM: { label: string; value: EstadoItem | '' }[] = [
  { label: '— Dejar el ítem como está —', value: '' },
  { label: 'Disponible (reparado / sin problema)', value: 'DISPONIBLE' },
  { label: 'En mantenimiento', value: 'EN_MANTENIMIENTO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
];

const OPCIONES_TIPO: OpcionSelect[] = [
  { label: 'Daño', value: 'DAÑO' },
  { label: 'Pérdida', value: 'PERDIDA' },
  { label: 'Mantenimiento', value: 'MANTENIMIENTO' },
  { label: 'Discrepancia', value: 'DISCREPANCIA' },
  { label: 'Otro', value: 'OTRO' },
];

/**
 * Reportes de novedades sobre ítems para instructor: crear siempre
 * disponible; marcar en proceso/resuelta exige además la excepción personal
 * de "responsable de bodega" (`materiales.novedades.editar`) Y ser
 * realmente el responsable del sitio del ítem (sin excepción cuando el
 * sitio no tiene responsable) — ver Ronda 4 Fase 5. Eliminar solo depende
 * del servicio, sin chequeo de sitio (el backend tampoco lo tiene ahí).
 *
 * Pulido (Ronda 4, Fase 9): columna "Reportado por" + tarjetas resumen —
 * ver docblock de la versión admin.
 */
@Component({
  selector: 'app-instructor-materiales-novedades',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent, StatusBadgeComponent, StatCardComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <div class="flex items-center gap-2">
          <h1 class="text-xl font-bold text-gray-800">Novedades</h1>
          @if (idItemFiltro) {
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#39A900]/10 text-[#2d8000] border border-[#39A900]/20">
              Filtrando por ítem
              <button (click)="quitarFiltroItem()" class="hover:text-red-600" title="Quitar filtro">×</button>
            </span>
          }
        </div>
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
      } @else if (novedadesFiltradas.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay novedades {{ idItemFiltro ? 'para este ítem' : 'registradas' }}</p>
      } @else {
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <app-stat-card label="Total" [value]="novedadesFiltradas.length" tono="neutral">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          </app-stat-card>
          <app-stat-card label="Pendientes" [value]="contarEstado('PENDIENTE')" tono="warning">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </app-stat-card>
          <app-stat-card label="En proceso" [value]="contarEstado('EN_PROCESO')" tono="info">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </app-stat-card>
          <app-stat-card label="Resueltas" [value]="contarEstado('RESUELTA')" tono="success">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </app-stat-card>
        </div>

        <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Tipo</th>
                <th class="px-4 py-3 text-left font-semibold">Descripción</th>
                <th class="px-4 py-3 text-left font-semibold">Ítem</th>
                <th class="px-4 py-3 text-left font-semibold">Reportado por</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (n of novedadesFiltradas; track n.id_novedad) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ n.tipo }}</td>
                  <td class="px-4 py-3 text-gray-700 max-w-[280px] truncate">{{ n.descripcion }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ n.item?.producto?.nombre ?? n.item?.codigo_sku ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreUsuario(n) }}</td>
                  <td class="px-4 py-3"><app-status-badge [value]="n.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ n.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-2">
                      <button (click)="verDetalle(n)"
                        class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors">
                        Ver
                      </button>
                      @if (puedeEditar && n.estado === 'PENDIENTE' && esResponsableDelSitio(n)) {
                        <button (click)="cambiarEstado(n, 'EN_PROCESO')"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 transition-colors">
                          En proceso
                        </button>
                      }
                      @if (puedeEditar && n.estado === 'EN_PROCESO' && esResponsableDelSitio(n)) {
                        <button (click)="cambiarEstado(n, 'RESUELTA')"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200 text-green-600 bg-white hover:bg-green-50 transition-colors">
                          Resolver
                        </button>
                      }
                      @if (puedeEliminar) {
                        <button (click)="eliminar(n)"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-red-400 hover:text-red-600 transition-colors">
                          Eliminar
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>
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

    @if (resolverAbierto && resolverNovedad) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="resolverAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800">
              {{ resolverEstadoNovedad === 'RESUELTA' ? 'Resolver novedad' : 'Poner novedad en proceso' }}
            </h2>
            <button (click)="resolverAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <p class="text-sm text-gray-500 mb-3">
            {{ resolverNovedad.tipo }} sobre
            <span class="font-medium text-gray-700">{{ resolverNovedad.item?.producto?.nombre ?? resolverNovedad.item?.codigo_sku ?? 'el ítem' }}</span>.
            Elegí en qué estado queda el ítem.
          </p>
          <select [(ngModel)]="resolverEstadoItem"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
            @for (o of opcionesEstadoItem; track o.value) {
              <option [value]="o.value">{{ o.label }}</option>
            }
          </select>
          <div class="flex justify-end gap-2 mt-6">
            <button (click)="resolverAbierto = false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="confirmarResolver()" [disabled]="resolviendo"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors" style="background-color: #39A900">
              {{ resolviendo ? 'Guardando...' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    }

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
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Reportado por</dt><dd class="text-gray-800 text-right">{{ nombreUsuario(detalle) }}</dd></div>
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
export class InstructorMaterialesNovedadesComponent implements OnInit {
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

  /** Diálogo "resolver / poner en proceso" con estado resultante del ítem (Tier SigMat M7). */
  opcionesEstadoItem = OPCIONES_ESTADO_ITEM;
  resolverAbierto = false;
  resolverNovedad: Novedad | null = null;
  resolverEstadoNovedad: 'EN_PROCESO' | 'RESUELTA' = 'RESUELTA';
  resolverEstadoItem: EstadoItem | '' = '';
  resolviendo = false;

  placeholders: Record<string, string> = { descripcion: 'Ej: La carcasa llegó rajada / falta 1 unidad respecto al conteo' };

  columnLabels: Record<string, string> = { id_item: 'Ítem (opcional)' };

  /** `?id_item=` de la navegación cruzada (Ítems → Novedades). */
  idItemFiltro: string | null = null;

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private permisos: PermisosService,
    private auth: AuthService,
    private personaApi: PersonaService,
    private route: ActivatedRoute,
    private router: Router,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
  ) {}

  get novedadesFiltradas(): Novedad[] {
    return this.idItemFiltro ? this.novedades.filter((n) => n.id_item === this.idItemFiltro) : this.novedades;
  }

  quitarFiltroItem(): void {
    this.idItemFiltro = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  get puedeEditar(): boolean {
    return this.permisos.tieneServicio('materiales.novedades.editar');
  }
  get puedeEliminar(): boolean {
    return this.permisos.tieneServicio('materiales.novedades.eliminar');
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
    this.permisos.cargar();
    this.cargar();
    this.live.eventos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());
  }

  /**
   * Nombre de quien reportó. Prioriza `usuario_nombre` que ya resuelve el
   * backend (un encargado de bodega no puede bulk-cargar `/api/usuarios`, así
   * que `this.usuarios` suele venir vacío para este rol); si no llegó, cae a la
   * resolución client-side y por último al id crudo.
   */
  nombreUsuario(n: Novedad): string {
    if (n.usuario_nombre) return n.usuario_nombre;
    const u = this.usuarios.find((x) => x.idUsuario === n.id_usuario);
    return u ? `${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''}`.trim() || n.id_usuario : n.id_usuario;
  }

  contarEstado(estado: string): number {
    return this.novedadesFiltradas.filter((n) => n.estado === estado).length;
  }

  verDetalle(n: Novedad): void {
    this.detalle = n;
    this.detalleAbierto = true;
  }

  private async cargar(): Promise<void> {
    this.idItemFiltro = this.route.snapshot.queryParamMap.get('id_item');
    this.loading = true;
    try {
      // M9 — solo `listarNovedades()` es crítico; una secundaria con 403
      // (excepción personal) no debe tumbar la tabla entera.
      const [novedades, items, sitios, usuarios] = await Promise.all([
        this.api.listarNovedades(),
        this.api.listarItems().catch(() => [] as Item[]),
        this.api.listarSitios().catch(() => [] as Sitio[]),
        this.personaApi.listarUsuarios().catch(() => []),
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
    // Con ítem asociado: diálogo para elegir el estado resultante del ítem
    // (Tier SigMat M7). Sin ítem: cambio directo.
    if (n.id_item) {
      this.resolverNovedad = n;
      this.resolverEstadoNovedad = estado;
      this.resolverEstadoItem = this.defaultEstadoItem(n, estado);
      this.resolverAbierto = true;
      return;
    }
    await this.enviarCambioEstado(n, estado);
  }

  private defaultEstadoItem(n: Novedad, estado: 'EN_PROCESO' | 'RESUELTA'): EstadoItem | '' {
    if (estado === 'EN_PROCESO') return 'EN_MANTENIMIENTO';
    if (n.tipo === 'DAÑO') return 'DAÑADO';
    if (n.tipo === 'PERDIDA') return 'PERDIDO';
    return 'DISPONIBLE';
  }

  async confirmarResolver(): Promise<void> {
    if (!this.resolverNovedad) return;
    this.resolviendo = true;
    try {
      await this.enviarCambioEstado(
        this.resolverNovedad,
        this.resolverEstadoNovedad,
        this.resolverEstadoItem || undefined,
      );
      this.resolverAbierto = false;
    } finally {
      this.resolviendo = false;
    }
  }

  private async enviarCambioEstado(
    n: Novedad,
    estado: 'EN_PROCESO' | 'RESUELTA',
    estadoItem?: EstadoItem,
  ): Promise<void> {
    try {
      await this.api.actualizarNovedad(n.id_novedad, estado, estadoItem);
      this.toast.ok(estadoItem ? 'Novedad actualizada y ítem actualizado' : 'Novedad actualizada');
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
