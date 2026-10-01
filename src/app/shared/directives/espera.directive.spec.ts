import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { EsperaDirective } from './espera.directive';

@Component({
  standalone: true,
  imports: [FormsModule, EsperaDirective],
  template: `
    <div><input id="q" [appEspera]="40" [(ngModel)]="texto" (ngModelChange)="cambios = cambios + 1" /></div>
    <p id="eco">{{ texto }}</p>
  `,
})
class HostComponent {
  texto = '';
  cambios = 0;
}

describe('EsperaDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let input: HTMLInputElement;
  const escribir = (v: string) => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const pasar = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector('#q');
  });

  it('no actualiza el modelo en cada tecla, solo al dejar de teclear, y una sola vez', async () => {
    escribir('a'); escribir('ab'); escribir('abc');
    expect(fixture.componentInstance.texto).toBe('');
    expect(fixture.componentInstance.cambios).toBe(0);
    expect(input.value).toBe('abc');               // el campo sí muestra lo que se escribe

    await pasar(90);
    expect(fixture.componentInstance.texto).toBe('abc');
    expect(fixture.componentInstance.cambios).toBe(1);
  });

  it('reinicia la espera con cada tecla', async () => {
    escribir('a');
    await pasar(25);
    escribir('ab');
    await pasar(25);
    expect(fixture.componentInstance.texto).toBe('');   // pasaron 50 ms en total pero no 40 desde la última tecla
    await pasar(50);
    expect(fixture.componentInstance.texto).toBe('ab');
  });

  it('Enter aplica de inmediato', () => {
    escribir('lote');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(fixture.componentInstance.texto).toBe('lote');
  });

  it('salir del campo aplica de inmediato, y sin nada pendiente no hace nada', () => {
    input.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.cambios).toBe(0);
    escribir('kit');
    input.dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.texto).toBe('kit');
    expect(fixture.componentInstance.cambios).toBe(1);
  });

  it('un cambio del modelo por código (limpiar el filtro) se refleja en el campo', async () => {
    fixture.componentInstance.texto = 'algo';
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('algo');
  });
});
