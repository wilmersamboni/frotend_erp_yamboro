import { Component, Input, OnChanges, signal } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { AdminService } from '../services/admin.service';
import { PermisosGestionService, Permiso } from '../../../core/services/permisos-gestion.service';
import { ToastService } from '../../../core/services/toast.service';

/**
 * Traducción de `servicio.nombre` técnico → frase en español. No es
 * exhaustivo a propósito: lo que falte cae al formateador genérico
 * (formatServicio) en vez de romperse o mostrar vacío — mismo criterio que
 * `friendlyPerms` en el componente equivalente de SGM
 * (frontend-proyecto/src/app/presentation/roles/roles.component.ts).
 *
 * Alternativa considerada: agregar una columna `descripcion` a la tabla
 * `servicios` en backend-erp (fuente única de verdad, cero texto duplicado
 * acá) — se descartó por ahora por requerir migración por tenant; ver plan.
 */
const SERVICIO_LABELS: Record<string, string> = {
  // Materiales — catálogo
  'materiales.sitios.ver': 'Ver sitios de bodega', 'materiales.sitios.crear': 'Crear sitios de bodega',
  'materiales.sitios.editar': 'Editar sitios de bodega', 'materiales.sitios.eliminar': 'Eliminar sitios de bodega',
  'materiales.productos.ver': 'Ver catálogo de productos', 'materiales.productos.crear': 'Crear productos',
  'materiales.productos.editar': 'Editar productos', 'materiales.productos.eliminar': 'Eliminar productos',
  'materiales.items.ver': 'Ver ítems individuales', 'materiales.items.crear': 'Crear ítems',
  'materiales.items.editar': 'Editar ítems',
  'materiales.inventario.ver': 'Ver inventario', 'materiales.inventario.crear': 'Registrar entradas de inventario',
  'materiales.inventario.editar': 'Editar inventario', 'materiales.inventario.eliminar': 'Eliminar inventario',
  'materiales.kardex.ver': 'Ver kardex de movimientos',
  'materiales.notificaciones.ver': 'Ver notificaciones de materiales',
  // Materiales — solicitudes de préstamo
  'materiales.solicitudes.ver': 'Ver solicitudes de material', 'materiales.solicitudes.crear': 'Crear solicitudes de material',
  'materiales.solicitudes.aprobar': 'Aprobar solicitudes de material', 'materiales.solicitudes.rechazar': 'Rechazar solicitudes de material',
  'materiales.solicitudes.entregar': 'Entregar material solicitado', 'materiales.solicitudes.confirmar': 'Confirmar recepción de material',
  // Materiales — novedades / traslados / asignaciones / devoluciones
  'materiales.novedades.ver': 'Ver novedades (daño/pérdida)', 'materiales.novedades.crear': 'Reportar novedades',
  'materiales.novedades.editar': 'Resolver novedades', 'materiales.novedades.eliminar': 'Eliminar novedades',
  'materiales.traslados.ver': 'Ver traslados entre sitios', 'materiales.traslados.crear': 'Crear traslados',
  'materiales.traslados.aprobar': 'Aprobar traslados', 'materiales.traslados.rechazar': 'Rechazar traslados',
  'materiales.asignaciones.ver': 'Ver asignaciones a fichas', 'materiales.asignaciones.crear': 'Crear asignaciones',
  'materiales.asignaciones.anular': 'Anular asignaciones', 'materiales.asignaciones.editar': 'Editar asignaciones',
  'materiales.asignaciones.eliminar': 'Eliminar asignaciones',
  'materiales.devoluciones.ver': 'Ver devoluciones', 'materiales.devoluciones.crear': 'Registrar devoluciones',
  'materiales.detalle-solicitud.ver': 'Ver detalle de solicitudes', 'materiales.detalle-solicitud.crear': 'Crear detalle de solicitudes',
  'materiales.actas.ver': 'Ver actas de entrega', 'materiales.actas.crear': 'Crear actas de entrega',
  'materiales.chequeos.ver': 'Ver listas de chequeo', 'materiales.chequeos.crear': 'Crear listas de chequeo',
  'materiales.items-chequeo.ver': 'Ver ítems de chequeo', 'materiales.items-chequeo.crear': 'Crear ítems de chequeo',
  // Personas y Matrículas
  'personas.ver': 'Ver personas', 'personas.gestionar': 'Crear y editar personas',
  'matriculas.ver': 'Ver matrículas', 'matriculas.gestionar': 'Crear y editar matrículas',
  // Horarios
  'horarios.ver': 'Ver horarios', 'horarios.gestionar': 'Crear y editar horarios',
  'horarios.competencias': 'Gestionar competencias', 'horarios.eventos': 'Gestionar eventos del calendario',
  // Etapa Práctica
  'practica.empresas': 'Gestionar empresas de práctica', 'practica.etapas': 'Gestionar etapas prácticas',
  'practica.asignaciones': 'Asignar aprendices a práctica', 'practica.seguimientos': 'Dar seguimiento a la práctica',
  'practica.bitacoras': 'Gestionar bitácoras', 'practica.observaciones': 'Gestionar observaciones',
  'practica.formatos': 'Gestionar formatos', 'practica.migracion': 'Migrar datos de práctica',
  // Encuestas
  'encuestas.preguntas': 'Gestionar preguntas de encuestas', 'encuestas.gestionar': 'Gestionar encuestas',
  // Ambientes / RBAC
  'ambientes.gestionar': 'Gestionar ambientes físicos', 'permisos.gestionar': 'Gestionar roles y permisos del sistema',
};

