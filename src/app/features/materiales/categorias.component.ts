import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../shared/components/admin-modal.component';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Categoria, MaterialesApiService } from '../../core/services/materiales/materiales-api.service';

/**
 * Categorías de Materiales — crear/editar/eliminar gateados por servicio
 * (`materiales.categorias.crear/editar/eliminar`), no por cargo: admin las
 * tiene siempre vía su bundle de rol (MATERIALES_ADMIN en backend-epsas), y
 * cualquier otro cargo solo si se las otorgan explícitamente — mismo
 * mecanismo (`AuthService.tieneServicio`, poblado para todos los cargos vía
 * `GET /permisos/mis-servicios`), sin necesidad de ramificar por rol.
 *
 * Componente único para admin/instructor (ítem 5 del plan de unificación) —
 * antes vivía duplicado en `features/{admin,instructor}/materiales/`, con la
 * única diferencia real siendo que la versión admin no gateaba los botones
 * (la ruta ya era admin-only). Aprendiz no tiene esta pantalla.
 */
@Component({
  selector: 'app-materiales-categorias',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Categorías de Materiales</h1>

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nueva categoría' : null"
        (add)="nuevo()"
        [rows]="categorias"
        [searchable]="true"
        [searchPlaceholder]="'Buscar categoría…'"
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
      [placeholders]="{ nombre: 'Ej: Herramientas manuales, Insumos de aseo…' }"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class MaterialesCategoriasComponent implements OnInit {
  private readonly confirm = inject(ConfirmService);

  categorias: Categoria[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Categoria | null = null;
  form: Record<string, any> = {};

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.categorias.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.categorias.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.categorias.eliminar'));

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
    if (!(await this.confirm.ask(`¿Eliminar la categoría "${cat.nombre}"?`))) return;
    try {
      await this.api.eliminarCategoria(cat.id_categoria);
      this.toast.ok('Categoría eliminada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar la categoría.');
    }
  }
}
