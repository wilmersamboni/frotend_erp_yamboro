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
  // Nombres técnicos ('gestionar'/'administrar') que no reflejan lo que
  // realmente gatean en empresa.controller.ts — .gestionar es de hecho el
  // permiso de VER el listado completo, y .administrar es el que de verdad
  // cubre crear/editar/eliminar. Etiquetas explícitas para no guiarse por
  // el nombre técnico, que engaña.
  'practica.empresas.ver': 'Ver el detalle de una empresa',
  'practica.empresas.gestionar': 'Ver el listado completo de empresas',
  'practica.empresas.administrar': 'Crear, editar y eliminar empresas — control total',
  'practica.formatos.ver': 'Ver formatos', 'practica.formatos.gestionar': 'Gestionar formatos (subir, editar y eliminar)',
  'practica.migracion': 'Migrar datos de práctica',
  // Encuestas
  'encuestas.preguntas': 'Gestionar preguntas de encuestas', 'encuestas.gestionar': 'Gestionar encuestas',
  // Ambientes / RBAC
  'ambientes.gestionar': 'Gestionar ambientes físicos', 'permisos.gestionar': 'Gestionar roles y permisos del sistema',
  // Usuarios/Académico/Organización — antes sin ningún guard en el backend
  'usuarios.gestionar': 'Ver y gestionar usuarios y credenciales de acceso',
  'academico.gestionar': 'Crear, editar y eliminar cursos y programas',
  'organizacion.gestionar': 'Crear, editar y eliminar sedes, municipios y áreas',
};

/** Ícono por nombre real de módulo (servicio.modulo.nombre) — con fallback genérico. */
const MODULO_ICONOS: Record<string, string> = {
  'Materiales': '📦', 'Etapa Práctica': '🧭', 'Horarios': '🗓️',
  'Personas y Matrículas': '🧑‍🤝‍🧑', 'Encuestas': '📊', 'Ambientes': '🏫', 'RBAC': '🔐',
  'Usuarios y Credenciales': '🔑', 'Académico': '📚', 'Organización': '🗺️',
};

function formatServicio(nombre: string): string {
  return nombre.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' › ');
}

/** Un peldaño de la escalera: uno o más servicios que se otorgan/revocan juntos (ej. crear+editar bajo "Editar"). */
interface PasoEscalera {
  servicios: { idServicio: string; nombre: string }[];
  label: string;
}

/** Acción que no es un nivel de acceso (aprobar, subir, competencias...) — chip independiente, fuera de la escalera. */
interface ExtraChip {
  idServicio: string;
  nombre: string;
  label: string;
}

interface RecursoUI {
  /** Nombre técnico del recurso (todo antes del último '.'), ej. 'practica.formatos' o 'personas'. */
  recurso: string;
  /** Etiqueta legible, ej. 'Formatos' o 'Personas'. */
  label: string;
  /** Ordenados de menor a mayor acceso. Vacío si el recurso no tiene ningún nivel reconocible (solo extras). */
  pasos: PasoEscalera[];
  extras: ExtraChip[];
}

interface GrupoServicios {
  modulo: string;
  icono: string;
  /** Lista plana — usada por el conteo del encabezado y "Activar todo" del módulo. */
  servicios: { idServicio: string; nombre: string }[];
  recursos: RecursoUI[];
}

/** 'practica.formatos.ver' → recurso 'practica.formatos'; 'personas.ver' → recurso 'personas'. */
function recursoDe(nombre: string): string {
  const i = nombre.lastIndexOf('.');
  return i === -1 ? nombre : nombre.slice(0, i);
}

function labelRecurso(recurso: string): string {
  const ultimo = recurso.split('.').pop()!;
  return ultimo.charAt(0).toUpperCase() + ultimo.slice(1);
}

/**
 * Posición en la escalera según el último segmento del nombre técnico.
 * 'crear'/'editar'/'gestionar' caen en la MISMA posición (1) porque en este
 * catálogo nunca conviven como niveles independientes de un mismo recurso
 * (o se otorgan siempre juntos, o el recurso solo tiene uno de los tres) —
 * fusionarlos es lo que evita forzar "Editar" y "Gestionar" como dos
 * peldaños que en la práctica siempre se activan a la vez.
 * Cualquier acción fuera de este mapa (aprobar, subir, competencias...) no
 * es un nivel de acceso — se muestra aparte como chip independiente.
 */