/** Ícono por nombre real de módulo (servicio.modulo.nombre) — con fallback genérico. */
const MODULO_ICONOS: Record<string, string> = {
  'Materiales': '📦', 'Etapa Práctica': '🧭', 'Horarios': '🗓️',
  'Personas y Matrículas': '🧑‍🤝‍🧑', 'Encuestas': '📊', 'Ambientes': '🏫', 'RBAC': '🔐',
};

function formatServicio(nombre: string): string {
  return nombre.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' › ');
}

interface GrupoServicios {
  modulo: string;
  icono: string;
  servicios: { idServicio: string; nombre: string }[];
}

@Component({
  selector: 'app-permisos-panel',
  standalone: true,
  template: `
    <div class="w-full bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mt-4">
      <div class="bg-gray-50/60 border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#39A900]/10 flex items-center justify-center text-lg">🔑</div>
          <div>
            <h4 class="text-base font-bold text-gray-800 m-0 leading-tight">
              @if (modo === 'rol') {
                Permisos del rol {{ rolFila?.nombre }}
              } @else {
                Permisos de {{ usuarioFila?.persona?.nombre ?? usuarioFila?.persona?.nombreCompleto }}
              }
            </h4>
            <p class="text-xs text-gray-500 m-0 mt-0.5">
              @if (modo === 'rol') {
                Aplican a todas las cuentas con este rol.
              } @else {
                Rol: <span class="font-semibold text-gray-700">{{ rolDelUsuario()?.nombre ?? '—' }}</span> — lo atenuado ya lo tiene por su rol.
              }
            </p>
          </div>
        </div>
        @if (modo === 'usuario') {
          <div class="flex items-center gap-2">
            <button type="button" class="panel-action-btn"
              [disabled]="procesandoAccionMasiva()"
              (click)="restablecerAlRol()">Restablecer al rol</button>
            <button type="button" class="panel-action-btn danger"
              [disabled]="procesandoAccionMasiva()"
              (click)="activarTodos()">Activar todos los servicios</button>
          </div>
        }
      </div>

      <div class="p-6">
        @if (cargando()) {
          <div class="flex justify-center py-10">
            <div class="w-7 h-7 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
          </div>
        } @else {
          <div class="max-h-[560px] overflow-y-auto pr-2 flex flex-col gap-6">
            @for (grupo of grupos(); track grupo.modulo) {
              <div class="bg-gray-50/50 border border-gray-100 rounded-xl p-4">
                <button type="button"
                  class="perm-group-header"
                  [class.collapsed]="isColapsado(grupo.modulo)"
                  (click)="toggleGrupo(grupo.modulo)">
                  <span>{{ grupo.icono }}</span> {{ grupo.modulo }}
                  <span class="ml-auto text-[10px] font-bold text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                    {{ grupo.servicios.length }} permisos
                  </span>
                  <button type="button" class="perm-activar-modulo-btn"
                    [disabled]="procesandoAccionMasiva()"
                    (click)="$event.stopPropagation(); activarModulo(grupo)">Activar todo</button>
                  <svg class="perm-group-chevron" [class.expanded]="!isColapsado(grupo.modulo)"
                    width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
                @if (!isColapsado(grupo.modulo)) {
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1">
                    @for (s of grupo.servicios; track s.idServicio) {
                      <div class="flex items-center py-2 border-t border-gray-100 first:border-0"
                           [class.opacity-60]="!activo(s.idServicio)">
                        <div class="flex flex-col min-w-0 flex-1 pr-3">
                          <span class="font-semibold text-gray-800 text-sm truncate" [title]="label(s.nombre)">{{ label(s.nombre) }}</span>
                          <span class="text-[10.5px] text-gray-400 truncate font-mono" [title]="s.nombre">{{ s.nombre }}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          @if (esExcepcion(s.idServicio)) {
                            <button type="button" title="Quitar excepción (volver a heredar del rol)"
                              class="text-[11px] text-gray-400 hover:text-gray-600 underline"
                              (click)="quitarExcepcion(s.idServicio)">quitar excepción</button>
                          }
                          <button type="button"
                            class="perm-pill-btn" [class.on]="activo(s.idServicio)" [class.off]="!activo(s.idServicio)"
                            (click)="toggle(s.idServicio)">
                            {{ activo(s.idServicio) ? '✓ Activo' : '✕ Inactivo' }}
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .perm-pill-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 14px; border-radius: 999px; border: 1.6px solid;
      background: #fff; font-size: 11.5px; font-weight: 700; cursor: pointer;
      white-space: nowrap; transition: all .15s ease;
    }
    .perm-pill-btn.on  { border-color: #39A900; color: #39A900; }
    .perm-pill-btn.on:hover  { background: rgba(57,169,0,.06); }
    .perm-pill-btn.off { border-color: #ef4444; color: #ef4444; }
    .perm-pill-btn.off:hover { background: rgba(239,68,68,.06); }

    .perm-group-header {
      width: 100%; display: flex; align-items: center; gap: 8px;
      background: none; border: none; cursor: pointer; font-family: inherit;
      text-align: left; padding: 0 0 8px; margin-bottom: 12px;
      border-bottom: 1px solid rgba(209,213,219,.7);
      font-size: 12px; font-weight: 700; color: #374151;
      text-transform: uppercase; letter-spacing: .04em;
    }
    .perm-group-header.collapsed { border-bottom-color: transparent; margin-bottom: 0; padding-bottom: 0; }
    .perm-group-header:hover { color: #39A900; }
    .perm-group-chevron { color: #9ca3af; flex-shrink: 0; transition: transform .18s ease-in-out, color .15s; }
    .perm-group-chevron.expanded { transform: rotate(90deg); }
    .perm-group-header:hover .perm-group-chevron { color: #39A900; }

    .perm-activar-modulo-btn {
      font-size: 10.5px; font-weight: 700; text-transform: none; letter-spacing: normal;
      color: #39A900; background: #fff; border: 1.4px solid #39A900;
      border-radius: 999px; padding: 3px 10px; cursor: pointer; white-space: nowrap;
      transition: background .15s ease;
    }
    .perm-activar-modulo-btn:hover:not(:disabled) { background: rgba(57,169,0,.08); }
    .perm-activar-modulo-btn:disabled { opacity: .5; cursor: not-allowed; }

    .panel-action-btn {
      font-size: 11.5px; font-weight: 700; color: #374151; background: #fff;
      border: 1.4px solid #d1d5db; border-radius: 8px; padding: 6px 12px;
      cursor: pointer; white-space: nowrap; transition: all .15s ease;
    }
    .panel-action-btn:hover:not(:disabled) { border-color: #9ca3af; background: #f9fafb; }
    .panel-action-btn.danger { color: #b91c1c; border-color: #fca5a5; }
    .panel-action-btn.danger:hover:not(:disabled) { background: rgba(185,28,28,.06); }
    .panel-action-btn:disabled { opacity: .5; cursor: not-allowed; }
  `],
})
export class PermisosPanelComponent implements OnChanges {
  @Input() modo: 'rol' | 'usuario' = 'rol';
  @Input() rolFila: any = null;
  @Input() usuarioFila: any = null;

