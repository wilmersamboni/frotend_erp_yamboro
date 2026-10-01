import { Component, OnInit, signal, computed, inject, viewChild } from '@angular/core';

import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Formato } from '../../../shared/models';
import { NotificacionService } from '../../../core/services/notificacion.service';

import { FormatoCardComponent } from './components/formato-card.component';
import { FormatoVisorComponent } from './components/formato-visor.component';
import { SubirFormatoModalComponent } from './components/subir-formato-modal.component';
import { TableFilterComponent, TableFilterOption } from '../../../shared/components/table-filter.component';
import {
  urlFormato, etiquetaTipo, tonoTipo, infoArchivo, tamanoLegible, fechaCorta, esNuevo,
} from './components/formato-utils';
import { ConfirmService } from '../../../core/services/confirm.service';
import { UnsavedChangesService, avisarCambiosSinGuardar } from '../../../core/services/unsaved-changes.service';

/** Tipos para el formulario de subida (que muestra el ícono en su selector). */
const TIPOS = [
  { value: 'bitacora',         label: 'Bitácora',        icon: '📋' },
  { value: 'acta_seguimiento', label: 'Acta seguimiento', icon: '📝' },
  { value: 'otro',             label: 'Otro',             icon: '📁' },
];

type Orden = 'recientes' | 'nombre' | 'tipo';
type Vista = 'cuadricula' | 'lista';

const CLAVE_VISTA = 'formatos.vista';

