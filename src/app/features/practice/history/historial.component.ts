import {
  Component, inject, signal, computed, OnInit, ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import {
  debounceTime, Subject, switchMap, catchError, map, of, tap,
} from 'rxjs';
import { HistorialService } from '../../../core/services/historial.service';
import { PracticaService } from '../../../core/services/practica.service';
import { ExportService } from '../../../core/services/export.service';
import { ToastService } from '../../../core/services/toast.service';
import { EtapaPracticaItem, ResultadoConsulta } from '../../../shared/models/estudiante.model';
import { HistorialBuscadorComponent, etiquetaCargo, iniciales as inicialesDe } from './components/historial-buscador.component';
import { EtapaPracticaCardComponent } from './components/etapa-practica-card.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';
import { log } from '../../../core/utils/log';

type Estado = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [LoadingSkeletonComponent, CommonModule, HistorialBuscadorComponent, EtapaPracticaCardComponent],
  template: `
    <div class="p-6 max-w-4xl mx-auto">

      <div class="text-center mb-7">
        <span class="inline-flex w-12 h-12 rounded-2xl items-center justify-center mb-3"
          style="background: var(--accent-soft); color: var(--accent-text);">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l2.5 2.5M3.05 11a9 9 0 1 1 .5 4M3 4v5h5"/></svg>
        </span>
        <p class="text-[11px] font-bold uppercase tracking-[0.16em] mb-1" style="color: var(--accent-text);">Consulta académica</p>
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Historial del Aprendiz</h1>
        <p class="text-sm text-gray-500 mt-1.5 max-w-lg mx-auto">
          Busca por nombre o cédula para ver en un solo lugar sus matrículas, etapa práctica, bitácoras y observaciones.
        </p>
      </div>

      <!-- Buscador con autocomplete delegado al subcomponente -->
      <app-historial-buscador #buscador
        class="block w-full max-w-2xl mx-auto mb-8"
        [personas]="personas()"
        [cargandoPersonas]="cargandoPersonas()"
        [buscando]="estado === 'loading'"
        (inicioBusqueda)="cargarPersonasLazy()"
        (seleccionar)="seleccionarPersona($event)"
        (limpiar)="limpiar()"
      />

      <!-- Panel de resultados -->
      <div class="rounded-2xl border shadow-sm overflow-hidden" style="background: var(--surface); border-color: var(--border);">

        @if (estado === 'idle') {
          @if (recientes().length) {
            <!-- Consultados recientemente (solo se guarda el id interno en este navegador) -->
            <div class="p-5 sm:p-6">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Consultados recientemente</h2>
                <button type="button" (click)="borrarRecientes()"
                  class="text-xs font-medium text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50">Borrar</button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                @for (p of recientes(); track p.id) {
                  <button type="button" (click)="abrirReciente(p.persona)"
                    class="group flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:-translate-y-px hover:shadow-md"
                    style="border-color: var(--border);">
                    <span class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style="background: var(--accent-soft); color: var(--accent-text);">{{ p.iniciales }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-semibold text-gray-800 truncate">{{ p.nombre }}</span>
                      <span class="block text-xs text-gray-400 truncate">{{ p.cedula }}@if (p.cargo) { · {{ p.cargo }} }</span>
                    </span>
                    <svg class="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6"/></svg>
                  </button>
                }
              </div>
            </div>
          } @else if (cargandoPersonas() && idsRecientes().length) {
            <div class="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              @for (i of idsRecientes(); track i) {
                <div class="h-16 rounded-xl animate-pulse" style="background: var(--surface2);"></div>
              }
            </div>
          } @else {
            <!-- Primera vez: qué se va a encontrar -->
            <div class="p-6 sm:p-8">
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                @for (c of queVeras; track c.titulo) {
                  <div class="rounded-xl p-4 border" style="border-color: var(--border); background: var(--surface2);">
                    <span class="w-9 h-9 rounded-lg flex items-center justify-center mb-3" [style.background]="c.bg" [style.color]="c.color">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" [attr.d]="c.icono"/></svg>
                    </span>
                    <p class="text-sm font-semibold text-gray-800">{{ c.titulo }}</p>
                    <p class="text-xs text-gray-500 mt-1 leading-relaxed">{{ c.texto }}</p>
                  </div>
                }
              </div>
              <p class="mt-5 text-center text-xs text-gray-400">
                Pulsa <kbd class="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded border text-[11px] font-semibold" style="border-color: var(--border); background: var(--surface);">/</kbd>
                para empezar a buscar
              </p>
            </div>
          }
        }

        @if (estado === 'loading') {
          <div class="px-6 py-6"><app-loading-skeleton variant="detail" [rows]="4" label="Cargando historial" /></div>
        }

        @if (estado === 'error') {
          <div class="flex flex-col items-center gap-3 py-14 px-6 text-center">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0
                     2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697
                     16.126zM12 15.75h.007v.008H12v-.008z"/>
              </svg>
            </div>
            <p class="text-sm font-medium text-red-600">{{ errorMsg }}</p>
            @if (esReintentable) {
              <button type="button" (click)="reintentar()"
                class="mt-1 px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                Reintentar
              </button>
            }
          </div>
        }

        @if (estado === 'success' && resultado) {

          <!-- Datos personales -->
          <div class="h-16 sm:h-20" style="background: linear-gradient(120deg, var(--accent-soft), transparent 85%);"></div>
          <div class="px-4 sm:px-6 pb-5 -mt-8 sm:-mt-10 border-b" style="border-color: var(--border);">
            <div class="flex flex-wrap items-end gap-3 sm:gap-4 mb-5">
              <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-bold text-xl sm:text-2xl flex-shrink-0 shadow-md ring-4"
                style="background: var(--accent-brand); color: #fff; --tw-ring-color: var(--surface);">
                {{ iniciales(resultado.estudiante.nombre + ' ' + resultado.estudiante.apellido) }}
              </div>
              <div class="min-w-0 pb-1">
                <h2 class="text-lg sm:text-xl font-bold text-gray-900 truncate">
                  {{ resultado.estudiante.nombre }} {{ resultado.estudiante.apellido }}
                </h2>
                <p class="text-sm text-gray-500 truncate">{{ resultado.estudiante.programa }}</p>
              </div>
              <span class="text-xs font-medium px-3 py-1 rounded-full flex-shrink-0"
                [ngClass]="{
                  'bg-green-100 text-green-700': resultado.estudiante.estado === 'Activo',
                  'bg-gray-100 text-gray-500':   resultado.estudiante.estado === 'Inactivo',
                  'bg-blue-100 text-blue-700':   resultado.estudiante.estado === 'Graduado'
                }">
                {{ resultado.estudiante.estado }}
              </span>

              <div class="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                <button type="button" (click)="exportarPDF()" [disabled]="exportando()"
                  class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-colors disabled:opacity-60 disabled:cursor-wait">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"/>
                  </svg>
                  {{ exportando() === 'pdf' ? 'Generando...' : 'PDF' }}
                </button>
                <button type="button" (click)="exportarExcel()" [disabled]="exportando()"
                  class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 border border-green-100 hover:bg-green-100 transition-colors disabled:opacity-60 disabled:cursor-wait">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"/>
                  </svg>
                  {{ exportando() === 'excel' ? 'Generando...' : 'Excel' }}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              @for (d of datosPersonales(); track d.etiqueta) {
                <div class="flex items-start gap-2.5 min-w-0">
                  <span class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-400" style="background: var(--surface2);">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" [attr.d]="d.icono"/></svg>
                  </span>
                  <div class="min-w-0">
                    <p class="text-gray-400 text-[11px] uppercase tracking-wide font-semibold">{{ d.etiqueta }}</p>
                    <p class="text-gray-700 font-medium truncate" [title]="d.valor">{{ d.valor }}</p>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Resumen numerico -->
          <div class="p-4 sm:p-6 border-b" style="border-color: var(--border);">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              @for (e of estadisticas(); track e.etiqueta) {
                <div class="rounded-xl p-3.5 flex items-center gap-3" [style.background]="e.bg">
                  <span class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background: var(--surface);" [style.color]="e.color">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" [attr.d]="e.icono"/></svg>
                  </span>
                  <div>
                    <p class="text-xl font-bold leading-none" [style.color]="e.color">{{ e.valor }}</p>
                    <p class="text-xs text-gray-500 mt-1">{{ e.etiqueta }}</p>
                  </div>
                </div>
              }
            </div>

            <h3 class="text-sm font-semibold text-gray-700 mb-3">Matrículas</h3>
            @if (resultado.historial.length) {
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left border-b border-gray-100">
                      <th class="text-xs text-gray-400 font-medium pb-2 pr-4">Ficha</th>
                      <th class="text-xs text-gray-400 font-medium pb-2 pr-4">Programa</th>
                      <th class="text-xs text-gray-400 font-medium pb-2 pr-4">Periodo</th>
                      <th class="text-xs text-gray-400 font-medium pb-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (curso of resultado.historial; track curso.idMatricula) {
                      <tr class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td class="py-3 pr-4 text-gray-400 font-mono text-xs">
                          {{ curso.idCurso || '—' }}
                        </td>
                        <td class="py-3 pr-4 text-gray-700">{{ curso.nombreCurso }}</td>
                        <td class="py-3 pr-4 text-gray-500">{{ curso.periodo || '—' }}</td>
                        <td class="py-3 text-center">
                          <span class="text-xs font-medium px-2 py-1 rounded-full"
                            [ngClass]="{
                              'bg-green-100 text-green-700': curso.estado === 'Aprobado',
                              'bg-red-100 text-red-600':     curso.estado === 'Reprobado',
                              'bg-blue-100 text-blue-600':   curso.estado === 'En curso'
                            }">
                            {{ curso.estado }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-sm text-gray-400">Sin matrículas registradas.</p>
            }
          </div>

          <!-- Etapas practicas -->
          <div class="p-4 sm:p-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Etapa práctica</h3>

            @if (resultado.practicas.length) {
              @for (p of resultado.practicas; track p.id) {
                <app-etapa-practica-card
                  [practica]="p"
                  [docs]="docsMap()[p.id]"
                  [cargandoDocs]="cargandoDocs()"
                  [personasMap]="personasMap()"
                />
              }
            } @else {
              <p class="text-sm text-gray-400">El aprendiz no tiene etapa práctica registrada.</p>
            }
          </div>

        }
      </div>
    </div>
  `,
})
export class HistorialComponent implements OnInit {
  private svc          = inject(HistorialService);
  private practicaSvc  = inject(PracticaService);
  private exportService = inject(ExportService);
  private toast        = inject(ToastService);
  private route        = inject(ActivatedRoute);

