import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../shared/components/admin-table.component';
import { SearchableSelectComponent, SSOption } from '../../shared/components/searchable-select.component';
import { DialogDirective } from '../../shared/directives/dialog.directive';
import { ToastService, mensajeDeError } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { MaterialesApiService, Municipio, Proveedor, ProveedorDto, TipoDocumentoProveedor } from './data-access/materiales-api.service';

const TIPOS_DOC: { value: TipoDocumentoProveedor; label: string }[] = [
  { value: 'NIT', label: 'NIT' },
  { value: 'CC', label: 'Cédula' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'OTRO', label: 'Otro' },
];

const VACIO: ProveedorDto = {
  nombre: '', tipo_documento: 'NIT', documento: '', direccion: '', id_municipio: '',
  telefono: '', correo: '', contacto: '', observaciones: '',
};

/**
 * Proveedores de la sede (2026-10-05). Los gestionan el administrador, los
 * líderes de área y los encargados de bodega (ruta con `gestorMaterialesGuard`).
 * No se borran: se desactivan, porque los ingresos los referencian; un
 * proveedor inactivo no aparece al registrar un ingreso nuevo.
 */
@Component({
  selector: 'app-materiales-proveedores',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, DialogDirective, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Proveedores</h1>
          <p class="text-sm text-gray-500 mt-0.5">Quienes entregan material a la sede. Se eligen al registrar un ingreso.</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" [(ngModel)]="verInactivos" (ngModelChange)="cargar()" class="rounded" />
          Ver desactivados
        </label>
      </div>

      <app-admin-table
        addLabel="Nuevo proveedor"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        searchPlaceholder="Buscar por nombre, documento, contacto…"
        [columns]="['nombre', 'documento_txt', 'municipio_nombre', 'telefono', 'correo', 'contacto', 'ingresos', 'estado_txt']"
        [columnLabels]="{ nombre: 'Proveedor', documento_txt: 'Documento', municipio_nombre: 'Municipio', telefono: 'Teléfono', correo: 'Correo', contacto: 'Contacto', ingresos: 'Ingresos', estado_txt: 'Estado' }"
        [loading]="loading"
        [canEdit]="true"
        [canDelete]="true"
        [deleteLabel]="etiquetaEstado"
        (edit)="editar($event)"
        (delete)="alternarEstado($event)" />
    </div>

    @if (modalOpen) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="cerrar()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-xl my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <h2 class="text-lg font-bold text-gray-800">{{ editando ? 'Editar proveedor' : 'Nuevo proveedor' }}</h2>
            <button aria-label="Cerrar" (click)="cerrar()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6 space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Nombre o razón social <span class="text-red-500">*</span></label>
              <input type="text" [(ngModel)]="form.nombre" maxlength="200" placeholder="Ej: Distribuidora Técnica S.A.S." [class]="campo" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Tipo de documento</label>
                <select [(ngModel)]="form.tipo_documento" [class]="campo">
                  @for (t of tiposDoc; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                </select>
              </div>
              <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-gray-600 mb-1">Número <span class="text-red-500">*</span></label>
                <input type="text" [(ngModel)]="form.documento" maxlength="30" placeholder="Ej: 900123456-7" [class]="campo" />
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                <input type="tel" [(ngModel)]="form.telefono" maxlength="50" [class]="campo" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Correo</label>
                <input type="email" [(ngModel)]="form.correo" maxlength="150" placeholder="ventas@proveedor.com" [class]="campo" />
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
                <input type="text" [(ngModel)]="form.direccion" maxlength="250" [class]="campo" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Municipio</label>
                <app-ss [options]="opcionesMunicipio" placeholder="Buscar municipio…" [(ngModel)]="form.id_municipio"></app-ss>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Persona de contacto</label>
              <input type="text" [(ngModel)]="form.contacto" maxlength="150" placeholder="Nombre de quien atiende" [class]="campo" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
              <textarea rows="2" [(ngModel)]="form.observaciones" maxlength="2000" [class]="campo"></textarea>
            </div>
            @if (error) { <p class="text-red-600 text-xs p-2 bg-red-50 rounded-lg">{{ error }}</p> }
          </div>
          <div class="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-6 mt-2">
            <button (click)="cerrar()" class="w-full sm:w-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving"
              class="w-full sm:w-auto px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60" style="background-color: var(--accent-brand)">
              {{ saving ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesProveedoresComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly tiposDoc = TIPOS_DOC;
  readonly campo = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]';

  proveedores: Proveedor[] = [];
  filas: any[] = [];
  loading = false;
  verInactivos = false;

  modalOpen = false;
  editando: Proveedor | null = null;
  form: ProveedorDto = { ...VACIO };
  saving = false;
  error: string | null = null;

  etiquetaEstado = (row: any): string => (row.activo ? 'Desactivar' : 'Activar');

  municipios: Municipio[] = [];
  opcionesMunicipio: SSOption[] = [];

  ngOnInit(): void {
    void this.cargar();
    void this.cargarMunicipios();
  }

  /** Municipios de la tabla del ERP (el proveedor guarda el id, no texto libre). */
  private async cargarMunicipios(): Promise<void> {
    try {
      this.municipios = await this.api.listarMunicipios();
      this.opcionesMunicipio = this.municipios.map((m) => ({
        value: m.id_municipio,
        label: m.departamento ? `${m.nombre} (${m.departamento})` : m.nombre,
      }));
    } catch {
      this.opcionesMunicipio = [];
    }
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.proveedores = await this.api.listarProveedores(this.verInactivos);
      this.filas = this.proveedores.map((p) => ({
        ...p,
        documento_txt: `${p.tipo_documento} ${p.documento}`,
        estado_txt: p.activo ? 'Activo' : 'Desactivado',
        municipio_nombre: p.municipio_nombre ?? '—',
      }));
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los proveedores.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    this.editando = null;
    this.form = { ...VACIO };
    this.error = null;
    this.modalOpen = true;
  }

  editar(p: Proveedor): void {
    this.editando = p;
    this.form = {
      nombre: p.nombre, tipo_documento: p.tipo_documento, documento: p.documento, direccion: p.direccion ?? '',
      id_municipio: p.id_municipio ?? '', telefono: p.telefono ?? '', correo: p.correo ?? '', contacto: p.contacto ?? '',
      observaciones: p.observaciones ?? '',
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrar(): void {
    this.modalOpen = false;
  }

  async guardar(): Promise<void> {
    const f = this.form;
    if ((f.nombre ?? '').trim().length < 2) { this.error = 'Escribe el nombre del proveedor.'; return; }
    if ((f.documento ?? '').trim().length < 3) { this.error = 'Escribe el número de documento.'; return; }
    if (f.correo?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo.trim())) { this.error = 'El correo no es válido.'; return; }
    // Vacío → null al editar (para poder borrar un dato); al crear se omite.
    const dto: ProveedorDto = { nombre: f.nombre!.trim(), tipo_documento: f.tipo_documento, documento: f.documento!.trim() };
    for (const k of ['direccion', 'id_municipio', 'telefono', 'correo', 'contacto', 'observaciones'] as const) {
      const v = (f[k] ?? '').trim();
      if (v) dto[k] = v;
      else if (this.editando) dto[k] = null;
    }
    this.saving = true;
    this.error = null;
    try {
      if (this.editando) {
        await this.api.actualizarProveedor(this.editando.id_proveedor, dto);
        this.toast.ok('Proveedor actualizado');
      } else {
        await this.api.crearProveedor(dto);
        this.toast.ok('Proveedor creado');
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e) {
      this.error = mensajeDeError(e, 'No se pudo guardar el proveedor.');
    } finally {
      this.saving = false;
    }
  }

  async alternarEstado(p: Proveedor): Promise<void> {
    const activar = !p.activo;
    const pregunta = activar
      ? `¿Activar de nuevo a "${p.nombre}"?`
      : `¿Desactivar a "${p.nombre}"? Sus ingresos se conservan; solo deja de aparecer al registrar ingresos nuevos.`;
    if (!(await this.confirm.ask(pregunta))) return;
    try {
      await this.api.actualizarProveedor(p.id_proveedor, { activo: activar });
      this.toast.ok(activar ? 'Proveedor activado' : 'Proveedor desactivado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cambiar el estado del proveedor.');
    }
  }
}