const RUNGO_POSICION: Record<string, number> = {
  ver: 0,
  crear: 1, editar: 1, gestionar: 1,
  eliminar: 2, administrar: 2,
};

/**
 * Los nombres técnicos 'gestionar'/'administrar' no siempre describen el
 * nivel real (ver comentario en SERVICIO_LABELS sobre practica.empresas:
 * ahí '.gestionar' es de hecho una lectura ampliada, no una escritura) — acá
 * van los textos CORTOS de esos botones puntuales; el resto sale de
 * `labelPasoGenerico`.
 */
const RUNGO_LABEL_OVERRIDE: Record<string, string> = {
  'practica.empresas.ver': 'Ver detalle',
  'practica.empresas.gestionar': 'Ver listado',
};

function labelPasoGenerico(posicion: number, acciones: string[]): string {
  if (posicion === 0) return 'Ver';
  if (posicion === 2) return acciones.includes('administrar') ? 'Control total' : 'Eliminar';
  return acciones.includes('editar') || acciones.includes('gestionar') ? 'Editar' : 'Crear';
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
                  <div class="bg-white border border-gray-100 rounded-lg px-3">
                    @for (r of grupo.recursos; track r.recurso) {
                      <div class="perm-recurso-bloque">
                        <div class="perm-recurso-row">
                          <div class="perm-recurso-nombre">
                            <span>{{ r.label }}</span>
                            @if (tieneExcepcion(r)) {
                              <button type="button" class="perm-exc-badge"
                                title="Excepción propia — quitar (volver a heredar del rol)"
                                (click)="quitarExcepcionRecurso(r)">excepción ×</button>
                            }
                          </div>

                          @if (r.pasos.length > 0) {
                            <div class="perm-escalera">
                              <button type="button" class="perm-escalon" [class.activo]="nivelActual(r) === 0"
                                (click)="elegirNivel(r, 0)">Sin acceso</button>
                              @for (paso of r.pasos; track $index) {
                                <button type="button" class="perm-escalon" [class.activo]="nivelActual(r) === $index + 1"
                                  [style.--nivel-color]="colorNivel($index)"
                                  [title]="paso.servicios[0] ? label(paso.servicios[0].nombre) : ''"
                                  (click)="elegirNivel(r, $index + 1)">{{ paso.label }}</button>
                              }
                            </div>
                          }

                          <!-- Recurso sin escalera (ej. Migración): el único extra queda en esta misma fila, no hay nada más de qué colgarlo. -->
                          @if (r.pasos.length === 0 && r.extras.length > 0) {
                            <div class="perm-extras">
                              @for (ex of r.extras; track ex.idServicio) {
                                <button type="button" class="perm-extra-chip" [class.on]="activo(ex.idServicio)"
                                  [title]="label(ex.nombre)"
                                  (click)="toggle(ex.idServicio)">{{ ex.label }}</button>
                              }
                            </div>
                          }
                        </div>

                        @if (r.pasos.length > 0 && r.extras.length > 0) {
                          <div class="perm-extras-linea">
                            <span class="perm-extras-etiqueta">Además</span>
                            <div class="perm-extras">
                              @for (ex of r.extras; track ex.idServicio) {
                                <button type="button" class="perm-extra-chip" [class.on]="activo(ex.idServicio)"
                                  [title]="label(ex.nombre)"
                                  (click)="toggle(ex.idServicio)">{{ ex.label }}</button>
                              }
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
        }
      </div>
    </div>
  `,
  styles: [`
    .perm-recurso-bloque { padding: 9px 4px; border-top: 1px solid #f1f3ef; }
    .perm-recurso-bloque:first-child { border-top: none; }
    .perm-recurso-row {
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    }
    .perm-recurso-nombre {
      flex: 0 0 156px; min-width: 0; display: flex; flex-direction: column; gap: 2px;
    }
    .perm-recurso-nombre span { font-size: 13px; font-weight: 600; color: #1f2937; }
    .perm-exc-badge {
      align-self: flex-start; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
      color: #a2670d; background: #fbf0dd; border: none; padding: 1px 6px; border-radius: 5px; cursor: pointer;
    }
    .perm-exc-badge:hover { background: #f6e2bd; }

    .perm-extras-linea {
      display: flex; align-items: center; gap: 9px; margin-top: 7px; padding-left: 170px; flex-wrap: wrap;
    }
    .perm-extras-etiqueta {
      font-size: 10px; font-weight: 700; color: #b7c0b3; text-transform: uppercase; letter-spacing: .04em; flex-shrink: 0;
    }
    @media (max-width: 640px) { .perm-extras-linea { padding-left: 0; } }

    .perm-escalera { display: inline-flex; border: 1.5px solid #e5e7eb; border-radius: 9px; overflow: hidden; flex-shrink: 0; }
    .perm-escalon {
      font-family: inherit; font-size: 11.5px; font-weight: 600; color: #9ca3af; background: #fff;
      border: none; border-right: 1.5px solid #e5e7eb; padding: 6px 12px; cursor: pointer; white-space: nowrap;
      transition: background .12s ease, color .12s ease;
    }
    .perm-escalera .perm-escalon:last-child { border-right: none; }
    .perm-escalon:hover { background: #f5f7f4; }
    .perm-escalon.activo { background: var(--nivel-color, #007832); color: #fff; }

    .perm-extras { display: flex; gap: 6px; flex-wrap: wrap; }
    .perm-extra-chip {
      font-size: 11px; font-weight: 600; padding: 5px 10px; border-radius: 999px; border: 1.4px solid #e5e7eb;
      background: #fff; color: #9ca3af; cursor: pointer; white-space: nowrap; transition: all .12s ease;
    }
    .perm-extra-chip.on { border-color: #39A900; color: #39A900; background: rgba(57,169,0,.08); }
    .perm-extra-chip:hover { border-color: #39A900; }

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
      .map(([modulo, servicios]) => ({
        modulo,
        icono: MODULO_ICONOS[modulo] ?? '🔧',
        servicios,
        recursos: this.agruparPorRecurso(servicios),
      }))
      .sort((a, b) => b.servicios.length - a.servicios.length);
    this.grupos.set(gruposOrdenados);
    // Arranca colapsado todo grupo grande — evita el muro de permisos al abrir el panel.
    this.colapsados.set(
      new Set(gruposOrdenados.filter(g => g.servicios.length > PermisosPanelComponent.UMBRAL_COLAPSADO).map(g => g.modulo)),
    );
  }

  /** Parte la lista plana de un módulo en filas por recurso, cada una con su escalera de nivel (ver `RUNGO_POSICION`). */
  private agruparPorRecurso(servicios: { idServicio: string; nombre: string }[]): RecursoUI[] {
    const porRecurso = new Map<string, { idServicio: string; nombre: string }[]>();
    for (const s of servicios) {
      const recurso = recursoDe(s.nombre);
      if (!porRecurso.has(recurso)) porRecurso.set(recurso, []);
      porRecurso.get(recurso)!.push(s);
    }
    return [...porRecurso.entries()]
      .map(([recurso, items]) => this.construirRecursoUI(recurso, items))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private construirRecursoUI(recurso: string, items: { idServicio: string; nombre: string }[]): RecursoUI {
    const porPosicion = new Map<number, { idServicio: string; nombre: string }[]>();
    const extras: ExtraChip[] = [];

    for (const s of items) {
      const accion = s.nombre.split('.').pop()!;
      const posicion = RUNGO_POSICION[accion];
      if (posicion === undefined) {
        extras.push({ idServicio: s.idServicio, nombre: s.nombre, label: this.accionCorta(s.nombre) });
        continue;
      }
      if (!porPosicion.has(posicion)) porPosicion.set(posicion, []);
      porPosicion.get(posicion)!.push(s);
    }

    const pasos: PasoEscalera[] = [...porPosicion.entries()]
      .sort(([a], [b]) => a - b)
      .map(([posicion, serviciosPaso]) => {
        const override = serviciosPaso.map(s => RUNGO_LABEL_OVERRIDE[s.nombre]).find(Boolean);
        const acciones = serviciosPaso.map(s => s.nombre.split('.').pop()!);
        return { servicios: serviciosPaso, label: override ?? labelPasoGenerico(posicion, acciones) };
      });

    extras.sort((a, b) => a.label.localeCompare(b.label));
    return { recurso, label: labelRecurso(recurso), pasos, extras };
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

  /** Texto corto para el chip — el último segmento del nombre técnico, capitalizado. El label completo va en el `title`. */
  accionCorta(nombre: string): string {
    const ultimo = nombre.split('.').pop()!;
    return ultimo.charAt(0).toUpperCase() + ultimo.slice(1);
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

  /** Nivel actual de la escalera: el número de peldaños consecutivos desde el fondo cuyos servicios están TODOS activos. */
  nivelActual(r: RecursoUI): number {
    let n = 0;
    for (const paso of r.pasos) {
      if (paso.servicios.every(s => this.activo(s.idServicio))) n++;
      else break;
    }
    return n;
  }

  private static readonly PALETA_NIVEL = ['#8FBF77', '#4E9A4E', '#007832'];
  /** Color del peldaño según su índice (0-based) — más oscuro cuanto más acceso da. */
  colorNivel(indice: number): string {
    return PermisosPanelComponent.PALETA_NIVEL[Math.min(indice, PermisosPanelComponent.PALETA_NIVEL.length - 1)];
  }

  /** Clic en un peldaño de la escalera: deja exactamente los servicios de ese nivel y los de abajo activos, y el resto inactivos. */
  async elegirNivel(r: RecursoUI, nivelObjetivo: number): Promise<void> {
    const cambios: { idServicio: string; deseado: boolean }[] = [];
    r.pasos.forEach((paso, i) => {
      const deseado = i < nivelObjetivo;
      paso.servicios.forEach(s => cambios.push({ idServicio: s.idServicio, deseado }));
    });
    await this.aplicarCambios(cambios);
  }

  /** Otorga/revoca un único servicio hasta que quede en el estado `deseado` — misma lógica de rol/excepción que `toggle()`, pero sin invertir el estado actual. */
  private async aplicarServicio(servicioId: string, deseado: boolean): Promise<void> {
    if (this.activo(servicioId) === deseado) return;
    if (this.modo === 'rol') {
      const existente = this.permisoRolWide(servicioId);
      if (deseado && !existente) await this.permisosSvc.otorgar(this.rolFila.idRol, servicioId);
      if (!deseado && existente) await this.permisosSvc.revocar(existente.idPermiso);
    } else {
      const rolId = this.rolDelUsuario()?.idRol;
      if (!rolId) { this.toast.warn('Esta persona no tiene un rol reconocido'); return; }
      const existenteExc = this.permisoExcepcion(servicioId);
      if (existenteExc) await this.permisosSvc.revocar(existenteExc.idPermiso);
      await this.permisosSvc.otorgar(rolId, servicioId, this.usuarioFila.idUsuario, deseado);
    }
  }

  /** Aplica varios cambios de servicio en secuencia (evita condiciones de carrera al crear/revocar sobre el mismo rol) y recarga una sola vez al final. */
  private async aplicarCambios(cambios: { idServicio: string; deseado: boolean }[]): Promise<void> {
    this.procesandoAccionMasiva.set(true);
    try {
      for (const c of cambios) {
        await this.aplicarServicio(c.idServicio, c.deseado);
      }
      await this.recargarPermisos();
      this.toast.ok('Permisos actualizados');
    } catch (e) {
      this.toast.httpError(e, 'No se pudo actualizar el permiso');
    } finally {
      this.procesandoAccionMasiva.set(false);
    }
  }

  /** true si algún servicio de este recurso (escalera o extras) tiene una excepción personal propia. */
  tieneExcepcion(r: RecursoUI): boolean {
    const todos = [...r.pasos.flatMap(p => p.servicios), ...r.extras];
    return todos.some(s => this.esExcepcion(s.idServicio));
  }

  /** Quita TODAS las excepciones personales de este recurso de una vez (equivalente a "quitar excepción" fila por fila). */
  async quitarExcepcionRecurso(r: RecursoUI): Promise<void> {
    const todos = [...r.pasos.flatMap(p => p.servicios), ...r.extras];
    const excepciones = todos
      .map(s => this.permisoExcepcion(s.idServicio))
      .filter((p): p is Permiso => !!p);
    if (excepciones.length === 0) return;
    try {
      for (const exc of excepciones) await this.permisosSvc.revocar(exc.idPermiso);
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
