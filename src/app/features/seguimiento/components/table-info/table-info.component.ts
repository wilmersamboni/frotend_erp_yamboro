// ─────────────────────────────────────────────────────────────────────────────
// table-info.component.ts  — Orquestador (datos + estado + coordinación)
// ─────────────────────────────────────────────────────────────────────────────
import { Component, OnInit, signal, computed } from '@angular/core';
import { ApiService } from '../../../../core/services/api.service';
import { AuthService } from '../../../../core/services/auth.service';

import { SeguimientosModalComponent }  from '../seguimientos-modal.component';
import { ObservacionModalComponent }   from '../observacion-modal.component';
import { CrearPracticaModalComponent } from '../crear-practica-modal.component';
import { GestionarAsignacionesModalComponent } from '../../modals/gestionar-asignaciones-modal.component';
import { TableToolbarComponent }       from './table-toolbar.component';
import { TableHeaderComponent }        from './table-header.component';
import { TableBodyComponent }          from './table-body.component';
import { TablePaginationComponent }    from './table-pagination.component';

import {
  Aprendiz, COLUMNS, INITIAL_VISIBLE_COLS, formatDate,
} from './table-info.types';

@Component({
  selector: 'app-table-info',
  standalone: true,
  imports: [
    SeguimientosModalComponent,
    ObservacionModalComponent,
    CrearPracticaModalComponent,
    GestionarAsignacionesModalComponent,
    TableToolbarComponent,
    TableHeaderComponent,
    TableBodyComponent,
    TablePaginationComponent,
  ],
  template: `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100">

      <!-- Título -->
      <div class="flex items-center justify-between px-6 pt-6 pb-2">
        <h2 class="text-xl font-semibold text-gray-800">Aprendices</h2>
      </div>

      <!-- Toolbar: búsqueda · columnas · filas por página -->
      <app-table-toolbar
        [filter]="filterValue()"
        [total]="filtered().length"
        [rowsPerPage]="rowsPerPage()"
        [visibleCols]="visibleCols()"
        (filterChange)="filterValue.set($event); resetPage()"
        (rowsPerPageChange)="rowsPerPage.set($event); resetPage()"
        (toggleCol)="toggleCol($event)"
      />

      <!-- Tabla -->
      <div class="overflow-x-auto min-h-[260px]" style="scrollbar-width:none">
        @if (loading()) {
          <div class="flex justify-center py-12">
            <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
          </div>
        } @else {
          <table class="w-full text-sm border-collapse">

            <app-table-header
              [columns]="headerColumns()"
              [areas]="areas()"
              [selectedAreas]="selectedAreas()"
              [selectedStatuses]="selectedStatuses()"
              [sortCol]="sortCol"
              [sortDir]="sortDir"
              (sortChange)="sort($event)"
              (toggleArea)="toggleArea($event)"
              (clearAreas)="selectedAreas.set([]); resetPage()"
              (toggleStatus)="toggleStatus($event)"
              (clearStatuses)="selectedStatuses.set([]); resetPage()"
            />

            <app-table-body
              [rows]="paged()"
              [columns]="headerColumns()"
              (verSeguimientos)="abrirSeguimientos($event)"
              (verObservacion)="abrirObservacion($event)"
              (crearPractica)="abrirCrearPractica($event)"
              (editarPractica)="abrirEditarPractica($event)"
              (cambiarEstado)="onCambiarEstado($event)"
              (gestionarAsignaciones)="abrirGestionarAsignaciones($event)"
            />

          </table>
        }
      </div>

      <!-- Paginación -->
      <app-table-pagination
        [page]="page()"
        [pages]="pages()"
        (pageChange)="page.set($event)"
      />

    </div>

    <!-- ── Modales ────────────────────────────────────────────────────────── -->
    <app-seguimientos-modal
      [isOpen]="modalSeguimientos"
      [alumno]="alumnoSeleccionado"
      (closed)="modalSeguimientos = false"
      (reopened)="modalSeguimientos = true"
      (avanceActualizado)="onAvanceActualizado($event)"
    />
    <app-observacion-modal
      [isOpen]="modalObservacion"
      [alumno]="alumnoObservacion"
      (closed)="modalObservacion = false"
      (success)="cargar()"
    />
    <app-crear-practica-modal
      [isOpen]="modalCrearPractica"
      [aprendices]="data()"
      [alumnoPreseleccionado]="alumnoParaPractica"
      (closed)="modalCrearPractica = false; alumnoParaPractica = null"
      (success)="cargar()"
    />
    <app-crear-practica-modal
      [isOpen]="modalEditarPractica"
      [practicaId]="practicaIdParaEditar"
      [alumnoPreseleccionado]="alumnoParaEditar"
      (closed)="modalEditarPractica = false; alumnoParaEditar = null"
      (success)="cargar()"
    />
    <app-gestionar-asignaciones-modal
      [isOpen]="modalAsignaciones"
      [alumno]="alumnoParaAsignaciones"
      (closed)="modalAsignaciones = false; alumnoParaAsignaciones = null"
    />
  `,
})
export class TableInfoComponent implements OnInit {