  /** idPersona pendiente de auto-buscar (llega por ?persona=... — p.ej. desde
   *  la campana de notificaciones) hasta que la lista de personas cargue. */
  private personaIdPendiente: string | null = null;

  @ViewChild('buscador') private buscador?: HistorialBuscadorComponent;

  ngOnInit(): void {
    const personaId = this.route.snapshot.queryParamMap.get('persona');
    if (personaId) {
      this.personaIdPendiente = personaId;
      this.cargarPersonasLazy();
    } else if (this.idsRecientes().length) {
      // Para mostrar los recientes hace falta la lista (solo se guardan ids).
      this.cargarPersonasLazy();
    }
  }

  // ── Consultados recientemente ─────────────────────────────────────────────
  /** Solo ids internos (idPersona) en este navegador: ni nombres ni cédulas. */
  readonly idsRecientes = signal<string[]>(leerRecientes());

  readonly recientes = computed(() => {
    const porId = new Map(this.personas().map((p: any) => [p.idPersona ?? p.id_persona ?? p.id, p]));
    return this.idsRecientes()
      .map((id) => porId.get(id))
      .filter((p): p is any => !!p)
      .map((p: any) => {
        const nombre = [p.nombre, p.apellido].filter(Boolean).join(' ').trim() || 'Sin nombre';
        return {
          id: p.idPersona ?? p.id_persona ?? p.id,
          persona: p,
          nombre,
          iniciales: inicialesDe(nombre),
          cedula: String(p.cedula ?? p.numeroDocumento ?? ''),
          cargo: etiquetaCargo(p.cargo),
        };
      });
  });

