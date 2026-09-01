import { Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { Inventario, Item, MaterialesApiService, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
];

/**
 * Vista de inventario (item ⇄ sitio) para aprendiz — "Registrar entrada",
 * editar y eliminar una fila, cada uno gateado por su propio servicio
 * (`materiales.inventario.crear`/`.editar`/`.eliminar`), no por cargo.
 * Ver plan "Ronda 3" (creación) y "Ronda 4" Fase 4 (editar/eliminar).
 */
@Component({
  selector: 'app-aprendiz-materiales-inventario',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Inventario</h1>

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Registrar entrada' : null"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por SKU, producto, sitio, estado…'"
        [columns]="['item_sku', 'producto_nombre', 'sitio_nombre', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="puedeEliminar()"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="entrada de inventario"
      [columns]="['id_item', 'id_sitio', 'estado']"
      [form]="form"
      [opciones]="opciones"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class AprendizMaterialesInventarioComponent implements OnInit {
  private readonly confirm = inject(ConfirmService);

  inventario: Inventario[] = [];
  items: Item[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Inventario | null = null;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = {
    item_sku: 'SKU',
    producto_nombre: 'Producto',
    sitio_nombre: 'Sitio',
    id_item: 'Ítem',
    id_sitio: 'Sitio',
  };

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.inventario.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.inventario.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.inventario.eliminar'));

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      id_item: this.items.map((i) => ({
        label: `${i.codigo_sku} — ${i.producto?.nombre ?? 'sin producto'}`,
        value: i.id_item,
      })),
      id_sitio: this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })),
      estado: OPCIONES_ESTADO,
    };
  }

  get filas(): any[] {
    return this.inventario.map((inv) => ({
      ...inv,
      item_sku: inv.item?.codigo_sku ?? inv.id_item,
      producto_nombre: inv.item?.producto?.nombre ?? '—',
      // /api2/inventario ya trae el sitio anidado — no depende del catálogo.
      sitio_nombre: inv.sitio?.nombre ?? '—',
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // El aprendiz no tiene `materiales.sitios.ver`; el nombre del sitio sale
      // del objeto anidado de /inventario. Antes el 403 de /sitios tumbaba todo.
      const verSitios = this.auth.tieneServicio('materiales.sitios.ver');
      const [inventario, items, sitios] = await Promise.all([
        this.api.listarInventario(),
        this.api.listarItems().catch(() => [] as Item[]),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
      ]);
      this.inventario = inventario;
      this.items = items;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el inventario.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (!this.puedeCrear()) return;
    if (this.items.length === 0 || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto (que genera ítems) y un sitio antes de registrar una entrada.');
      return;
    }
    this.editando = null;
    this.form = { id_item: this.items[0].id_item, id_sitio: this.sitios[0].id_sitio, estado: 'DISPONIBLE' };
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const inv = this.inventario.find((i) => i.id_inventario === fila.id_inventario);
    if (!inv) return;
    this.editando = inv;
    this.form = { id_item: inv.id_item, id_sitio: inv.id_sitio, estado: inv.estado };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    this.saving = true;
    this.error = null;
    try {
      const dto = { id_item: form['id_item'], id_sitio: form['id_sitio'], estado: form['estado'] };
      if (this.editando) {
        await this.api.actualizarInventario(this.editando.id_inventario, dto);
        this.toast.ok('Entrada actualizada');
      } else {
        await this.api.crearInventario(dto);
        this.toast.ok('Entrada registrada');
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? (this.editando ? 'No se pudo actualizar la entrada.' : 'No se pudo registrar la entrada.');
    } finally {
      this.saving = false;
    }
  }

  async eliminar(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    if (!(await this.confirm.ask(`¿Eliminar esta entrada de inventario (${fila.item_sku} en ${fila.sitio_nombre})?`))) return;
    try {
      await this.api.eliminarInventario(fila.id_inventario);
      this.toast.ok('Entrada eliminada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar la entrada.');
    }
  }
}