  // ── Estado ─────────────────────────────────────────────────────────────────
  data      = signal<Aprendiz[]>([]);
  loading   = signal(true);
  areas     = signal<string[]>([]);

  filterValue      = signal('');
  selectedAreas    = signal<string[]>([]);
  selectedStatuses = signal<string[]>([]);
  rowsPerPage      = signal(5);
  page             = signal(1);

  sortCol  = 'name';
  sortDir: 'asc' | 'desc' = 'asc';
  visibleCols = signal(new Set(INITIAL_VISIBLE_COLS));

  // ── Modales ────────────────────────────────────────────────────────────────
  modalSeguimientos    = false;
  modalObservacion     = false;
  modalCrearPractica   = false;
  modalEditarPractica  = false;
  modalAsignaciones    = false;
  alumnoSeleccionado:       Aprendiz | null = null;
  alumnoObservacion:        Aprendiz | null = null;
  alumnoParaPractica:       Aprendiz | null = null;
  alumnoParaEditar:         Aprendiz | null = null;
  alumnoParaAsignaciones:   Aprendiz | null = null;

  // ── Computed ───────────────────────────────────────────────────────────────
  filtered = computed(() => {
    let rows = this.data();
    const filter   = this.filterValue();
    const areas    = this.selectedAreas();
    const statuses = this.selectedStatuses();

    if (filter) {
      const q = filter.toLowerCase().trim();
      const tokens= q.split(/\s+/);
      rows = rows.filter(r => {
      const nombreCompleto = [
        r.name,
        (r as any).apellido,   // ajusta el nombre del campo si aplica
        (r as any).lastName,   // idem
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const coincideNombre = tokens.every(t => nombreCompleto.includes(t));
      const coincideOtros =
        String(r.age    ?? '').includes(filter) ||
        String(r.number ?? '').includes(filter);

      return coincideNombre || coincideOtros;
    });
  }
    if (statuses.length > 0) rows = rows.filter(r => statuses.includes(r.estado));
    if (areas.length    > 0) rows = rows.filter(r => areas.includes(r.area));

    return rows;
  });

  pages = computed(() =>
    Math.ceil(this.filtered().length / this.rowsPerPage())
  );

  paged = computed(() => {
    const start = (this.page() - 1) * this.rowsPerPage();
    return [...this.filtered()].sort((a, b) => {
      const fa = a[this.sortCol as keyof Aprendiz];
      const fb = b[this.sortCol as keyof Aprendiz];
      const cmp = fa < fb ? -1 : fa > fb ? 1 : 0;
      return this.sortDir === 'desc' ? -cmp : cmp;
    }).slice(start, start + this.rowsPerPage());
  });

  headerColumns = computed(() =>
    COLUMNS.filter(c => c.uid === 'actions' || this.visibleCols().has(c.uid))
  );

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  constructor(private api: ApiService, private auth: AuthService) {}
  ngOnInit(): void {
    this.cargar();
  }

  // ── Carga de datos ─────────────────────────────────────────────────────────
  async cargar(): Promise<void> {
    this.loading.set(true);
    try {
      const [base, areasData] = await Promise.all([
        this.api.listarAprendicesConPractica(),
        this.api.listarAreas(),
      ]);

      const transformados: Aprendiz[] = base.map((a: any) => ({
        ...a,
        startDate: formatDate(a.fecha_inicio ?? a.fechaInicio ?? ''),
        endDate:   formatDate(a.fecha_fin    ?? a.fechaFin    ?? ''),
      }));

      // ── Filtro por rol ──────────────────────────────────────────────────────
      // El backend ReBAC (api2) ya devuelve solo las prácticas autorizadas:
      //   aprendiz  → solo la suya propia
      //   instructor → solo las de sus aprendices asignados
      //   admin      → todas
      // Aprovechamos ese filtrado: si el cargo no es admin, mostramos
      // únicamente las personas que tienen una práctica en la respuesta del backend.
      const cargo = this.auth.cargo();
      const vistaFiltrada = (cargo === 'aprendiz' || cargo === 'instructor')
        ? transformados.filter(a => a.id_practica !== null)
        : transformados;

      this.data.set(vistaFiltrada);
      this.areas.set(areasData.map((a: any) => a.nombre));

    } catch (e: any) {
      console.error('[TableInfo] Error:', e?.message ?? e);
      this.data.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Acciones de tabla ──────────────────────────────────────────────────────
  sort(col: string): void {
    this.sortDir = this.sortCol === col
      ? (this.sortDir === 'asc' ? 'desc' : 'asc')
      : 'asc';
    this.sortCol = col;
  }

  resetPage(): void { this.page.set(1); }

  toggleCol(uid: string): void {
    this.visibleCols.update(s => {
      const next = new Set(s);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  }

  toggleArea(area: string): void {
    const cur = this.selectedAreas();
    this.selectedAreas.set(cur.includes(area) ? cur.filter(a => a !== area) : [...cur, area]);
    this.resetPage();
  }

  toggleStatus(uid: string): void {
    const cur = this.selectedStatuses();
    this.selectedStatuses.set(cur.includes(uid) ? cur.filter(s => s !== uid) : [...cur, uid]);
    this.resetPage();
  }

  // ── Modales ────────────────────────────────────────────────────────────────
  abrirSeguimientos(item: Aprendiz):       void { this.alumnoSeleccionado     = item; this.modalSeguimientos   = true; }
  abrirObservacion(item: Aprendiz):        void { this.alumnoObservacion      = item; this.modalObservacion    = true; }
  abrirCrearPractica(item: Aprendiz):      void { this.alumnoParaPractica     = item; this.modalCrearPractica  = true; }
  /** Getter para pasar el practicaId como string al modal unificado */
  get practicaIdParaEditar(): string | null {
    const id = this.alumnoParaEditar?.id_practica;
    return id != null ? String(id) : null;
  }

  abrirEditarPractica(item: Aprendiz):     void { this.alumnoParaEditar       = item; this.modalEditarPractica = true; }
  abrirGestionarAsignaciones(item: Aprendiz): void { this.alumnoParaAsignaciones = item; this.modalAsignaciones   = true; }

  async onCambiarEstado(event: { item: Aprendiz; estado: string }): Promise<void> {
    const { item, estado } = event;
    if (!item.id_practica) return;

    // Actualización optimista: refleja el cambio en la UI de inmediato
    const estadoAnterior = item.estado;
    this.data.update(lista =>
      lista.map(a => a.id === item.id ? { ...a, estado } : a)
    );

    try {
      await this.api.cambiarEstadoPractica(String(item.id_practica), estado);
    } catch (e: any) {
      // Revertir si la API falla
      this.data.update(lista =>
        lista.map(a => a.id === item.id ? { ...a, estado: estadoAnterior } : a)
      );
      console.error('[TableInfo] Error cambiando estado:', e?.message ?? e);
    }
  }

  onAvanceActualizado(event: { id: any; avance: number }): void {
    this.data.update(lista =>
      lista.map(item => item.id === event.id ? { ...item, avance: event.avance } : item)
    );
  }

}
