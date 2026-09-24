import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgxSonnerToaster, toast } from 'ngx-sonner';
import { ToastService, traducirErrorHttp } from './toast.service';
import { ConfirmService } from './confirm.service';

@Component({ standalone: true, imports: [NgxSonnerToaster], template: '<ngx-sonner-toaster />' })
class HostComponent {}

// jsdom no trae estas APIs del navegador que usan Sonner y el CDK.
if (!window.matchMedia) {
  (window as any).matchMedia = (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  });
}
if (!(window as any).ResizeObserver) {
  (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!(Element.prototype as any).getAnimations) {
  (Element.prototype as any).getAnimations = () => [];
}

async function estabilizar(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  for (let i = 0; i < 6; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 15));
  }
}

const boton = (texto: string) =>
  (Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]).find((b) => b.textContent?.trim() === texto);

describe('Avisos (Sonner) y confirmaciones (Spartan)', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent] }));

  afterEach(() => {
    toast.dismiss();
    TestBed.resetTestingModule();
    document.body.innerHTML = '';
  });

  it('ToastService muestra título y detalle', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await estabilizar(fixture);
    TestBed.inject(ToastService).ok('Guardado', 'El registro fue procesado.', 60000);
    await estabilizar(fixture);
    expect(document.body.innerHTML).toContain('Guardado');
    expect(document.body.innerHTML).toContain('El registro fue procesado.');
  });

  it('ToastService con solo un mensaje lo usa como título', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await estabilizar(fixture);
    TestBed.inject(ToastService).warn('Revisa los datos', '', 60000);
    await estabilizar(fixture);
    expect(document.body.innerHTML).toContain('Revisa los datos');
  });

  it('ToastService.add acepta la forma antigua de MessageService', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await estabilizar(fixture);
    TestBed.inject(ToastService).add({ severity: 'success', summary: 'Eliminado', detail: 'Registro eliminado.', life: 60000 });
    await estabilizar(fixture);
    expect(document.body.innerHTML).toContain('Eliminado');
  });

  it('ConfirmService abre el diálogo y devuelve true al aceptar', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await estabilizar(fixture);
    const promesa = TestBed.inject(ConfirmService).ask('¿Eliminar la asignación?', {
      header: 'Eliminar asignación',
      acceptLabel: 'Eliminar',
    });
    await estabilizar(fixture);
    expect(document.body.innerHTML).toContain('¿Eliminar la asignación?');
    expect(document.body.innerHTML).toContain('Eliminar asignación');
    expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
    boton('Eliminar')!.click();
    await estabilizar(fixture);
    await expect(promesa).resolves.toBe(true);
  });

  it('ConfirmService devuelve false al cancelar', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await estabilizar(fixture);
    const promesa = TestBed.inject(ConfirmService).ask('¿Continuar?', { rejectLabel: 'Volver' });
    await estabilizar(fixture);
    boton('Volver')!.click();
    await estabilizar(fixture);
    await expect(promesa).resolves.toBe(false);
  });

  it('ConfirmService.confirm ejecuta accept solo si se acepta (forma antigua de PrimeNG)', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await estabilizar(fixture);
    const accept = vi.fn();
    const reject = vi.fn();
    TestBed.inject(ConfirmService).confirm({
      message: '¿Restablecer permisos?',
      header: 'Restablecer permisos al rol',
      acceptButtonProps: { label: 'Sí, restablecer', severity: 'danger' },
      rejectButtonProps: { label: 'Cancelar' },
      accept,
      reject,
    });
    await estabilizar(fixture);
    boton('Sí, restablecer')!.click();
    await estabilizar(fixture);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(reject).not.toHaveBeenCalled();
  });

  it('traduce los mensajes genéricos del servidor a español y respeta los propios', () => {
    expect(traducirErrorHttp('Conflict')).toContain('en uso');
    expect(traducirErrorHttp('Forbidden')).toContain('permiso');
    expect(traducirErrorHttp('Internal server error')).toContain('servidor');
    expect(traducirErrorHttp('update or delete on table "lote" violates foreign key constraint "FK_x" on table "kardex"')).toContain('en uso');
    expect(traducirErrorHttp('La placa SENA ya está en uso por otro ítem')).toBe('La placa SENA ya está en uso por otro ítem');
  });

  it('un error con detalle "Conflict" se muestra traducido en el aviso', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await estabilizar(fixture);
    TestBed.inject(ToastService).error('No se pudo eliminar', 'Conflict', 60000);
    await estabilizar(fixture);
    expect(document.body.innerHTML).toContain('No se pudo eliminar');
    expect(document.body.innerHTML).toContain('el registro está en uso');
    expect(document.body.innerHTML).not.toContain('>Conflict<');
  });
});
