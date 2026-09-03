import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
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
 * Sitios de almacenamiento (bodegas/ambientes/laboratorios). `id_responsable`
 * e `id_centro` son UUIDs foráneos al propio ERP (persona/centro) — ya se
 * resuelven contra el listado real de usuarios/centros (mismo criterio que
 * el sitio de almacenamiento del SGM: responsable = select de personas
 * elegibles, centro se omite del formulario cuando el tenant tiene uno solo).
 * `estado` no se pide al crear — un sitio nuevo siempre nace activo, igual
 * que en el SGM; solo aparece al editar.
 *
 * Pulido (Ronda 4, Fase 9): columna con el conteo de ítems por sitio
 * (cruzando `listarItems()` por `id_sitio`, sin endpoint nuevo) + clic en la
 * fila ("Ver ítems") abre un diálogo con el detalle — usa `selectable` de
 * `AdminTableComponent` en vez de un botón de acción propio, ya que el
 * componente no soporta una tercera acción de fila.
 */
@Component({
  selector: 'app-materiales-sitios',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Sitios de almacenamiento</h1>

      <app-admin-table
        [addLabel]="'Nuevo sitio'"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por nombre, tipo, programa…'"
        [columns]="['nombre', 'tipo', 'programa_nombre', 'responsable_nombre', 'items_count', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
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
export class MaterialesSitiosComponent implements OnInit {
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

  // `estado` ya no es checkbox: se ofrece como <select> Activo/Inactivo al
  // editar (Ronda 6) — ver `opciones.estado`.
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

  constructor(
    private api: MaterialesApiService,
    private personaApi: PersonaService,
    private toast: ToastService,
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
      // Solo se ofrece como select cuando el tenant tiene más de un centro
      // registrado — con uno solo no tiene sentido preguntar (ver `camposCrear`).
      id_centro: this.centros.map((c) => ({ label: c.nombre, value: c.idCentro })),
      // Programa al que pertenece el sitio (Ronda 7). "Sin programa" = sitio
      // compartido: lo ven todos los instructores y el admin, pero ningún
      // aprendiz. Con >10 programas el modal lo muestra como buscador.
      id_programa: [
        { label: '— Sin programa (compartido) —', value: '' },
        ...this.programas.map((p) => ({ label: p.nombre, value: p.idPrograma ?? p.id_programa })),
      ],
      // Estado como <select> (Ronda 6) en vez de checkbox — solo aparece al editar.
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

  /** Al editar sí se puede ver/cambiar `estado` y, si aplica, el centro. */
  get camposEditar(): string[] {
    return [...this.camposCrear, 'estado'];
  }

  private etiquetaCargo(cargo?: string): string {
    if (cargo === 'administrador_erp') return 'Administrador ERP';
    if (cargo === 'administrador') return 'Administrador';
    if (cargo === 'instructor') return 'Instructor';
    if (cargo === 'aprendiz') return 'Aprendiz';
    return cargo ?? '';
  }

  /** Filas con `estado`/responsable legibles para la tabla (el form guarda los valores crudos). */
  get filas(): any[] {
    return this.sitios.map((s) => ({
      ...s,
      estado: s.estado ? 'Activo' : 'Inactivo',
      responsable_nombre: this.nombreResponsable(s.id_responsable) ?? '—',
      programa_nombre: this.nombrePrograma(s.id_programa) ?? '— compartido —',
      items_count: this.items.filter((i) => i.id_sitio === s.id_sitio).length,
    }));
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

  private nombreResponsable(idUsuario?: string | null): string | null {
    if (!idUsuario) return null;
    const u = this.responsables.find((r) => r.idUsuario === idUsuario);
    return u ? `${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''}`.trim() : null;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [sitios, responsables, centros, programas, items] = await Promise.all([
        this.api.listarSitios(),
        this.personaApi.listarResponsablesBodega(),
        this.personaApi.listarCentros(),
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
    this.editando = null;
    this.form = {
      nombre: '', tipo: 'BODEGA', tipo_personalizado: '', codigo_lugar: '',
      id_responsable: '',
      id_programa: '',
      // Con un único centro en el tenant, se asigna solo sin preguntar.
      id_centro: this.centros.length === 1 ? this.centros[0].idCentro : '',
      estado: true,
    };
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
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
      // Solo se guarda el tipo personalizado cuando tipo = OTRO; en cualquier
      // otro caso se limpia (null explícito) por si venía de un OTRO anterior.
      tipo_personalizado: form['tipo'] === 'OTRO' ? (form['tipo_personalizado'] || undefined) : null,
      codigo_lugar: form['codigo_lugar'] || undefined,
      id_responsable: form['id_responsable'] || undefined,
      id_centro: form['id_centro'] || undefined,
      // null explícito (no undefined) para permitir "des-clasificar" un sitio
      // a compartido al editar — undefined haría que el PATCH lo omita.
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
