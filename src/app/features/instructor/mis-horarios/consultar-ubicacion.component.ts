import { Component, EventEmitter, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { to12h, jornadaLabel } from '../../../core/utils/horarios.util';

/**
 * Panel "Consultar Ubicación" — extraído de instructor-mis-horarios.component.ts.
 * Lo abre el instructor (transversal, o regular resolviendo un conflicto) desde un
 * horario puntual; al elegir un ambiente/ubicación emite `elegir` para que el padre
 * la guarde como selección de ese horario.
 */
@Component({
  selector: 'app-consultar-ubicacion',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, SearchableSelectComponent],
  template: `
    @if (consultandoId() && consultandoH()) {
    @let ch = consultandoH();
    <div class="amb-section mt-4" id="amb-section">

      <div class="amb-section-head">
        <div class="amb-section-title">
          <lucide-icon name="building-2" [size]="17"></lucide-icon>
          <div>
            <span class="amb-section-main">Seleccionar Ubicación</span>
            <span class="amb-section-sub">
              {{ to12h(ch?.horaInicio) }} — {{ to12h(ch?.horaFin) }}
              · {{ jornadaLabel(ch?.jornada) }}
              · {{ ch?.ficha?.codigo }}
            </span>
          </div>
        </div>
        <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg text-xs px-2.5 py-1 transition-all" style="display:flex;align-items:center;gap:5px;" (click)="cerrarPanel()">
          <lucide-icon name="x" [size]="13"></lucide-icon> Cerrar
        </button>
      </div>

      <div class="ubicacion-tabs mt-3">
        <button [class]="'ubi-tab' + (tipoUbicacion() === 'ambientes' ? ' ubi-tab-active' : '')"
                (click)="cambiarTipoUbicacion('ambientes', ch)">
          <lucide-icon name="building-2" [size]="13"></lucide-icon> Ambientes
        </button>
        @for (t of UBICACION_TIPOS; track t.tipo) {
          <button [class]="'ubi-tab' + (tipoUbicacion() === t.tipo ? ' ubi-tab-active' : '')"
                  (click)="cambiarTipoUbicacion(t.tipo, ch)">
            <lucide-icon [name]="t.icon" [size]="13"></lucide-icon> {{ t.label }}
          </button>
        }
      </div>

      <div class="amb-filters mt-3">
        <div class="amb-search-wrap">
          <lucide-icon name="search" [size]="13" class="amb-search-icon"></lucide-icon>
          <input class="amb-search-input"
                 [ngModel]="busquedaAmb()"
                 (ngModelChange)="busquedaAmb.set($event)"
                 placeholder="Buscar ambiente...">
        </div>
        <div style="min-width:160px;">
          <app-ss [options]="areasOpts()"
                  placeholder="Todas las áreas"
                  [ngModel]="areaFiltro()"
                  (ngModelChange)="areaFiltro.set($event)"></app-ss>
        </div>
      </div>

      @if (cargandoAmbs()) {
        <div class="amb-loading-center mt-4">
          <lucide-icon name="loader" [size]="20" style="opacity:.5;"></lucide-icon>
          <span>Cargando...</span>
        </div>

      } @else if (tipoUbicacion() === 'ambientes') {
        @let libres     = ambsFiltradosLibres();
        @let conflictos = ambsFiltradosConflicto();

        @if (libres.length) {
          <div class="amb-group mt-3">
            <div class="amb-group-header amb-group-libre">
              <lucide-icon name="check-circle" [size]="13"></lucide-icon>
              Disponibles — {{ libres.length }}
            </div>
            <div class="amb-cards-grid">
              @for (amb of libres; track amb.id) {
                <button class="amb-card amb-card-libre" (click)="seleccionarAmbiente(amb)">
                  <div class="amb-card-top-row">
                    <span class="amb-card-nombre">{{ amb.nombre }}</span>
                    @if (amb.area_nombre) { <span class="amb-area-tag">{{ amb.area_nombre }}</span> }
                  </div>
                  <span class="amb-card-libre-hint">
                    <lucide-icon name="check-circle" [size]="10"></lucide-icon> Sin conflictos
                  </span>
                </button>
              }
            </div>
          </div>
        }

        @if (conflictos.length) {
          <div class="amb-group mt-4">
            <div class="amb-group-header amb-group-conflicto">
              <lucide-icon name="alert-triangle" [size]="13"></lucide-icon>
              Con horario sin iniciar — usar con precaución ({{ conflictos.length }})
            </div>
            <div class="amb-cards-grid">
              @for (amb of conflictos; track amb.id) {
                <div class="amb-card amb-card-conflicto">
                  <div class="amb-card-top-row">
                    <span class="amb-card-nombre">{{ amb.nombre }}</span>
                    @if (amb.area_nombre) { <span class="amb-area-tag amb-area-tag-amber">{{ amb.area_nombre }}</span> }
                  </div>
                  <div class="amb-cc-details">
                    <div class="amb-cc-row">
                      <lucide-icon name="clock" [size]="10"></lucide-icon>
                      {{ to12h(amb.horario?.horaInicio) }} — {{ to12h(amb.horario?.horaFin) }}
                      @if (amb.horario?.minutosRetraso > 0) {
                        <span class="amb-retraso-tag">{{ amb.horario.minutosRetraso }} min retraso</span>
                      }
                    </div>
                    @if (amb.horario?.instructor) {
                      <div class="amb-cc-row"><lucide-icon name="user" [size]="10"></lucide-icon> {{ amb.horario.instructor }}</div>
                    }
                    @if (amb.horario?.ficha) {
                      <div class="amb-cc-row"><lucide-icon name="graduation-cap" [size]="10"></lucide-icon> {{ amb.horario.ficha }}</div>
                    }
                  </div>
                  <button class="amb-cc-select-btn" (click)="seleccionarAmbiente(amb)">
                    <lucide-icon name="alert-triangle" [size]="11"></lucide-icon> Usar de todas formas
                  </button>
                </div>
              }
            </div>
          </div>
        }
        @if (!libres.length && !conflictos.length) {
          <p class="amb-loading-center mt-4">No hay ambientes que coincidan con el filtro.</p>
        }

      } @else {
        @let ubicLibres   = ubicFiltradosLibres();
        @let ubicOcupados = ubicFiltradosOcupados();

        @if (ubicLibres.length) {
          <div class="amb-group mt-3">
            <div class="amb-group-header amb-group-libre">
              <lucide-icon name="check-circle" [size]="13"></lucide-icon>
              Disponibles — {{ ubicLibres.length }}
            </div>
            <div class="amb-cards-grid">
              @for (u of ubicLibres; track u.id) {
                <button class="amb-card amb-card-libre" (click)="seleccionarUbicacion(u)">
                  <div class="amb-card-top-row">
                    <span class="amb-card-nombre">{{ u.nombre }}</span>
                    @if (u.area_nombre) { <span class="amb-area-tag">{{ u.area_nombre }}</span> }
                  </div>
                  @if (u.capacidad) {
                    <span class="amb-card-libre-hint">
                      <lucide-icon name="users" [size]="10"></lucide-icon> Cap. {{ u.capacidad }}
                    </span>
                  }
                  <span class="amb-card-libre-hint">
                    <lucide-icon name="check-circle" [size]="10"></lucide-icon> Sin eventos
                  </span>
                </button>
              }
            </div>
          </div>
        }

        @if (ubicOcupados.length) {
          <div class="amb-group mt-4">
            <div class="amb-group-header" style="color:#dc2626;">
              <lucide-icon name="calendar-x" [size]="13"></lucide-icon>
              Ocupadas por evento ({{ ubicOcupados.length }})
            </div>
            <div class="amb-cards-grid">
              @for (u of ubicOcupados; track u.id) {
                <div class="amb-card amb-card-ocupado">
                  <div class="amb-card-top-row">
                    <span class="amb-card-nombre">{{ u.nombre }}</span>
                    @if (u.area_nombre) { <span class="amb-area-tag amb-area-tag-red">{{ u.area_nombre }}</span> }
                  </div>
                  <div class="amb-cc-details">
                    <div class="amb-cc-row" style="font-weight:700;">
                      <lucide-icon name="calendar-x" [size]="10"></lucide-icon>
                      {{ u.evento?.nombre }}
                    </div>
                    @if (u.evento?.horaInicio) {
                      <div class="amb-cc-row">
                        <lucide-icon name="clock" [size]="10"></lucide-icon>
                        {{ to12h(u.evento.horaInicio) }} — {{ to12h(u.evento.horaFin) }}
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }

        @if (!ubicLibres.length && !ubicOcupados.length) {
          <p class="amb-loading-center mt-4">No hay ubicaciones de este tipo registradas o que coincidan con el filtro.</p>
        }
      }
    </div>
    }
  `,
  styles: [`
    .amb-section {
      background: var(--surface); border: 1.5px solid var(--border);
      border-radius: 12px; padding: 20px 24px;
      animation: fadeIn .2s ease;
    }
    .amb-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .amb-section-title { display: flex; align-items: center; gap: 10px; color: var(--text); }
    .amb-section-main { font-size: 15px; font-weight: 800; display: block; }
    .amb-section-sub  { font-size: 12px; color: var(--text-muted); display: block; margin-top: 2px; }

    .amb-filters { display: flex; gap: 10px; flex-wrap: wrap; }
    .amb-search-wrap { position: relative; flex: 1; min-width: 160px; }
    .amb-search-icon {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      color: var(--text-muted); pointer-events: none;
    }
    .amb-search-input {
      width: 100%; padding: 8px 10px 8px 32px; border: 1px solid var(--border);
      border-radius: 8px; font-size: 13px; background: var(--surface2);
      color: var(--text); outline: none; transition: border-color .15s;
      box-sizing: border-box;
    }
    .amb-search-input:focus { border-color: #39A900; }

    .amb-group-header {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em;
      margin-bottom: 10px;
    }
    .amb-group-libre    { color: #166534; }
    .amb-group-conflicto { color: #b45309; }

    .amb-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }

    .amb-card {
      border-radius: 10px; padding: 12px 14px; border: 1.5px solid;
      display: flex; flex-direction: column; gap: 6px;
      text-align: left; transition: box-shadow .15s, transform .1s;
      cursor: pointer;
    }
    .amb-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.1); }
    .amb-card-top-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
    .amb-card-nombre { font-size: 13px; font-weight: 700; }

    .amb-card-libre { background: #f0fdf4; border-color: #86efac; color: #166534; }
    .amb-card-libre:hover { background: #dcfce7; border-color: #4ade80; }
    .amb-card-libre-hint { font-size: 10px; opacity: .75; display:flex; align-items:center; gap:3px; }

    .amb-card-conflicto { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    .amb-card-ocupado { background: #fef2f2; border-color: #fca5a5; color: #991b1b; opacity: .85; cursor: not-allowed; }
    .amb-area-tag-red { background: #fee2e2; color: #991b1b; }

    .amb-cc-details { display: flex; flex-direction: column; gap: 4px; }
    .amb-cc-row { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 500; }
    .amb-retraso-tag {
      background: #fee2e2; color: #991b1b; border-radius: 6px;
      padding: 1px 5px; font-size: 10px; font-weight: 700; margin-left: 4px;
    }
    .amb-cc-select-btn {
      margin-top: 4px; display: flex; align-items: center; gap: 5px; justify-content: center;
      background: #fef3c7; border: 1px solid #fcd34d; border-radius: 7px;
      padding: 5px 10px; font-size: 11px; font-weight: 700; color: #92400e;
      cursor: pointer; transition: background .15s;
    }
    .amb-cc-select-btn:hover { background: #f59e0b; color: #fff; border-color: #f59e0b; }

    .amb-area-tag {
      background: #e0f2fe; color: #0369a1; border-radius: 6px;
      padding: 2px 6px; font-size: 10px; font-weight: 700; white-space: nowrap;
    }
    .amb-area-tag-amber { background: #fef3c7; color: #92400e; }

    .amb-loading-center {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      font-size: 13px; color: var(--text-muted); padding: 24px 0;
    }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

    .ubicacion-tabs { display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 2px solid var(--border); padding-bottom: 2px; }
    .ubi-tab {
      display: flex; align-items: center; gap: 5px;
      padding: 6px 14px; border-radius: 8px 8px 0 0; font-size: 12px; font-weight: 700;
      border: 1.5px solid var(--border); border-bottom: none;
      background: var(--surface2); color: var(--text-muted);
      cursor: pointer; transition: background .15s, color .15s;
      position: relative; bottom: -2px;
    }
    .ubi-tab:hover { background: #f0fdf4; color: #39A900; border-color: #bbf7d0; }
    .ubi-tab-active {
      background: var(--surface); color: #39A900;
      border-color: #39A900; border-bottom-color: var(--surface);
      font-weight: 800;
    }

  `],
})
export class ConsultarUbicacionComponent {
  @Output() elegir = new EventEmitter<{ h: any; seleccion: any }>();

