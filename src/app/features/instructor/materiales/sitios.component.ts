import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { Item, MaterialesApiService, Sitio } from '../../../core/services/materiales/materiales-api.service';
import { PersonaService } from '../../../core/services/persona.service';

const OPCIONES_TIPO: OpcionSelect[] = [
  { label: 'Bodega', value: 'BODEGA' },
  { label: 'Ambiente', value: 'AMBIENTE' },
  { label: 'Laboratorio', value: 'LABORATORIO' },
  { label: 'Otro', value: 'OTRO' },
];

/**
 * Sitios de almacenamiento para instructor — crear/editar/eliminar gateado
 * por servicio (`materiales.sitios.crear/.editar/.eliminar`), no por cargo.
 * Antes esta pantalla era 100% solo-lectura sin importar el permiso; ver
 * plan "Ronda 3" para el contexto del bug.
 *
 * Pulido (Ronda 4, Fase 9): columna con el conteo de ítems por sitio +
 * "Ver ítems" al hacer clic en la fila — ver docblock de la versión admin.
 *
 * Ronda 6/7: el form dejó de pedir UUIDs a mano — `Responsable`, `Centro` y
 * `Programa` son ahora `<select>` poblados del ERP (mismo criterio que la
 * versión admin); `Tipo personalizado` solo aparece con tipo = OTRO; `Estado`
 * es un `<select>` Activo/Inactivo al editar en vez de un checkbox.
 */