@Component({
  selector: 'app-formatos',
  standalone: true,
  imports: [FormatoCardComponent, FormatoVisorComponent, SubirFormatoModalComponent, TableFilterComponent],
  styles: [`
    @keyframes brillo { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .esqueleto {
      background: linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%);
      background-size: 200% 100%;
      animation: brillo 1.4s ease-in-out infinite;
    }
  `],
  template: `

    <section class="min-h-screen px-4 py-8 sm:py-10">
      <div class="max-w-6xl mx-auto space-y-6">

        <!-- ── Encabezado ──────────────────────────────────────────── -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <span class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style="background: var(--accent-soft); color: var(--accent-text);">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path stroke-linecap="round" stroke-linejoin="round" d="M14 3v5h5M9 13h6M9 17h4"/></svg>
            </span>
            <div>
              <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Formatos</h1>
              <p class="text-sm text-gray-500 mt-0.5">
                Plantillas oficiales de la etapa práctica ·
                <span class="font-semibold text-gray-700">{{ formatos().length }}</span>
                archivo{{ formatos().length !== 1 ? 's' : '' }}
                @if (nuevos() > 0) {
                  · <span class="font-semibold" style="color: var(--accent-text);">{{ nuevos() }} nuevo{{ nuevos() !== 1 ? 's' : '' }} esta semana</span>
                }
              </p>
            </div>
          </div>

          @if (puedeGestionar()) {
            <button type="button" (click)="alternarForm()"
              class="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 active:scale-95"
              [class.text-white]="!mostrarForm()"
              [class.shadow-sm]="!mostrarForm()"
              [class.border]="mostrarForm()"
              [class.border-gray-200]="mostrarForm()"
              [class.text-gray-600]="mostrarForm()"
              [style.background]="mostrarForm() ? 'var(--surface)' : 'var(--accent-brand)'">
              @if (mostrarForm()) {
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
                Cancelar
              } @else {
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M5 20h14"/></svg>
                Subir formato
              }
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

        <!-- ── Barra: buscador · tipo · orden · vista ──────────────── -->
        @if (loading() || formatos().length > 0) {
          <div class="rounded-2xl border p-2.5 flex flex-col lg:flex-row lg:items-center gap-2.5"
            style="background: var(--surface); border-color: var(--border);">

            <div class="relative w-full lg:max-w-xs">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m20 20-3.5-3.5"/>
              </svg>
              <input #buscador type="text" [value]="busqueda()" (input)="busqueda.set(buscador.value)"
                placeholder="Buscar formato..." aria-label="Buscar formato"
                class="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-transparent focus:outline-none focus:border-[#39A900] focus:ring-2 focus:ring-[#39A900]/15 transition-colors"
                style="background: var(--surface2);" />
              @if (busqueda()) {
                <button type="button" aria-label="Limpiar búsqueda" (click)="busqueda.set('')"
                  class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
                </button>
              }
            </div>

            <div role="tablist" aria-label="Filtrar por tipo" class="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:mx-auto">
              @for (opc of opcionesFiltro(); track opc.value) {
                <button type="button" role="tab" [attr.aria-selected]="filtroTipo() === opc.value"
                  (click)="filtroTipo.set(opc.value)"
                  class="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                  [class.text-gray-500]="filtroTipo() !== opc.value"
                  [class.hover:bg-gray-50]="filtroTipo() !== opc.value"
                  [style.background]="filtroTipo() === opc.value ? 'var(--accent-soft)' : null"
                  [style.color]="filtroTipo() === opc.value ? 'var(--accent-text)' : null">
                  @if (opc.value) {
                    <span class="w-2 h-2 rounded-full" [style.background]="tono(opc.value).text"></span>
                  }
                  {{ opc.label }}
                  <span class="min-w-[20px] px-1.5 py-px rounded-md text-[10px] font-bold text-center"
                    [style.background]="filtroTipo() === opc.value ? 'var(--surface)' : 'var(--surface2)'">{{ opc.total }}</span>
                </button>
              }
            </div>

            <div class="flex items-center gap-2 lg:ml-0">
              <!-- Mismo selector que los filtros de Materiales (menú propio, colores del tema), no el <select> nativo. -->
              <app-table-filter class="flex-1 lg:flex-none" label="Orden" [options]="opcionesOrden"
                [value]="orden()" (valueChange)="orden.set($any($event))" />

              <div class="inline-flex p-0.5 rounded-xl" style="background: var(--surface2);" role="group" aria-label="Vista">
                <button type="button" (click)="cambiarVista('cuadricula')" [attr.aria-pressed]="vista() === 'cuadricula'" title="Cuadrícula"
                  class="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors"
                  [class.text-gray-400]="vista() !== 'cuadricula'"
                  [class.shadow-sm]="vista() === 'cuadricula'"
                  [style.background]="vista() === 'cuadricula' ? 'var(--surface)' : null"
                  [style.color]="vista() === 'cuadricula' ? 'var(--accent-text)' : null">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>
                </button>
                <button type="button" (click)="cambiarVista('lista')" [attr.aria-pressed]="vista() === 'lista'" title="Lista"
                  class="w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors"
                  [class.text-gray-400]="vista() !== 'lista'"
                  [class.shadow-sm]="vista() === 'lista'"
                  [style.background]="vista() === 'lista' ? 'var(--surface)' : null"
                  [style.color]="vista() === 'lista' ? 'var(--accent-text)' : null">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>
                </button>
              </div>
            </div>
          </div>
        }

        <!-- ── Cargando: esqueletos con la forma del resultado ─────── -->
        @if (loading()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" aria-busy="true" aria-label="Cargando formatos">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="rounded-2xl border overflow-hidden" style="background: var(--surface); border-color: var(--border);">
                <div class="esqueleto h-32"></div>
                <div class="p-4 space-y-2.5">
                  <div class="esqueleto h-2.5 w-16 rounded"></div>
                  <div class="esqueleto h-3.5 w-4/5 rounded"></div>
                  <div class="esqueleto h-2.5 w-1/2 rounded"></div>
                  <div class="esqueleto h-8 w-full rounded-xl mt-4"></div>
                </div>
              </div>
            }
          </div>
        }

        <!-- ── Vacío ───────────────────────────────────────────────── -->
        @if (!loading() && visibles().length === 0) {
          <div class="rounded-2xl border border-dashed py-16 px-6 flex flex-col items-center text-center"
            style="border-color: var(--border-strong);">
            <span class="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style="background: var(--surface2);">
              <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            </span>
            @if (formatos().length > 0) {
              <p class="font-semibold text-gray-700">Ningún formato coincide con la búsqueda</p>
              <p class="text-sm text-gray-400 mt-1">Prueba con otro nombre o cambia el tipo.</p>
              <button type="button" (click)="busqueda.set(''); filtroTipo.set('')"
                class="mt-4 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50" style="color: var(--accent-text);">
                Ver todos los formatos
              </button>
            } @else {
              <p class="font-semibold text-gray-700">Todavía no hay formatos</p>
              <p class="text-sm text-gray-400 mt-1">
                {{ puedeGestionar() ? 'Sube la primera plantilla con "Subir formato".' : 'Cuando el administrador suba plantillas, aparecerán aquí.' }}
              </p>
            }
          </div>
        }

        <!-- ── Cuadrícula ──────────────────────────────────────────── -->
        @if (!loading() && visibles().length > 0 && vista() === 'cuadricula') {
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            @for (f of visibles(); track f.id; let i = $index) {
              <app-formato-card
                [style.--retraso]="(i < 12 ? i * 40 : 0) + 'ms'"
                [formato]="f"
                [esAdmin]="puedeGestionar()"
                (ver)="abierto.set($event)"
                (eliminar)="handleEliminar($event)"
              />
            }
          </div>
        }

        <!-- ── Lista ───────────────────────────────────────────────── -->
        @if (!loading() && visibles().length > 0 && vista() === 'lista') {
          <div class="rounded-2xl border overflow-hidden divide-y" style="background: var(--surface); border-color: var(--border);">
            @for (f of visibles(); track f.id) {
              <div class="group flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors" style="border-color: var(--border);">
                <span class="w-10 h-11 rounded-lg flex items-center justify-center text-[9px] font-extrabold tracking-wider flex-shrink-0"
                  [style.background]="info(f).tono.bg" [style.color]="info(f).tono.text">{{ info(f).ext }}</span>

                <button type="button" (click)="abierto.set(f)" class="min-w-0 flex-1 text-left">
                  <span class="flex items-center gap-2">
                    <span class="font-semibold text-sm text-gray-800 truncate group-hover:underline decoration-gray-300 underline-offset-2">{{ f.nombre }}</span>
                    @if (nuevo(f)) {
                      <span class="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white" style="background: var(--accent-brand);">Nuevo</span>
                    }
                  </span>
                  <span class="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                    <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" [style.background]="tono(f.tipo).text"></span>
                    <span class="font-medium" [style.color]="tono(f.tipo).text">{{ etiqueta(f.tipo) }}</span>
                    <span class="truncate">{{ f.nombre_original }}</span>
                  </span>
                </button>

                <span class="hidden md:block w-20 text-right text-xs text-gray-400 tabular-nums">{{ tamano(f.tamanio) ?? '—' }}</span>
                <span class="hidden sm:block w-24 text-right text-xs text-gray-400">{{ fecha(f.created_at) ?? '—' }}</span>

                <div class="flex items-center gap-1">
                  <button type="button" (click)="abierto.set(f)" title="Vista previa" aria-label="Vista previa"
                    class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <a [href]="url(f)" [download]="f.nombre_original" title="Descargar" aria-label="Descargar"
                    class="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100" style="color: var(--accent-text);">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>
                  </a>
                  @if (puedeGestionar()) {
                    <button type="button" (click)="handleEliminar(f.id)" title="Eliminar" aria-label="Eliminar formato"
                      class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }

      </div>
    </section>

    <app-formato-visor [lista]="visibles()" [formato]="abierto()" (cerrar)="abierto.set(null)" />
  `,
})
export class FormatosComponent implements OnInit {
  private auth            = inject(AuthService);
  private api             = inject(ApiService);
  private toast           = inject(ToastService);
  private confirm         = inject(ConfirmService);
  private notificacionSvc = inject(NotificacionService);
  private avisos          = inject(UnsavedChangesService);