  /** Umbral a partir del cual un grupo arranca colapsado (igual criterio que el sidebar). */
  private static readonly UMBRAL_COLAPSADO = 4;

  cargando = signal(true);
  private permisos = signal<Permiso[]>([]);
  grupos = signal<GrupoServicios[]>([]);
  private colapsados = signal<Set<string>>(new Set());

  /** Deshabilita los botones de acción masiva mientras una llamada está en curso. */
  procesandoAccionMasiva = signal(false);

  constructor(
    private admin: AdminService,
    private permisosSvc: PermisosGestionService,
    private toast: ToastService,
    private confirmSvc: ConfirmationService,
  ) {}

  async ngOnChanges(): Promise<void> {
    this.cargando.set(true);
    await Promise.all([
      this.asegurar('roles'), this.asegurar('servicios'), this.asegurar('usuarios'), this.asegurar('personas'),
    ]);
    await this.recargarPermisos();
    this.construirGrupos();
    this.cargando.set(false);
  }

  private async asegurar(mod: 'roles' | 'servicios' | 'usuarios' | 'personas'): Promise<void> {
    if (!this.admin.rawData()[mod]?.length) await this.admin.cargar(mod);
  }

  private async recargarPermisos(): Promise<void> {
    try {
      this.permisos.set(await this.permisosSvc.listar());
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los permisos');
    }
  }

