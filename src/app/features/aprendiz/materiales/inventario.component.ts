import { Component, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Inventario, Item, MaterialesApiService, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
];

/**
 * Vista de inventario (item ⇄ sitio) para aprendiz — "Registrar entrada"
 * gateado por servicio (`materiales.inventario.crear`), no por cargo. Ver
 * plan "Ronda 3".
 */
@Component({
  selector: 'app-aprendiz-materiales-inventario',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Inventario</h1>
        @if (puedeCrear()) {
          <button (click)="nuevo()"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
            style="background-color: #39A900">
            + Registrar entrada
          </button>
        }
      </div>

      <app-admin-table
        [rows]="filas"
        [columns]="['item_sku', 'producto_nombre', 'sitio_nombre', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="false"
        [canDelete]="false" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="null"
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
  inventario: Inventario[] = [];
  items: Item[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = {
    item_sku: 'SKU',
    producto_nombre: 'Producto',
    sitio_nombre: 'Sitio',
    id_item: 'Ítem',
    id_sitio: 'Sitio',
  };

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.inventario.crear'));

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
      sitio_nombre: inv.sitio?.nombre ?? this.sitios.find((s) => s.id_sitio === inv.id_sitio)?.nombre ?? '—',
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [inventario, items, sitios] = await Promise.all([
        this.api.listarInventario(),
        this.api.listarItems(),
        this.api.listarSitios(),
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
    this.form = { id_item: this.items[0].id_item, id_sitio: this.sitios[0].id_sitio, estado: 'DISPONIBLE' };
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
      await this.api.crearInventario({
        id_item: Number(form['id_item']),
        id_sitio: Number(form['id_sitio']),
        estado: form['estado'],
      });
      this.toast.ok('Entrada registrada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la entrada.';
    } finally {
      this.saving = false;
    }
  }
}