  abrirReciente(p: any): void {
    this.buscador?.mostrarNombre([p.nombre, p.apellido].filter(Boolean).join(' ').trim());
    this.seleccionarPersona(p);
  }

  borrarRecientes(): void {
    this.idsRecientes.set([]);
    guardarRecientes([]);
  }

  private recordar(p: any): void {
    const id = p.idPersona ?? p.id_persona ?? p.id;
    if (!id) return;
    const lista = [id, ...this.idsRecientes().filter((x) => x !== id)].slice(0, MAX_RECIENTES);
    this.idsRecientes.set(lista);
    guardarRecientes(lista);
  }

  /** Tarjetas del estado inicial: qué muestra el historial. */
  readonly queVeras = [
    { titulo: 'Matrículas', texto: 'Fichas y programas en los que ha estado, con su periodo y estado.',
      icono: 'M4 19.5V6a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h12',
      bg: 'var(--info-bg)', color: 'var(--info-text)' },
    { titulo: 'Etapa práctica', texto: 'Empresa, fechas, instructores asignados y avance de la práctica.',
      icono: 'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
      bg: 'var(--ok-bg)', color: 'var(--ok-text)' },
    { titulo: 'Bitácoras y observaciones', texto: 'Cada seguimiento con sus documentos y comentarios.',
      icono: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
      bg: 'var(--violet-bg)', color: 'var(--violet-text)' },
  ];

