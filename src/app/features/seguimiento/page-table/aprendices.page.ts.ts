import { Component, signal, computed, OnInit, inject } from "@angular/core";

import { AprendicesToolbarComponent } from "../components/toolbar/aprendices-toolbar.component";
import { AprendicesTableComponent } from "../components/table/aprendices-table.component";
import { TablePaginationComponent } from "../components/pagination/table-pagination.component";
import { SeguimientosModalComponent } from "../components/seguimientos-modal.component";
import { ObservacionModalComponent } from "../components/observacion-modal.component";
import { CrearPracticaModalComponent } from "../components/crear-practica-modal.component";
import { PersonaService } from "../../../core/services/persona.service";

@Component({
  selector: 'app-aprendices-page',
  standalone: true,
  imports: [
    AprendicesToolbarComponent,
    AprendicesTableComponent,
    TablePaginationComponent,
    SeguimientosModalComponent,
    ObservacionModalComponent,
    CrearPracticaModalComponent
  ],
  template: `
  <div class="bg-white rounded-2xl shadow border">

    @if (cargando()) {
      <div class="flex items-center justify-center p-10 text-gray-500 gap-3">
        <svg class="animate-spin h-5 w-5 text-[#39A900]" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Cargando aprendices...
      </div>
    } @else {

      <app-aprendices-toolbar
        [filter]="filterValue()"
        [areas]="areas()"
        [selectedAreas]="selectedAreas()"
        [statusOptions]="statusOptions"
        [selectedStatuses]="selectedStatuses()"
        (filterChange)="filterValue.set($event)"
        (areasChange)="selectedAreas.set($event)"
        (statusChange)="selectedStatuses.set($event)"
      ></app-aprendices-toolbar>

      @if (filtrados().length === 0) {
        <div class="text-center text-gray-400 py-10">No se encontraron aprendices.</div>
      } @else {
        <app-aprendices-table
          [rows]="paged()"
          [columns]="headerColumns()"
          (seguimientos)="abrirSeguimientos($event)"
          (observacion)="abrirObservacion($event)"
          (crearPractica)="abrirCrearPractica($event)"
        ></app-aprendices-table>

        <app-table-pagination
          [page]="page()"
          [pages]="pages()"
          (pageChange)="page.set($event)"
        ></app-table-pagination>
      }

    }

  </div>
  `
})
export class AprendicesPage implements OnInit {

  private personaSvc = inject(PersonaService);

  // ── Estado ────────────────────────────────────────────────────────────────
  cargando = signal(false);

  /** Aprendices crudos del API (cargo === 'aprendiz') */
  private aprendices = signal<any[]>([]);

  // ── Filtros ───────────────────────────────────────────────────────────────
  filterValue    = signal('');
  selectedAreas  = signal<string[]>([]);
  selectedStatuses = signal<string[]>([]);

  areas = signal<string[]>([]);

  statusOptions = [
    { uid: 'activo',            name: 'Activo'            },
    { uid: 'inactivo',          name: 'Inactivo'          },
    { uid: 'suspendido',        name: 'Suspendido'        },
    { uid: 'condicionado',      name: 'Condicionado'      },
    { uid: 'certificado',       name: 'Certificado'       },
    { uid: 'por certificar',    name: 'Por certificar'    },
    { uid: 'cancelado',         name: 'Cancelado'         },
    { uid: 'retiro voluntario', name: 'Retiro Voluntario' },
  ];

  // ── Paginación ────────────────────────────────────────────────────────────
  page     = signal(1);
  pageSize = 10;

  // ── Columnas ──────────────────────────────────────────────────────────────
  headerColumns = signal([
    { key: 'name',   name: 'Nombre'  },
    { key: 'cedula', name: 'Cédula'  },
    { key: 'correo', name: 'Correo'  },
    { key: 'status', name: 'Estado'  },
  ]);

  // ── Datos filtrados ───────────────────────────────────────────────────────
  filtrados = computed(() => {
    const texto   = this.filterValue().toLowerCase().trim();
    const estados = this.selectedStatuses();

    return this.aprendices().filter(a => {
      const coincideTexto = !texto ||
        a.name?.toLowerCase().includes(texto) ||
        String(a.cedula ?? '').includes(texto) ||
        a.correo?.toLowerCase().includes(texto);

      const coincideEstado = !estados.length || estados.includes(a.status);

      return coincideTexto && coincideEstado;
    });
  });

  // ── Paginación ────────────────────────────────────────────────────────────
  pages = computed(() => Math.max(1, Math.ceil(this.filtrados().length / this.pageSize)));

  paged = computed(() => {
    const inicio = (this.page() - 1) * this.pageSize;
    return this.filtrados().slice(inicio, inicio + this.pageSize);
  });

  // ── Carga inicial ─────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    this.cargando.set(true);
    try {
      const personas = await this.personaSvc.listarAprendices();
      // Mapea campos del API al formato que espera la tabla
      const filas = personas.map((p: any) => ({
        id:     p.idPersona,
        name:   p.nombre   ?? '—',
        cedula: p.cedula   ?? '—',
        correo: p.correo   ?? '—',
        status: p.estado   ?? '—',
        // Guardamos el objeto completo para acciones posteriores
        _raw: p,
      }));
      this.aprendices.set(filas);
    } catch (err) {
      console.error('[AprendicesPage] Error cargando aprendices:', err);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Acciones ──────────────────────────────────────────────────────────────
  abrirSeguimientos(row: any): void {
    console.log('seguimientos', row);
  }

  abrirObservacion(row: any): void {
    console.log('observacion', row);
  }

  abrirCrearPractica(row: any): void {
    console.log('crear practica', row);
  }
}
