import { Component, EventEmitter, Input, Output, signal } from '@angular/core';

@Component({
  selector: 'app-admin-credenciales-modal',
  standalone: true,
  template: `
    @if (visible) {
      <div class="fixed inset-0 z-[1090] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.55);">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

          <div class="px-5 pt-5 pb-3 flex items-center justify-between border-b border-gray-100">
            <div class="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <h5 class="text-base font-bold text-gray-900">{{ titulo }}</h5>
            </div>
            <button type="button" (click)="onCerrar()" class="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mx-5 mt-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
            <svg class="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p class="text-xs text-amber-700 leading-relaxed">
              <strong>Guarda estas credenciales ahora.</strong>
              La contraseña no se podrá recuperar después de cerrar este diálogo.
            </p>
          </div>

          <div class="px-5 py-4 space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Usuario / Login</label>
              <div class="flex items-center gap-2">
                <code class="flex-1 text-sm px-3 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-mono truncate">{{ login }}</code>
                <button type="button" (click)="copiar(login, 'login')"
                  class="shrink-0 text-xs font-semibold px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                  [class.text-green-600]="copiadoLogin()"
                  [class.text-gray-600]="!copiadoLogin()">
                  {{ copiadoLogin() ? '✓ Copiado' : 'Copiar' }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Contraseña</label>
              <div class="flex items-center gap-2">
                <code class="flex-1 text-sm px-3 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-mono truncate tracking-widest">
                  {{ mostrarPassword() ? password : '••••••••••••' }}
                </code>
                <button type="button" (click)="mostrarPassword.set(!mostrarPassword())"
                  class="shrink-0 px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500"
                  [title]="mostrarPassword() ? 'Ocultar' : 'Mostrar'">
                  @if (mostrarPassword()) {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  } @else {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  }
                </button>
                <button type="button" (click)="copiar(password, 'password')"
                  class="shrink-0 text-xs font-semibold px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                  [class.text-green-600]="copiadoPassword()"
                  [class.text-gray-600]="!copiadoPassword()">
                  {{ copiadoPassword() ? '✓ Copiado' : 'Copiar' }}
                </button>
              </div>
            </div>
          </div>

          <div class="px-5 pb-5 pt-1 flex justify-end">
            <button type="button" (click)="onCerrar()"
              class="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90"
              style="background:#39A900;">
              Entendido, ya guardé las credenciales
            </button>
          </div>

        </div>
      </div>
    }
  `,
})
export class AdminCredencialesModalComponent {
  @Input() visible = false;
  @Input() titulo  = 'Credenciales del Tenant';
  @Input() login   = '';
  @Input() password = '';

  @Output() cerrar = new EventEmitter<void>();

  readonly mostrarPassword  = signal(false);
  readonly copiadoLogin     = signal(false);
  readonly copiadoPassword  = signal(false);

  onCerrar(): void {
    this.mostrarPassword.set(false);
    this.cerrar.emit();
  }

  copiar(texto: string, campo: 'login' | 'password'): void {
    navigator.clipboard.writeText(texto).then(() => {
      if (campo === 'login') {
        this.copiadoLogin.set(true);
        setTimeout(() => this.copiadoLogin.set(false), 2000);
      } else {
        this.copiadoPassword.set(true);
        setTimeout(() => this.copiadoPassword.set(false), 2000);
      }
    });
  }
}