  private construirGrupos(): void {
    const servicios: any[] = this.admin.rawData()['servicios'] ?? [];
    const porModulo = new Map<string, { idServicio: string; nombre: string }[]>();
    for (const s of servicios) {
      const nombreModulo = s.modulo?.nombre ?? 'Otros';
      if (!porModulo.has(nombreModulo)) porModulo.set(nombreModulo, []);
      porModulo.get(nombreModulo)!.push({ idServicio: s.idServicio, nombre: s.nombre });
    }
    const gruposOrdenados = [...porModulo.entries()]
      .map(([modulo, servicios]) => ({ modulo, icono: MODULO_ICONOS[modulo] ?? '🔧', servicios }))
      .sort((a, b) => b.servicios.length - a.servicios.length);
    this.grupos.set(gruposOrdenados);
    // Arranca colapsado todo grupo grande — evita el muro de permisos al abrir el panel.
    this.colapsados.set(
      new Set(gruposOrdenados.filter(g => g.servicios.length > PermisosPanelComponent.UMBRAL_COLAPSADO).map(g => g.modulo)),
    );
  }

  isColapsado(modulo: string): boolean {
    return this.colapsados().has(modulo);
  }

  toggleGrupo(modulo: string): void {
    this.colapsados.update(set => {
      const next = new Set(set);
      if (next.has(modulo)) next.delete(modulo); else next.add(modulo);
      return next;
    });
  }

  label(nombre: string): string {
    return SERVICIO_LABELS[nombre] ?? formatServicio(nombre);
  }

  rolDelUsuario(): any {
    if (this.modo !== 'usuario') return null;
    const cargo = this.usuarioFila?.persona?.cargo;
    return (this.admin.rawData()['roles'] ?? []).find((r: any) => r.nombre === cargo) ?? null;
  }

  private permisoRolWide(servicioId: string): Permiso | undefined {
    const rolId = this.modo === 'rol' ? this.rolFila?.idRol : this.rolDelUsuario()?.idRol;
    return this.permisos().find(p => p.rolId === rolId && p.servicioId === servicioId && !p.usuarioId);
  }

  private permisoExcepcion(servicioId: string): Permiso | undefined {
    if (this.modo !== 'usuario') return undefined;
    return this.permisos().find(p => p.usuarioId === this.usuarioFila?.idUsuario && p.servicioId === servicioId);
  }

  esExcepcion(servicioId: string): boolean {
    return !!this.permisoExcepcion(servicioId);
  }

  /** Estado EFECTIVO mostrado en la pill: excepción propia si existe, si no lo que da el rol. */
  activo(servicioId: string): boolean {
    if (this.modo === 'rol') return !!this.permisoRolWide(servicioId);
    const exc = this.permisoExcepcion(servicioId);
    if (exc) return exc.activo !== false;
    return !!this.permisoRolWide(servicioId);
  }

  async toggle(servicioId: string): Promise<void> {
    const nuevoActivo = !this.activo(servicioId);
    try {
      if (this.modo === 'rol') {
        const existente = this.permisoRolWide(servicioId);
        if (existente) await this.permisosSvc.revocar(existente.idPermiso);
        else await this.permisosSvc.otorgar(this.rolFila.idRol, servicioId);
      } else {
        const rolId = this.rolDelUsuario()?.idRol;
        if (!rolId) { this.toast.warn('Esta persona no tiene un rol reconocido'); return; }
        const existenteExc = this.permisoExcepcion(servicioId);
        if (existenteExc) await this.permisosSvc.revocar(existenteExc.idPermiso);
        await this.permisosSvc.otorgar(rolId, servicioId, this.usuarioFila.idUsuario, nuevoActivo);
      }
      await this.recargarPermisos();
      this.toast.ok('Permiso actualizado');
    } catch (e) {
      this.toast.httpError(e, 'No se pudo actualizar el permiso');
    }
  }

