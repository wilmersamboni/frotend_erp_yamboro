import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DURACION_TRANSITORIO } from './atlas-estados';
import { AtlasMascotaComponent, precargarEscenaAtlas } from './atlas-mascota.component';

describe('AtlasMascotaComponent', () => {
  let fixture: ComponentFixture<AtlasMascotaComponent>;
  let el: HTMLElement;

  const estadoDelOrbe = () => el.querySelector('.orbe')?.getAttribute('data-estado');

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [AtlasMascotaComponent] }).compileComponents();
    fixture = TestBed.createComponent(AtlasMascotaComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('sin WebGL (como en jsdom) se queda con el orbe CSS y no intenta cargar la escena 3D', () => {
    expect(el.querySelector('.escenario')?.classList.contains('listo')).toBe(false);
    expect(el.querySelector('.orbe .visor .ojo')).not.toBeNull();
  });

  it('es decorativa para los lectores de pantalla', () => {
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('arranca saludando y vuelve a reposo cuando termina el saludo', () => {
    expect(estadoDelOrbe()).toBe('saludo');
    vi.advanceTimersByTime(DURACION_TRANSITORIO.saludo * 1000 + 100);
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('reposo');
  });

  it('pensar(true) la pone a pensar y pensar(false) la devuelve a reposo', () => {
    vi.advanceTimersByTime(5000);
    fixture.componentInstance.pensar(true);
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('pensando');

    fixture.componentInstance.pensar(false);
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('reposo');
  });

  it('celebrar() la pone feliz un rato y luego regresa al estado anterior (pensando si seguía pensando)', () => {
    vi.advanceTimersByTime(5000);
    fixture.componentInstance.pensar(true);
    fixture.componentInstance.celebrar();
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('feliz');

    vi.advanceTimersByTime(DURACION_TRANSITORIO.feliz * 1000 + 100);
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('pensando');
  });

  it('fallar() la pone en estado de error', () => {
    vi.advanceTimersByTime(5000);
    fixture.componentInstance.fallar();
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('error');
  });

  it('un toque la pone feliz, y toques seguidos muy juntos no reinician la animación', () => {
    vi.advanceTimersByTime(5000);
    const escenario = el.querySelector('.escenario') as HTMLElement;
    escenario.dispatchEvent(new Event('pointerdown'));
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('feliz');

    vi.advanceTimersByTime(DURACION_TRANSITORIO.feliz * 1000 + 100);
    fixture.detectChanges();
    expect(estadoDelOrbe()).toBe('reposo');
  });

  it('cada cambio de `compacta` llega a la escena 3D aunque la escena se creara después del primer efecto (el robot no debe quedarse recortado)', () => {
    // La escena real se crea de forma asíncrona, DESPUÉS de que el efecto corrió por primera vez con escena = null.
    const escena = { compacta: vi.fn(), destruir: vi.fn() };
    (fixture.componentInstance as unknown as { escena: unknown }).escena = escena;

    fixture.componentRef.setInput('compacta', true);
    fixture.detectChanges();
    expect(escena.compacta).toHaveBeenLastCalledWith(true);

    fixture.componentRef.setInput('compacta', false);
    fixture.detectChanges();
    expect(escena.compacta).toHaveBeenLastCalledWith(false);
  });

  it('`activa`=false pausa la escena (un chat oculto no gasta GPU ni batería) y `activa`=true la reanuda', () => {
    const escena = { compacta: vi.fn(), pausar: vi.fn(), iniciar: vi.fn(), destruir: vi.fn() };
    (fixture.componentInstance as unknown as { escena: unknown }).escena = escena;

    fixture.componentRef.setInput('activa', false);
    fixture.detectChanges();
    expect(escena.pausar).toHaveBeenCalled();
    expect(escena.iniciar).not.toHaveBeenCalled();

    fixture.componentRef.setInput('activa', true);
    fixture.detectChanges();
    expect(escena.iniciar).toHaveBeenCalled();
  });

  it('en modo avatar el host lleva la clase `avatar` (disco de contraste detrás del robot)', () => {
    expect(el.classList.contains('avatar')).toBe(false);
    fixture.componentRef.setInput('compacta', true);
    fixture.detectChanges();
    expect(el.classList.contains('avatar')).toBe(true);
  });

  it('precargarEscenaAtlas devuelve siempre la misma promesa: el código 3D se descarga una sola vez', () => {
    expect(precargarEscenaAtlas()).toBe(precargarEscenaAtlas());
  });

  it('destruirla con un temporizador pendiente no deja nada vivo que falle después', () => {
    const limpiar = vi.spyOn(globalThis, 'clearTimeout');
    fixture.componentInstance.celebrar();
    fixture.destroy();
    expect(limpiar).toHaveBeenCalled();
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});
