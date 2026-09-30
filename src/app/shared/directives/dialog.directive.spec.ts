import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmService } from '../../core/services/confirm.service';
import { UnsavedChangesService } from '../../core/services/unsaved-changes.service';
import { DialogDirective } from './dialog.directive';

@Component({
  standalone: true,
  imports: [DialogDirective],
  template: `
    <button id="abrir" (click)="abierto.set(true)">Abrir</button>
    @if (abierto()) {
      <div appDialog [dialogGuard]="guardar()" class="fondo" (click)="abierto.set(false)">
        <div class="panel" (click)="$event.stopPropagation()">
          <h2>Título del modal</h2>
          <input id="uno" />
          <input id="buscar" type="search" />
          <button id="chip" data-dirty type="button">Chip</button>
          <button id="ultimo" (click)="abierto.set(false)">Cancelar</button>
        </div>
      </div>
    }
  `,
})
class HostComponent {
  abierto = signal(false);
  guardar = signal(true);
}

describe('DialogDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let preguntas: number;
  let respuesta: boolean;
  const q = <T extends HTMLElement>(sel: string) => fixture.nativeElement.querySelector(sel) as T;
  const escribir = (sel: string, tipo = 'input') =>
    q(sel).dispatchEvent(new Event(tipo, { bubbles: true }));
  const esperar = async () => { fixture.detectChanges(); await fixture.whenStable(); await Promise.resolve(); fixture.detectChanges(); };

  beforeEach(async () => {
    // jsdom no calcula layout: se considera visible todo lo que esté en el DOM.
    Object.defineProperty(HTMLElement.prototype, 'getClientRects', { configurable: true, value: () => [{}] });
    preguntas = 0;
    respuesta = true;
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: ConfirmService, useValue: { ask: () => { preguntas++; return Promise.resolve(respuesta); } } }],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  async function abrir() {
    q<HTMLButtonElement>('#abrir').focus();
    q<HTMLButtonElement>('#abrir').click();
    await esperar();
  }

  describe('accesibilidad y foco', () => {
    it('marca el panel como diálogo modal, lo nombra con su título y le da el foco', async () => {
      await abrir();
      const panel = q('.panel');
      expect(panel.getAttribute('role')).toBe('dialog');
      expect(panel.getAttribute('aria-modal')).toBe('true');
      expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toContain('Título del modal');
      expect(document.activeElement).toBe(panel);
    });

    it('atrapa Tab: del último control vuelve al primero, y Shift+Tab desde el panel va al último', async () => {
      await abrir();
      q<HTMLElement>('#ultimo').focus();
      q('.fondo').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(q('#uno'));

      q<HTMLElement>('.panel').focus();
      q('.fondo').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(q('#ultimo'));
    });

    it('Escape cierra pulsando "Cancelar", y el foco vuelve al botón que abrió el modal', async () => {
      await abrir();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await esperar();
      expect(q('.fondo')).toBeNull();
      expect(document.activeElement).toBe(q('#abrir'));
    });
  });

  describe('cambios sin guardar', () => {
    it('sin haber tocado nada, Cancelar y el fondo cierran sin preguntar', async () => {
      await abrir();
      q<HTMLButtonElement>('#ultimo').click();
      await esperar();
      expect(q('.fondo')).toBeNull();
      expect(preguntas).toBe(0);

      await abrir();
      q('.fondo').click();
      await esperar();
      expect(q('.fondo')).toBeNull();
      expect(preguntas).toBe(0);
    });

    it('tras escribir, Cancelar pregunta; si el usuario dice "seguir editando", el modal sigue abierto', async () => {
      await abrir();
      escribir('#uno');
      respuesta = false;
      q<HTMLButtonElement>('#ultimo').click();
      await esperar();
      expect(preguntas).toBe(1);
      expect(q('.fondo')).not.toBeNull();
    });

    it('tras escribir, Cancelar pregunta; si acepta descartar, se cierra', async () => {
      await abrir();
      escribir('#uno');
      respuesta = true;
      q<HTMLButtonElement>('#ultimo').click();
      await esperar();
      expect(preguntas).toBe(1);
      expect(q('.fondo')).toBeNull();
    });

    it('un clic en el fondo o Escape también preguntan cuando hay cambios', async () => {
      await abrir();
      escribir('#uno');
      respuesta = false;
      q('.fondo').click();
      await esperar();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await esperar();
      expect(preguntas).toBe(2);
      expect(q('.fondo')).not.toBeNull();
    });

    it('un clic dentro del panel (no de cierre) no pregunta', async () => {
      await abrir();
      escribir('#uno');
      q('.panel').click();
      await esperar();
      expect(preguntas).toBe(0);
    });

    it('un control marcado con data-dirty cuenta como cambio, y una búsqueda (type=search) no', async () => {
      await abrir();
      escribir('#buscar');
      q<HTMLButtonElement>('#ultimo').click();
      await esperar();
      expect(preguntas).toBe(0);           // solo buscó: cierra sin preguntar

      await abrir();
      q<HTMLButtonElement>('#chip').click();
      respuesta = false;
      q<HTMLButtonElement>('#ultimo').click();
      await esperar();
      expect(preguntas).toBe(1);
    });

    it('con [dialogGuard]="false" no pregunta (el componente lo hace por su cuenta)', async () => {
      fixture.componentInstance.guardar.set(false);
      await abrir();
      escribir('#uno');
      q<HTMLButtonElement>('#ultimo').click();
      await esperar();
      expect(preguntas).toBe(0);
      expect(q('.fondo')).toBeNull();
    });

    it('avisa también al cambiar de pantalla o cerrar la pestaña, y deja de avisar al cerrarse', async () => {
      const servicio = TestBed.inject(UnsavedChangesService);
      await abrir();
      expect(servicio.hayCambios()).toBe(false);
      escribir('#uno');
      expect(servicio.hayCambios()).toBe(true);

      respuesta = true;
      q<HTMLButtonElement>('#ultimo').click();
      await esperar();
      expect(servicio.hayCambios()).toBe(false);
    });
  });
});
