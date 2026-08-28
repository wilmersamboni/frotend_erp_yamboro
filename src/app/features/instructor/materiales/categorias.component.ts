import { Component, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Categoria, MaterialesApiService } from '../../../core/services/materiales/materiales-api.service';

/**
 * Categorías de Materiales para instructor — crear/editar/eliminar
 * gateados por servicio, no por cargo. OJO: no existe un servicio propio
 * `materiales.categorias.*` en el catálogo — el backend reusa
 * `materiales.inventario.ver/crear/editar/eliminar` a propósito (evita
 * resembrar permisos en tenants existentes, ver CLAUDE.md de
 * backend-epsas-horarios). Consecuencia real: otorgar acceso a Inventario
 * también otorga, sin poder separarlo, acceso a gestionar Categorías.
 */
@Component({
  selector: 'app-instructor-materiales-categorias',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Categorías de Materiales</h1>
        @if (puedeCrear()) {
          <button (click)="nuevo()"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style="background-color: #39A900">
            + Nueva categoría
          </button>
        }
      </div>

      <app-admin-table
        [rows]="categorias"
        [columns]="['nombre']"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="puedeEliminar()"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="categoría"
      [columns]="['nombre']"
      [form]="form"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class InstructorMaterialesCategoriasComponent implements OnInit {
  categorias: Categoria[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Categoria | null = null;
  form: Record<string, any> = {};

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.inventario.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.inventario.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.inventario.eliminar'));

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.categorias = await this.api.listarCategorias();
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las categorías.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (!this.puedeCrear()) return;
    this.editando = null;
    this.form = { nombre: '' };
    this.error = null;
    this.modalOpen = true;
  }

  editar(cat: Categoria): void {
    if (!this.puedeEditar()) return;
    this.editando = cat;
    this.form = { nombre: cat.nombre };
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
    this.saving = true;
    this.error = null;
    try {
      if (this.editando) {
        await this.api.actualizarCategoria(this.editando.id_categoria, { nombre: form['nombre'] });
        this.toast.ok('Categoría actualizada');
      } else {
        await this.api.crearCategoria({ nombre: form['nombre'] });
        this.toast.ok('Categoría creada');
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar la categoría.';
    } finally {
      this.saving = false;
    }
  }

  async eliminar(cat: Categoria): Promise<void> {
    if (!this.puedeEliminar()) return;
    if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return;
    try {
      await this.api.eliminarCategoria(cat.id_categoria);
      this.toast.ok('Categoría eliminada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar la categoría.');
    }
  }
}