@Component({
  selector: 'app-instructor-materiales-sitios',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Sitios de almacenamiento</h1>

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nuevo sitio' : null"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por nombre, tipo, programa…'"
        [columns]="['nombre', 'tipo', 'programa_nombre', 'responsable_nombre', 'items_count', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="puedeEliminar()"
        [selectable]="true"
        (rowSelected)="verItems($event)"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    @if (verItemsAbierto) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="verItemsAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Ítems en "{{ sitioSeleccionado?.nombre }}"</h2>
            <button (click)="verItemsAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          @if (itemsDelSitioSeleccionado().length === 0) {
            <p class="text-sm text-gray-400 py-6 text-center">Este sitio no tiene ítems.</p>
          } @else {
            <div class="divide-y divide-gray-50">
              @for (i of itemsDelSitioSeleccionado(); track i.id_item) {
                <div class="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <p class="font-medium text-gray-800">{{ i.producto?.nombre ?? i.codigo_sku }}</p>
                    <p class="text-xs text-gray-500 font-mono">{{ i.codigo_sku }}{{ i.placa_sena ? ' — ' + i.placa_sena : '' }}</p>
                  </div>
                  <span class="px-2 py-1 rounded-full text-xs"
                    [class.bg-green-100]="i.estado === 'DISPONIBLE'" [class.text-green-700]="i.estado === 'DISPONIBLE'"
                    [class.bg-amber-100]="i.estado === 'PRESTADO'" [class.text-amber-700]="i.estado === 'PRESTADO'"
                    [class.bg-red-100]="i.estado === 'DAÑADO' || i.estado === 'PERDIDO'" [class.text-red-700]="i.estado === 'DAÑADO' || i.estado === 'PERDIDO'">
                    {{ i.estado }}
                  </span>
                </div>
              }
            </div>
          }
        </div>
      </div>
    }

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="sitio"
      [columns]="editando ? camposEditar : camposCrear"
      [form]="form"
      [opciones]="opciones"
      [tiposCampo]="tiposCampo"
      [columnLabels]="columnLabels"
      [placeholders]="placeholders"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class InstructorMaterialesSitiosComponent implements OnInit {
  private readonly confirm = inject(ConfirmService);

  sitios: Sitio[] = [];
  responsables: any[] = [];
  centros: any[] = [];
  programas: any[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Sitio | null = null;
  form: Record<string, any> = {};

  tiposCampo: Record<string, string> = {};
  columnLabels: Record<string, string> = {
    id_responsable: 'Responsable',
    id_centro: 'Centro',
    id_programa: 'Programa',
    codigo_lugar: 'Código de lugar',
    tipo_personalizado: 'Tipo personalizado',
    responsable_nombre: 'Responsable',
    programa_nombre: 'Programa',
    items_count: 'Ítems',
  };
  placeholders: Record<string, string> = {
    nombre: 'Ej: Bodega Central, Laboratorio de Redes…',
    codigo_lugar: 'Ej: ADSW-01, Y-14',
    tipo_personalizado: 'Ej: Auditorio, Taller',
  };

  /** "Ver ítems" (Fase 9) — diálogo aparte, sin backend nuevo. */
  items: Item[] = [];
  verItemsAbierto = false;
  sitioSeleccionado: Sitio | null = null;

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.sitios.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.sitios.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.sitios.eliminar'));

  constructor(
    private api: MaterialesApiService,
    private personaApi: PersonaService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      tipo: OPCIONES_TIPO,
      id_responsable: this.responsables.map((u) => ({
        label: `${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''} — ${this.etiquetaCargo(u.persona?.cargo)}`.trim(),
        value: u.idUsuario,
      })),
      id_centro: this.centros.map((c) => ({ label: c.nombre, value: c.idCentro })),
      id_programa: [
        { label: '— Sin programa (compartido) —', value: '' },
        ...this.programas.map((p) => ({ label: p.nombre, value: p.idPrograma ?? p.id_programa })),
      ],
      estado: [
        { label: 'Activo', value: true },
        { label: 'Inactivo', value: false },
      ],
    };
  }

  /** Campos al crear: sin `estado` (nace activo), sin `id_centro` si el tenant
   *  tiene un único centro, y sin `tipo_personalizado` salvo que tipo = OTRO. */
  get camposCrear(): string[] {
    const base = ['nombre', 'tipo', 'tipo_personalizado', 'codigo_lugar', 'id_responsable', 'id_programa'];
    let cols = base.filter((c) => c !== 'tipo_personalizado' || this.form['tipo'] === 'OTRO');
    if (this.centros.length > 1) cols = [...cols, 'id_centro'];
    return cols;
  }

  get camposEditar(): string[] {
    return [...this.camposCrear, 'estado'];
  }

  private etiquetaCargo(cargo?: string): string {
    if (cargo === 'administrador_erp') return 'Administrador ERP';
    if (cargo === 'administrador') return 'Administrador';
    if (cargo === 'instructor') return 'Instructor';
    return cargo ?? '';
  }

  get filas(): any[] {
    return this.sitios.map((s) => ({
      ...s,
      estado: s.estado ? 'Activo' : 'Inactivo',
      responsable_nombre: this.nombreResponsable(s.id_responsable) ?? '—',
      programa_nombre: this.nombrePrograma(s.id_programa) ?? '— compartido —',
      items_count: this.items.filter((i) => i.id_sitio === s.id_sitio).length,
    }));
  }

  private nombreResponsable(idUsuario?: string | null): string | null {
    if (!idUsuario) return null;
    const u = this.responsables.find((r) => r.idUsuario === idUsuario);
    return u ? `${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''}`.trim() : null;
  }

  private nombrePrograma(idPrograma?: string | null): string | null {
    if (!idPrograma) return null;
    const p = this.programas.find((x) => (x.idPrograma ?? x.id_programa) === idPrograma);
    return p?.nombre ?? null;
  }

  itemsDelSitioSeleccionado(): Item[] {
    if (!this.sitioSeleccionado) return [];
    return this.items.filter((i) => i.id_sitio === this.sitioSeleccionado!.id_sitio);
  }

  verItems(fila: any): void {
    this.sitioSeleccionado = this.sitios.find((s) => s.id_sitio === fila.id_sitio) ?? null;
    this.verItemsAbierto = true;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [sitios, responsables, centros, programas, items] = await Promise.all([
        this.api.listarSitios(),
        this.personaApi.listarResponsablesBodega().catch(() => [] as any[]),
        this.personaApi.listarCentros().catch(() => [] as any[]),
        this.personaApi.listarProgramas().catch(() => [] as any[]),
        this.api.listarItems(),
      ]);
      this.sitios = sitios;
      this.responsables = responsables;
      this.centros = centros;
      this.programas = programas;
      this.items = items;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los sitios.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (!this.puedeCrear()) return;
    this.editando = null;
    this.form = {
      nombre: '', tipo: 'BODEGA', tipo_personalizado: '', codigo_lugar: '',
      id_responsable: '',
      id_programa: '',
      id_centro: this.centros.length === 1 ? this.centros[0].idCentro : '',
      estado: true,
    };
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const sitio = this.sitios.find((s) => s.id_sitio === fila.id_sitio)!;
    this.editando = sitio;
    this.form = {
      nombre: sitio.nombre,
      tipo: sitio.tipo,
      tipo_personalizado: sitio.tipo_personalizado ?? '',
      codigo_lugar: sitio.codigo_lugar ?? '',
      id_responsable: sitio.id_responsable ?? '',
      id_programa: sitio.id_programa ?? '',
      id_centro: sitio.id_centro ?? (this.centros.length === 1 ? this.centros[0].idCentro : ''),
      estado: sitio.estado,
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    if (!form['nombre']?.trim()) {
      this.error = 'El nombre es obligatorio.';
      return;
    }
    const dto = {
      nombre: form['nombre'],
      tipo: form['tipo'],
      tipo_personalizado: form['tipo'] === 'OTRO' ? (form['tipo_personalizado'] || undefined) : null,
      codigo_lugar: form['codigo_lugar'] || undefined,
      id_responsable: form['id_responsable'] || undefined,
      id_centro: form['id_centro'] || undefined,
      id_programa: form['id_programa'] || null,
      estado: this.editando ? form['estado'] : true,
    };
    this.saving = true;
    this.error = null;
    try {
      if (this.editando) {
        await this.api.actualizarSitio(this.editando.id_sitio, dto);
        this.toast.ok('Sitio actualizado');
      } else {
        await this.api.crearSitio(dto);
        this.toast.ok('Sitio creado');
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el sitio.';
    } finally {
      this.saving = false;
    }
  }

  async eliminar(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    if (!(await this.confirm.ask(`¿Eliminar el sitio "${fila.nombre}"?`))) return;
    try {
      await this.api.eliminarSitio(fila.id_sitio);
      this.toast.ok('Sitio eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el sitio.');
    }
  }
}
