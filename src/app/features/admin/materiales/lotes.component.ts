import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { CreateLoteDto, Lote, MaterialesApiService, Producto, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_ESTADO: OpcionSelect[] = [
  { label: 'Activo', value: 'ACTIVO' },
  { label: 'Agotado', value: 'AGOTADO' },
  { label: 'Vencido', value: 'VENCIDO' },
  { label: 'Dado de baja', value: 'DADO_DE_BAJA' },
];

const OPCIONES_UNIDAD: OpcionSelect[] = [
  { label: 'Unidades (und)', value: 'und' }, { label: 'Cajas (cja)', value: 'cja' },
  { label: 'Paquetes (paq)', value: 'paq' }, { label: 'Resmas (res)', value: 'res' },
  { label: 'Bolsas (bol)', value: 'bol' }, { label: 'Rollos (rol)', value: 'rol' },
  { label: 'Litros (L)', value: 'L' }, { label: 'Mililitros (mL)', value: 'mL' },
  { label: 'Kilogramos (kg)', value: 'kg' }, { label: 'Gramos (g)', value: 'g' },
];

/**
 * Lotes — stock CONTABLE de consumibles (portado de SigMat). Un lote lleva
 * `cantidad_disponible` que baja/sube con los movimientos, en vez de N ítems
 * individuales. El alta escribe un movimiento de kardex ENTRADA.
 */
@Component({
  selector: 'app-materiales-lotes',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Lotes</h1>

      <app-admin-table
        [addLabel]="'Nuevo lote'"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por producto, código de lote, sitio…'"
        [columns]="['producto_nombre', 'codigo_lote', 'disponible', 'unidad_medida', 'vence', 'sitio_nombre', 'estado']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="editando"
      labelSingular="lote"
      [columns]="camposModal"
      [form]="form"
      [opciones]="opciones"
      [placeholders]="placeholders"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class MaterialesLotesComponent implements OnInit {
  private readonly confirm = inject(ConfirmService);

  lotes: Lote[] = [];
  productos: Producto[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  editando: Lote | null = null;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = {
    producto_nombre: 'Producto', codigo_lote: 'Código lote', disponible: 'Disponible',
    unidad_medida: 'Unidad', vence: 'Vence', sitio_nombre: 'Sitio', estado: 'Estado',
    id_producto: 'Producto', id_sitio: 'Sitio', cantidad_inicial: 'Cantidad inicial',
    cantidad_disponible: 'Disponible', fecha_vencimiento: 'Fecha de vencimiento',
  };

  placeholders: Record<string, string> = {
    codigo_lote: 'Ej: LT-2026-014', cantidad_inicial: 'Ej: 500',
  };

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void { this.cargar(); }

  get camposModal(): string[] {
    return this.editando
      ? ['codigo_lote', 'unidad_medida', 'fecha_vencimiento', 'id_sitio', 'cantidad_disponible', 'estado']
      : ['id_producto', 'cantidad_inicial', 'unidad_medida', 'codigo_lote', 'fecha_vencimiento', 'id_sitio'];
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      id_producto: this.productos.map((p) => ({ label: p.SKU ? `${p.nombre} (${p.SKU})` : p.nombre, value: p.id_producto })),
      id_sitio: this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio })),
      unidad_medida: OPCIONES_UNIDAD,
      estado: OPCIONES_ESTADO,
    };
  }

  get filas(): any[] {
    return this.lotes.map((l) => ({
      ...l,
      producto_nombre: l.producto?.nombre ?? '—',
      disponible: `${l.cantidad_disponible} / ${l.cantidad_inicial}`,
      vence: l.fecha_vencimiento ? String(l.fecha_vencimiento).slice(0, 10) : '—',
      sitio_nombre: this.sitios.find((s) => s.id_sitio === l.id_sitio)?.nombre ?? '—',
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [lotes, productos, sitios] = await Promise.all([
        this.api.listarLotes(),
        this.api.listarProductos().catch(() => []),
        this.api.listarSitios().catch(() => []),
      ]);
      this.lotes = lotes;
      this.productos = productos;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los lotes.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.productos.length === 0) {
      this.toast.warn('Faltan datos', 'Creá al menos un producto antes de registrar un lote.');
      return;
    }
    this.editando = null;
    this.form = { id_producto: this.productos[0].id_producto, cantidad_inicial: null, unidad_medida: 'und', codigo_lote: '', fecha_vencimiento: null, id_sitio: null };
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    const l = this.lotes.find((x) => x.id_lote === fila.id_lote);
    if (!l) return;
    this.editando = l;
    this.form = {
      codigo_lote: l.codigo_lote ?? '', unidad_medida: l.unidad_medida ?? 'und',
      fecha_vencimiento: l.fecha_vencimiento ? String(l.fecha_vencimiento).slice(0, 10) : null,
      id_sitio: l.id_sitio ?? null, cantidad_disponible: l.cantidad_disponible, estado: l.estado,
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void { this.modalOpen = false; }

  async guardar(form: Record<string, any>): Promise<void> {
    this.saving = true;
    this.error = null;
    try {
      if (this.editando) {
        await this.api.actualizarLote(this.editando.id_lote, {
          codigo_lote: form['codigo_lote'] || undefined,
          unidad_medida: form['unidad_medida'] || undefined,
          fecha_vencimiento: form['fecha_vencimiento'] || undefined,
          id_sitio: form['id_sitio'] || undefined,
          cantidad_disponible: form['cantidad_disponible'] != null ? Number(form['cantidad_disponible']) : undefined,
          estado: form['estado'] || undefined,
        });
        this.toast.ok('Lote actualizado');
      } else {
        const dto: CreateLoteDto = {
          id_producto: form['id_producto'],
          cantidad_inicial: Number(form['cantidad_inicial'] ?? 0),
          unidad_medida: form['unidad_medida'] || undefined,
          codigo_lote: form['codigo_lote'] || undefined,
          fecha_vencimiento: form['fecha_vencimiento'] || undefined,
          id_sitio: form['id_sitio'] || undefined,
        };
        await this.api.crearLote(dto);
        this.toast.ok('Lote registrado');
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el lote.';
    } finally {
      this.saving = false;
    }
  }

  async eliminar(fila: any): Promise<void> {
    if (!(await this.confirm.ask(`¿Eliminar el lote ${fila.codigo_lote || ''} de "${fila.producto_nombre}"?`))) return;
    try {
      await this.api.eliminarLote(fila.id_lote);
      this.toast.ok('Lote eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el lote.');
    }
  }
}