  /** Documento, matrículas, email y teléfono del aprendiz consultado. */
  datosPersonales() {
    const e = this.resultado?.estudiante;
    if (!e) return [];
    return [
      { etiqueta: 'Documento', valor: e.documento || '—', icono: 'M3 6h18v12H3zM7 10h4M7 14h6M15 10h2' },
      { etiqueta: 'Matrículas', valor: String(this.totalCursos), icono: 'M4 19.5V6a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h12' },
      { etiqueta: 'Email', valor: e.email || '—', icono: 'M3 6h18v12H3zM3 7l9 6 9-6' },
      { etiqueta: 'Teléfono', valor: e.telefono || '—', icono: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2' },
    ];
  }

  /** Tarjetas de totales del historial. */
  estadisticas() {
    return [
      { etiqueta: 'Cursos', valor: this.totalCursos, bg: 'var(--info-bg)', color: 'var(--info-text)',
        icono: 'M4 19.5V6a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2zm0 0A2 2 0 0 0 6 22h12' },
      { etiqueta: 'Prácticas', valor: this.totalPracticas, bg: 'var(--ok-bg)', color: 'var(--ok-text)',
        icono: 'M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' },
      { etiqueta: 'Bitácoras', valor: this.totalBitacoras, bg: 'var(--accent-soft)', color: 'var(--accent-text)',
        icono: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5' },
      { etiqueta: 'Observaciones', valor: this.totalObservaciones, bg: 'var(--violet-bg)', color: 'var(--violet-text)',
        icono: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z' },
    ];
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  estado: Estado                      = 'idle';
  resultado: ResultadoConsulta | null = null;
  errorMsg       = '';
  esReintentable = false;
  private ultimoDoc = '';
  docsMap      = signal<Record<string, any[]>>({});
  cargandoDocs = signal(false);
  exportando   = signal<'pdf' | 'excel' | null>(null);

  // ── Autocomplete ──────────────────────────────────────────────────────────
  personas          = signal<any[]>([]);
  cargandoPersonas  = signal(false);
  private personasCargadas = false;

  /** UUID de persona → nombre completo, reutilizado por las tarjetas de etapa
   *  práctica para resolver los instructores asignados (sin llamadas extra). */
  personasMap = computed(() => {
    const mapa = new Map<string, string>();
    for (const p of this.personas()) {
      const id = p.idPersona ?? p.id_persona ?? p.id;
      if (!id) continue;
      const nombre = [p.nombre, p.apellido].filter(Boolean).join(' ').trim() || p.nombre || 'Sin nombre';
      mapa.set(id, nombre);
    }
    return mapa;
  });

  // ── Búsqueda historial ────────────────────────────────────────────────────
  private buscar$ = new Subject<string>();

  constructor() {
    this.buscar$.pipe(
      tap(() => { this.estado = 'loading'; this.resultado = null; }),
      debounceTime(400),
      switchMap(doc =>
        this.svc.consultar(doc).pipe(
          map(res => ({ res, err: null as any })),
          // El error se captura DESPUÉS de que el errorInterceptor y los logs
          // del servicio ya corrieron — aquí solo decidimos qué mostrar.
          catchError(err => of({ res: null as ResultadoConsulta | null, err })),
        )
      ),
      takeUntilDestroyed(),
    ).subscribe(({ res, err }) => {
      this.resultado = res;
      if (res) {
        this.estado = 'success';
        this.cargarDocumentos(res.practicas);
        return;
      }
      const noEncontrado = err?.status === 404 || err?.message === 'Persona no encontrada';
      if (noEncontrado) {
        this.errorMsg       = 'No se encontró ningún aprendiz con ese documento.';
        this.esReintentable = false;
      } else {
        this.errorMsg       = 'No se pudo cargar el historial. Verifica tu conexión e intenta de nuevo.';
        this.esReintentable = true;
        log.error('[historial] consulta falló', err?.status ?? err);
      }
      this.estado = 'error';
    });
  }

  reintentar(): void {
    if (this.ultimoDoc) this.buscar$.next(this.ultimoDoc);
  }

  // ── Handlers públicos (usados desde el buscador via outputs) ──────────────
  seleccionarPersona(p: any): void {
    const cedula = String(p.cedula ?? p.numeroDocumento ?? '');
    this.ultimoDoc = cedula;
    this.recordar(p);
    this.cargarPersonasLazy();
    this.buscar$.next(cedula);
  }

  limpiar(): void {
    this.estado   = 'idle';
    this.resultado = null;
    this.docsMap.set({});
  }

  cargarPersonasLazy(): void {
    if (this.personasCargadas) {
      this.resolverPersonaPendiente();
      return;
    }
    this.cargandoPersonas.set(true);
    this.svc.listarActivos().subscribe({
      next: (lista) => {
        this.personas.set(lista);
        this.personasCargadas = true;
        this.cargandoPersonas.set(false);
        this.resolverPersonaPendiente();
      },
      error: (err) => {
        // El autocomplete queda vacío pero avisamos y el próximo intento reintenta
        // (personasCargadas sigue en false y el servicio no cachea el fallo).
        log.error('[historial] carga de personas falló', err?.status ?? err);
        this.cargandoPersonas.set(false);
        this.toast.httpError(err, 'No se pudo cargar la lista de aprendices. Intenta de nuevo.');
      },
    });
  }

  /** Busca automáticamente el aprendiz que llegó por ?persona=... una vez la
   *  lista de personas ya está disponible (recién cargada, o ya en caché). */
  private resolverPersonaPendiente(): void {
    if (!this.personaIdPendiente) return;
    const id = this.personaIdPendiente;
    this.personaIdPendiente = null;
    const persona = this.personas().find(p => (p.idPersona ?? p.id_persona ?? p.id) === id);
    if (persona) this.seleccionarPersona(persona);
  }

  // ── Exportar ──────────────────────────────────────────────────────────────
  async exportarPDF(): Promise<void> {
    if (!this.resultado || this.exportando()) return;
    this.exportando.set('pdf');
    try {
      await this.exportService.exportarHistorialPDF(this.resultado, this.personasMap());
      this.toast.ok('PDF generado', 'El historial fue exportado correctamente.');
    } catch {
      this.toast.error('Error', 'No se pudo generar el PDF.');
    } finally {
      this.exportando.set(null);
    }
  }

  async exportarExcel(): Promise<void> {
    if (!this.resultado || this.exportando()) return;
    this.exportando.set('excel');
    try {
      await this.exportService.exportarHistorialExcel(this.resultado, this.personasMap());
      this.toast.ok('Excel generado', 'El historial fue exportado correctamente.');
    } catch {
      this.toast.error('Error', 'No se pudo generar el archivo Excel.');
    } finally {
      this.exportando.set(null);
    }
  }

  // ── Documentos ────────────────────────────────────────────────────────────
  private async cargarDocumentos(practicas: EtapaPracticaItem[]): Promise<void> {
    if (!practicas.length) return;
    this.cargandoDocs.set(true);
    try {
      // En lotes de 4 (una request por práctica): el rate limit del backend es
      // 30 req/10 s y esta carga corre justo después del fan-out de consultar().
      const pares: [string, any[]][] = [];
      for (let i = 0; i < practicas.length; i += 4) {
        const lote = practicas.slice(i, i + 4);
        pares.push(...await Promise.all(
          lote.map(async p => {
            const docs = await this.practicaSvc.listarDocumentos(p.id);
            return [p.id, docs] as [string, any[]];
          })
        ));
      }
      this.docsMap.set(Object.fromEntries(pares));
    } catch (err: any) {
      // Antes sin catch (auditoría 2026-09-16): el panel de documentos
      // quedaba vacío en silencio, sin avisar — mismo patrón que
      // cargarPersonasLazy() en este mismo componente.
      log.error('[historial] carga de documentos falló', err?.status ?? err);
      this.toast.httpError(err, 'No se pudieron cargar los documentos de las prácticas.');
    } finally {
      this.cargandoDocs.set(false);
    }
  }

  // ── Computed helpers ──────────────────────────────────────────────────────
  iniciales(nombre: string): string {
    return inicialesDe(nombre);
  }

  get totalCursos():    number { return this.resultado?.historial.length ?? 0; }
  get totalPracticas(): number { return this.resultado?.practicas.length ?? 0; }

  get totalBitacoras(): number {
    return (this.resultado?.practicas ?? []).reduce(
      (acc, p) => acc + p.seguimientos.reduce((a, s) => a + s.bitacoras.length, 0), 0,
    );
  }

  get totalObservaciones(): number {
    return (this.resultado?.practicas ?? []).reduce(
      (acc, p) => acc + p.seguimientos.reduce((a, s) => a + s.observaciones.length, 0), 0,
    );
  }
}

const CLAVE_RECIENTES = 'historial.recientes';
const MAX_RECIENTES = 6;

/** Ids de personas consultadas (por navegador). Vacío si no hay o no se puede leer. */
function leerRecientes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}

function guardarRecientes(ids: string[]): void {
  try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(ids)); } catch { /* sin almacenamiento: no se recuerdan */ }
}