  readonly to12h = to12h;
  readonly jornadaLabel = jornadaLabel;

  readonly UBICACION_TIPOS = [
    { tipo: 'auditorio',        label: 'Auditorios',       icon: 'mic' },
    { tipo: 'biblioteca',       label: 'Biblioteca',       icon: 'book-open' },
    { tipo: 'restaurante',      label: 'Restaurante',      icon: 'coffee' },
    { tipo: 'centro_deportivo', label: 'Centro Deportivo', icon: 'activity' },
  ];

  consultandoId = signal<number | null>(null);
  consultandoH  = signal<any>(null);
  busquedaAmb   = signal('');
  areaFiltro    = signal('');
  cargandoAmbs  = signal(false);
  tipoUbicacion = signal('ambientes');

  ambientesLibres         = signal<any[]>([]);
  ubicacionesDisponibles  = signal<any[]>([]);

  areasDisponibles = computed(() => {
    const areas = new Set<string>();
    this.ambientesLibres().forEach((a: any) => { if (a.area_nombre) areas.add(a.area_nombre); });
    return [...areas].sort();
  });
  areasOpts = computed<SSOption[]>(() => [
    { value: '', label: 'Todas las áreas' },
    ...this.areasDisponibles().map((a: string) => ({ value: a, label: a })),
  ]);

