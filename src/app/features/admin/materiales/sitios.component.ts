import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { MaterialesApiService, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO: OpcionSelect[] = [
  { label: 'Bodega', value: 'BODEGA' },
  { label: 'Ambiente', value: 'AMBIENTE' },
  { label: 'Laboratorio', value: 'LABORATORIO' },
  { label: 'Otro', value: 'OTRO' },
];

/**
 * Sitios de almacenamiento (bodegas/ambientes/laboratorios). `id_responsable`
 * e `id_centro` son UUIDs foráneos al propio ERP (persona/centro) — en este
 * slice quedan como texto libre, sin resolver contra el listado real de
 * personas/centros (ver plan: fuera de alcance del slice de admin v1).
 */
@Component({
  selector: 'app-materiales-sitios',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Sitios de almacenamiento</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nuevo sitio
        </button>
      </div>

      <app-admin-table
        [rows]="filas"
        [columns]="['nombre', 'tipo', 'estado']"
        [loading]="loading"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="sitio"
      [columns]="['nombre', 'tipo', 'tipo_personalizado', 'codigo_lugar', 'id_responsable', 'id_centro', 'estado']"
      [form]="form"
      [opciones]="opciones"
      [tiposCampo]="tiposCampo"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class MaterialesSitiosComponent implements OnInit {
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Sitio | null = null;
  form: Record<string, any> = {};

  opciones: Record<string, OpcionSelect[]> = { tipo: OPCIONES_TIPO };
  tiposCampo: Record<string, string> = { estado: 'boolean' };
  columnLabels: Record<string, string> = {
    id_responsable: 'Responsable (UUID, opcional)',
    id_centro: 'Centro (UUID, opcional)',
    codigo_lugar: 'Código de lugar',
    tipo_personalizado: 'Tipo personalizado',
  };

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  /** Filas con `estado` legible para la tabla (el form guarda el booleano crudo). */
  get filas(): any[] {
    return this.sitios.map((s) => ({ ...s, estado: s.estado ? 'Activo' : 'Inactivo' }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.sitios = await this.api.listarSitios();
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los sitios.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    this.editando = null;
    this.form = { nombre: '', tipo: 'BODEGA', tipo_personalizado: '', codigo_lugar: '', id_responsable: '', id_centro: '', estado: true };
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
      id_centro: sitio.id_centro ?? '',
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
      tipo_personalizado: form['tipo_personalizado'] || undefined,
      codigo_lugar: form['codigo_lugar'] || undefined,
      id_responsable: form['id_responsable'] || undefined,
      id_centro: form['id_centro'] || undefined,
      estado: form['estado'],
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
    if (!confirm(`¿Eliminar el sitio "${fila.nombre}"?`)) return;
    try {
      await this.api.eliminarSitio(fila.id_sitio);
      this.toast.ok('Sitio eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el sitio.');
    }
  }
}