  readonly tipos = TIPOS;

  formatos    = signal<Formato[]>([]);
  loading     = signal(false);
  mostrarForm = signal(false);
  /** El formulario "Nuevo formato" (no es un modal: vive dentro de la página). */
  private formulario = viewChild(SubirFormatoModalComponent);
  private readonly _aviso = avisarCambiosSinGuardar(() => this.mostrarForm() && !!this.formulario()?.haySinGuardar);

  /** "Subir formato" / "Cancelar": al cancelar con datos escritos, pregunta antes de descartarlos. */
  async alternarForm(): Promise<void> {
    if (this.mostrarForm() && this.formulario()?.haySinGuardar && !(await this.avisos.confirmarDescartar())) return;
    this.mostrarForm.set(!this.mostrarForm());
  }

  filtroTipo = signal('');
  busqueda   = signal('');
  orden      = signal<Orden>('recientes');
  readonly opcionesOrden: TableFilterOption[] = [
    { value: 'recientes', label: 'Más recientes' },
    { value: 'nombre',    label: 'Nombre (A-Z)' },
    { value: 'tipo',      label: 'Tipo' },
  ];
  vista      = signal<Vista>(leerVista());
  /** Formato abierto en el visor (null = cerrado). */
  abierto    = signal<Formato | null>(null);

