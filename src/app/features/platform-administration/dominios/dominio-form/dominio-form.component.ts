import { Component, inject, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DominioAdminService } from '../../../../core/services/admin/dominio-admin.service';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { Tenant } from '../../../../shared/models/admin/tenant.model';
import { AdminLoadingSpinnerComponent } from '../../../../shared/components/admin/loading-spinner.component';
import { SearchableSelectComponent, SSOption } from '../../../../shared/components/searchable-select.component';

@Component({
  selector: 'app-dominio-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AdminLoadingSpinnerComponent, SearchableSelectComponent],
  template: `
    <nav class="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
      <a routerLink="/dominios" class="hover:text-[#007832] transition-colors">Gestión de Dominios</a>
      <span>/</span>
      <span class="text-gray-600 font-medium">{{ modoEdicion() ? 'Editar dominio' : 'Nuevo dominio' }}</span>
    </nav>

    <div class="max-w-xl">
      <h1 class="text-2xl font-bold text-gray-900 tracking-tight mb-1">{{ modoEdicion() ? 'Editar Dominio' : 'Nuevo Dominio' }}</h1>
      <p class="text-sm text-gray-400 mb-6">
        {{ modoEdicion() ? 'Modifica la configuración del subdominio' : 'Registra un nuevo subdominio para un tenant' }}
      </p>

      @if (cargando()) {
        <app-admin-loading-spinner mensaje="Cargando datos..." />
      } @else {
        <form [formGroup]="form" (ngSubmit)="guardar()"
          class="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

          <div>
            <label class="form-label">Tenant <span class="text-red-500">*</span></label>
            <app-ss [options]="tenantOptions()" placeholder="Selecciona un tenant"
                    formControlName="tenantId"></app-ss>
            @if (form.controls['tenantId'].invalid && form.controls['tenantId'].touched) {
              <p class="form-error">Debes seleccionar un tenant</p>
            }
          </div>

          <div>
            <label class="form-label">Subdominio <span class="text-red-500">*</span></label>
            <input formControlName="subdominio" type="text" class="form-input" placeholder="ej. huila.epsas.sena.edu.co" />
            <p class="text-xs text-gray-400 mt-1">Ingresa el subdominio completo asignado al tenant.</p>
            @if (form.controls['subdominio'].invalid && form.controls['subdominio'].touched) {
              <p class="form-error">El subdominio es obligatorio</p>
            }
          </div>

          <div class="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
            <div>
              <p class="text-sm font-semibold text-gray-800">Certificado SSL</p>
              <p class="text-xs text-gray-500 mt-0.5">Habilitar HTTPS para este subdominio</p>
            </div>
            <button type="button" (click)="toggleSSL()"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
              [style.background]="form.controls['ssl'].value ? '#39A900' : '#d1d5db'">
              <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                [class.translate-x-6]="form.controls['ssl'].value"
                [class.translate-x-1]="!form.controls['ssl'].value">
              </span>
            </button>
          </div>

          @if (modoEdicion()) {
            <div>
              <label class="form-label">Estado</label>
              <app-ss [options]="estadoOptions" formControlName="estado"></app-ss>
            </div>
          }

          <div class="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <a routerLink="/dominios"
              class="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </a>
            <button type="submit" [disabled]="guardando() || form.invalid"
              class="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style="background:#39A900;">
              @if (guardando()) { Guardando... } @else { {{ modoEdicion() ? 'Guardar cambios' : 'Registrar dominio' }} }
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .form-label { display:block; font-size:11px; font-weight:700; color:#374151; margin-bottom:6px; text-transform:uppercase; letter-spacing:.4px; }
    .form-input { width:100%; padding:9px 12px; border:1.5px solid #e5e7eb; border-radius:10px; font-size:13px; color:#1f2937; outline:none; transition:border-color .15s; }
    .form-input:focus { border-color:#39A900; }
    .form-error { font-size:11px; color:#dc2626; margin-top:4px; }
  `],
})
export class DominioFormComponent {
  private readonly dominioService = inject(DominioAdminService);
  private readonly tenantService  = inject(TenantAdminService);
  private readonly toast          = inject(AdminToastService);
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly fb             = inject(FormBuilder);

  readonly cargando    = signal(false);
  readonly guardando   = signal(false);
  readonly tenants     = signal<Tenant[]>([]);
  readonly dominioId   = signal<string | null>(null);
  readonly modoEdicion = computed(() => !!this.dominioId());

  readonly tenantOptions = computed<SSOption[]>(() =>
    this.tenants().map((t) => ({ value: t.id, label: t.nombre }))
  );

  readonly estadoOptions: SSOption[] = [
    { value: 'activo',    label: 'Activo' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'inactivo',  label: 'Inactivo' },
  ];

  readonly form = this.fb.group({
    tenantId:   ['', Validators.required],
    subdominio: ['', Validators.required],
    ssl:        [false],
    estado:     ['pendiente'],
  });

  constructor() {
    this.tenantService.obtenerTodos().subscribe({ next: (data) => this.tenants.set(data) });
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.dominioId.set(id);
      this.cargando.set(true);
      this.dominioService.obtenerPorId(id).subscribe({
        next: (d) => {
          this.form.patchValue({ tenantId: d.tenantId, subdominio: d.subdominio, ssl: d.ssl, estado: d.estado });
          this.cargando.set(false);
        },
        error: () => { this.cargando.set(false); this.toast.error('No se pudo cargar el dominio.'); this.router.navigate(['/dominios']); },
      });
    }
  }

  toggleSSL(): void {
    const ctrl = this.form.controls['ssl'];
    ctrl.setValue(!ctrl.value);
  }

  guardar(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.guardando.set(true);
    const raw = this.form.getRawValue();
    const dto = {
      tenantId:   raw.tenantId!,
      subdominio: raw.subdominio!,
      ssl:        raw.ssl ?? false,
      estado:     (raw.estado as 'activo' | 'inactivo' | 'pendiente') ?? 'pendiente',
    };
    const op$ = this.modoEdicion()
      ? this.dominioService.actualizar(this.dominioId()!, dto)
      : this.dominioService.crear(dto);
    op$.subscribe({
      next: () => {
        this.guardando.set(false);
        this.toast.success(this.modoEdicion() ? 'Dominio actualizado.' : 'Dominio registrado correctamente.');
        this.router.navigate(['/dominios']);
      },
      error: () => { this.guardando.set(false); this.toast.error('Error al guardar el dominio.'); },
    });
  }
}