  ambsLibres    = computed(() => this.ambientesLibres().filter((a: any) => a.estado === 'libre'));
  ambsConflicto = computed(() => this.ambientesLibres().filter((a: any) => a.estado === 'conflicto'));
  ambsFiltradosLibres    = computed(() => this._filtrarAmbs(this.ambsLibres()));
  ambsFiltradosConflicto = computed(() => this._filtrarAmbs(this.ambsConflicto()));

  ubicFiltradosLibres   = computed(() => this._filtrarAmbs(this.ubicacionesDisponibles().filter((u: any) => u.estado === 'libre')));
  ubicFiltradosOcupados = computed(() => this._filtrarAmbs(this.ubicacionesDisponibles().filter((u: any) => u.estado === 'ocupado')));

  constructor(private erpCatalogo: ErpCatalogoService) {}

  private _filtrarAmbs(list: any[]): any[] {
    const q    = this.busquedaAmb().toLowerCase();
    const area = this.areaFiltro();
    return list.filter(a => {
      if (area && a.area_nombre !== area) return false;
      if (q && !a.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  /**
   * Adapta la respuesta consolidada de ErpCatalogoService.getAmbientesDisponibilidad()
   * ({...ambiente, disponible: boolean}) a la forma que espera el template
   * (area_nombre / estado). El backend no expone el detalle del conflicto
   * (instructor/ficha/minutosRetraso en horarios, o el evento en ubicaciones) —
   * esos campos quedan en null y el template los oculta automáticamente.
   */
  private _mapDisponibilidad(list: any[], ocupadoLabel: 'conflicto' | 'ocupado' = 'conflicto'): any[] {
    return (list ?? []).map((a: any) => ({
      ...a,
      area_nombre: a.area ?? null,
      estado: a.disponible ? 'libre' : ocupadoLabel,
      horario: null,
      evento: null,
      capacidad: null,
    }));
  }

  async consultarAmbientes(h: any) {
    if (this.consultandoId() === h.id) { this.cerrarPanel(); return; }
    this.consultandoId.set(h.id);
    this.consultandoH.set(h);
    this.busquedaAmb.set('');
    this.areaFiltro.set('');
    this.tipoUbicacion.set('ambientes');
    this.ubicacionesDisponibles.set([]);
    this.cargandoAmbs.set(true);
    const diaHoy = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'][new Date().getDay()];
    try {
      const list = await this.erpCatalogo.getAmbientesDisponibilidad(diaHoy, h.jornada);
      const visibles = this._mapDisponibilidad(list).sort((a, b) => {
        if (a.estado === b.estado) return a.nombre.localeCompare(b.nombre);
        return a.estado === 'libre' ? -1 : 1;
      });
      this.ambientesLibres.set(visibles);
      setTimeout(() => document.getElementById('amb-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch {
      // dejar la lista vacía
    } finally {
      this.cargandoAmbs.set(false);
    }
  }

  cerrarPanel() {
    this.consultandoId.set(null);
    this.consultandoH.set(null);
    this.busquedaAmb.set('');
    this.areaFiltro.set('');
    this.tipoUbicacion.set('ambientes');
    this.ambientesLibres.set([]);
    this.ubicacionesDisponibles.set([]);
  }

  seleccionarAmbiente(amb: any) {
    const h = this.consultandoH();
    if (!h) return;
    this.elegir.emit({ h, seleccion: amb });
    this.cerrarPanel();
  }

  seleccionarUbicacion(u: any) {
    const h = this.consultandoH();
    if (!h) return;
    this.elegir.emit({ h, seleccion: { ...u, _esUbicacion: true } });
    this.cerrarPanel();
  }

  async cambiarTipoUbicacion(tipo: string, h: any) {
    if (this.tipoUbicacion() === tipo) return;
    this.tipoUbicacion.set(tipo);
    this.busquedaAmb.set('');
    this.areaFiltro.set('');
    if (tipo === 'ambientes') return;
    this.cargandoAmbs.set(true);
    const diaHoy = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'][new Date().getDay()];
    try {
      const list = await this.erpCatalogo.getAmbientesDisponibilidad(diaHoy, h.jornada, tipo);
      this.ubicacionesDisponibles.set(this._mapDisponibilidad(list, 'ocupado'));
    } catch {
      // dejar la lista vacía
    } finally {
      this.cargandoAmbs.set(false);
    }
  }
}