  // Presentación compartida con la tarjeta y el visor (formato-utils.ts).
  readonly url = urlFormato;
  readonly etiqueta = etiquetaTipo;
  readonly tono = tonoTipo;
  readonly info = infoArchivo;
  readonly tamano = tamanoLegible;
  readonly fecha = fechaCorta;
  readonly nuevo = (f: Formato) => esNuevo(f.created_at);

  /**
   * Gateado por servicio (`practica.formatos.gestionar`), no por cargo —
   * antes `esAdmin()` (cargo puro) ocultaba "Subir formato" a cualquiera
   * que no fuera admin sin importar el permiso otorgado. `.gestionar` cubre
   * subir/editar/eliminar — ya no existe `.administrar` como nivel aparte
   * solo para borrar (ver migrate-formatos-permisos.ts).
   */
  puedeGestionar = computed(() => this.auth.tieneServicio('practica.formatos.gestionar'));

  nuevos = computed(() => this.formatos().filter((f) => esNuevo(f.created_at)).length);

  /** "Todos" + cada tipo, con cuántos formatos hay de cada uno. */
  opcionesFiltro = computed(() => {
    const todos = this.formatos();
    return [
      { value: '', label: 'Todos', total: todos.length },
      ...TIPOS.map((t) => ({ value: t.value, label: t.label, total: todos.filter((f) => f.tipo === t.value).length })),
    ];
  });

  /** Filtrados por tipo y búsqueda, en el orden elegido. El visor recorre esta misma lista. */
  visibles = computed(() => {
    const tipo = this.filtroTipo();
    const q = normalizar(this.busqueda().trim());
    const lista = this.formatos().filter((f) =>
      (!tipo || f.tipo === tipo) &&
      (!q || normalizar(`${f.nombre} ${f.nombre_original ?? ''}`).includes(q)));
    const porNombre = (a: Formato, b: Formato) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    switch (this.orden()) {
      case 'nombre': return lista.sort(porNombre);
      case 'tipo': return lista.sort((a, b) => etiquetaTipo(a.tipo).localeCompare(etiquetaTipo(b.tipo), 'es') || porNombre(a, b));
      default: return lista.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    }
  });

  cambiarVista(v: Vista): void {
    this.vista.set(v);
    try { localStorage.setItem(CLAVE_VISTA, v); } catch { /* sin almacenamiento: solo dura esta visita */ }
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
    if (!this.puedeGestionar()) return;

    // Guarda el nombre del formato antes de eliminar
    const formato = this.formatos().find(f => f.id === id);
    const nombre  = formato?.nombre ?? 'Formato';

    this.confirm.confirm({
      message: `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.api.eliminarFormato(id);
          if (this.abierto()?.id === id) this.abierto.set(null);
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

/** Vista recordada (por navegador); cuadrícula si no hay o no se puede leer. */
function leerVista(): Vista {
  try { return localStorage.getItem(CLAVE_VISTA) === 'lista' ? 'lista' : 'cuadricula'; } catch { return 'cuadricula'; }
}

/** Minúsculas y sin tildes, para que "bitacora" encuentre "Bitácora". */
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
