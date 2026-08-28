import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AdminAuthService } from '../../../core/admin-auth/admin-auth.service';
import { AdminToastService } from '../../../core/admin-auth/admin-toast.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Configuración</h1>
      <p class="text-sm text-gray-500 mt-1">Gestiona las preferencias del panel administrativo.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Perfil -->
      <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 font-semibold text-sm text-gray-800">Mi perfil</div>
        <div class="p-5">
          <div class="flex items-center gap-4 mb-5 pb-5 border-b border-gray-100">
            <div class="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
              style="background:#39A900;">
              {{ iniciales() }}
            </div>
            <div>
              <p class="font-semibold text-gray-900">{{ authService.currentUser()?.correo ?? '—' }}</p>
              <span class="inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mt-1 text-white" style="background:#39A900;">
                Administrador Root
              </span>
            </div>
          </div>

          <form [formGroup]="formCambioPassword" (ngSubmit)="cambiarPassword()" novalidate>
            <h3 class="text-sm font-bold text-gray-700 mb-4">Cambiar contraseña</h3>
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Contraseña actual</label>
                <input type="password" formControlName="passwordActual" placeholder="••••••••"
                  class="w-full text-sm rounded-xl border border-gray-200 outline-none px-3.5 py-2.5 focus:border-[#39A900] transition-colors" />
              </div>
              <div>
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Nueva contraseña</label>
                <input type="password" formControlName="passwordNuevo" placeholder="••••••••"
                  class="w-full text-sm rounded-xl border border-gray-200 outline-none px-3.5 py-2.5 focus:border-[#39A900] transition-colors" />
                @if (formCambioPassword.controls.passwordNuevo.invalid && formCambioPassword.controls.passwordNuevo.touched) {
                  <p class="text-xs text-red-500 mt-1">Mínimo 6 caracteres.</p>
                }
              </div>
              <div>
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Confirmar contraseña</label>
                <input type="password" formControlName="confirmar" placeholder="••••••••"
                  class="w-full text-sm rounded-xl border border-gray-200 outline-none px-3.5 py-2.5 focus:border-[#39A900] transition-colors" />
                @if (formCambioPassword.errors?.['noCoincide'] && formCambioPassword.controls.confirmar.touched) {
                  <p class="text-xs text-red-500 mt-1">Las contraseñas no coinciden.</p>
                }
              </div>
            </div>
            <div class="mt-4 flex justify-end">
              <button type="submit" [disabled]="guardando()"
                class="text-sm font-semibold px-4 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style="background:#39A900;">
                {{ guardando() ? 'Guardando...' : 'Actualizar contraseña' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Info del sistema -->
      <div class="space-y-4">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 font-semibold text-sm text-gray-800">Información del sistema</div>
          <div class="p-5 space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500">Versión</span>
              <span class="font-semibold text-gray-700">1.0.0</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Entorno</span>
              <span class="font-semibold text-gray-700">Desarrollo</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Backend</span>
              <span class="font-semibold text-gray-700">localhost:3000</span>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 font-semibold text-sm text-gray-800">Sesión</div>
          <div class="p-5">
            <p class="text-sm text-gray-500 mb-3">Sesión activa como administrador root. Al cerrar sesión, será redirigido al login.</p>
            <button type="button" (click)="cerrarSesion()"
              class="w-full text-sm font-semibold px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminSettingsComponent {
  readonly authService = inject(AdminAuthService);
  private readonly toast  = inject(AdminToastService);
  private readonly fb     = inject(FormBuilder);

  readonly guardando = signal(false);

  readonly iniciales = () => {
    const correo = this.authService.currentUser()?.correo ?? '';
    return correo.charAt(0).toUpperCase();
  };

  readonly formCambioPassword = this.fb.nonNullable.group(
    {
      passwordActual: ['', Validators.required],
      passwordNuevo:  ['', [Validators.required, Validators.minLength(6)]],
      confirmar:      ['', Validators.required],
    },
    {
      validators: (group) => {
        const a = group.get('passwordNuevo')?.value;
        const b = group.get('confirmar')?.value;
        return a && b && a !== b ? { noCoincide: true } : null;
      },
    },
  );

  cambiarPassword(): void {
    if (this.formCambioPassword.invalid) { this.formCambioPassword.markAllAsTouched(); return; }
    this.guardando.set(true);
    setTimeout(() => {
      this.guardando.set(false);
      this.toast.success('Contraseña actualizada correctamente.');
      this.formCambioPassword.reset();
    }, 1000);
  }

  cerrarSesion(): void { this.authService.logout(); }
}