  async quitarExcepcion(servicioId: string): Promise<void> {
    const exc = this.permisoExcepcion(servicioId);
    if (!exc) return;
    try {
      await this.permisosSvc.revocar(exc.idPermiso);
      await this.recargarPermisos();
      this.toast.ok('Excepción eliminada', 'Ahora hereda lo que le da su rol.');
    } catch (e) {
      this.toast.httpError(e, 'No se pudo quitar la excepción');
    }
  }

  private rolIdActual(): string | undefined {
    return this.modo === 'rol' ? this.rolFila?.idRol : this.rolDelUsuario()?.idRol;
  }

  /** Botón "Activar todo" de un grupo — otorga todos sus servicios al rol o (en modo usuario) como excepción personal. */
  async activarModulo(grupo: GrupoServicios): Promise<void> {
    const rolId = this.rolIdActual();
    if (!rolId) { this.toast.warn('No se encontró un rol reconocido'); return; }

    this.procesandoAccionMasiva.set(true);
    try {
      const usuarioId = this.modo === 'usuario' ? this.usuarioFila?.idUsuario : undefined;
      const resultado = await this.permisosSvc.otorgarLote(rolId, grupo.servicios.map(s => s.idServicio), usuarioId);
      await this.recargarPermisos();
      this.toast.ok(`Módulo "${grupo.modulo}" activado`, `${resultado.creados + resultado.reactivados} permiso(s) otorgados.`);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo activar el módulo');
    } finally {
      this.procesandoAccionMasiva.set(false);
    }
  }

  /** Botón "Restablecer al rol" — borra todas las excepciones personales del usuario, vuelve a heredar 100% lo que da su rol. */
  restablecerAlRol(): void {
    if (this.modo !== 'usuario' || !this.usuarioFila?.idUsuario) return;
    this.confirmSvc.confirm({
      message: 'Se van a borrar TODAS las excepciones personales de esta persona — vuelve a tener exactamente lo que da su rol, ni más ni menos. Esta acción no se puede deshacer.',
      header: 'Restablecer permisos al rol',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Sí, restablecer', severity: 'danger' },
      accept: async () => {
        this.procesandoAccionMasiva.set(true);
        try {
          const resultado = await this.permisosSvc.restablecerUsuario(this.usuarioFila.idUsuario);
          await this.recargarPermisos();
          this.toast.ok('Permisos restablecidos', `${resultado.eliminados} excepción(es) eliminada(s).`);
        } catch (e) {
          this.toast.httpError(e, 'No se pudo restablecer');
        } finally {
          this.procesandoAccionMasiva.set(false);
        }
      },
    });
  }

  /** Botón "Activar todos los servicios" — otorga a esta persona TODO el catálogo como excepción personal, sin importar su rol. */
  activarTodos(): void {
    const rolId = this.rolIdActual();
    if (this.modo !== 'usuario' || !this.usuarioFila?.idUsuario || !rolId) return;
    const todosLosServicios: { idServicio: string }[] = this.admin.rawData()['servicios'] ?? [];

    this.confirmSvc.confirm({
      message: `Se le van a otorgar TODOS los servicios del sistema (${todosLosServicios.length}) a esta persona, sin importar su rol — un acceso total como excepción personal. Esta acción no se puede deshacer con un solo click.`,
      header: 'Activar todos los servicios',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Sí, activar todo', severity: 'danger' },
      accept: async () => {
        this.procesandoAccionMasiva.set(true);
        try {
          const resultado = await this.permisosSvc.otorgarLote(
            rolId, todosLosServicios.map(s => s.idServicio), this.usuarioFila.idUsuario,
          );
          await this.recargarPermisos();
          this.toast.ok('Todos los servicios activados', `${resultado.creados + resultado.reactivados} otorgados.`);
        } catch (e) {
          this.toast.httpError(e, 'No se pudo activar todo');
        } finally {
          this.procesandoAccionMasiva.set(false);
        }
      },
    });
  }
}
