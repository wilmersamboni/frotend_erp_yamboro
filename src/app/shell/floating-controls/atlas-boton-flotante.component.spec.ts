import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AtlasBotonFlotanteComponent, MARGEN_INFERIOR, MARGEN_SUPERIOR, limitarTop } from './atlas-boton-flotante.component';

describe('limitarTop', () => {
  it('deja pasar una posición válida', () => {
    expect(limitarTop(400, 800)).toBe(400);
  });

  it('no sube por encima de la barra superior', () => {
    expect(limitarTop(10, 800)).toBe(MARGEN_SUPERIOR);
    expect(limitarTop(-500, 800)).toBe(MARGEN_SUPERIOR);
  });

  it('no baja sobre el botón "Escanear" ni el borde inferior', () => {
    expect(limitarTop(790, 800)).toBe(800 - MARGEN_INFERIOR);
  });

  it('con una ventana muy baja queda en el mínimo en vez de salirse', () => {
    expect(limitarTop(300, 200)).toBe(MARGEN_SUPERIOR);
  });
});

describe('AtlasBotonFlotanteComponent', () => {
  let fixture: ComponentFixture<AtlasBotonFlotanteComponent>;
  let el: HTMLElement;

  const boton = () => el.querySelector('.atlas-fab-btn') as HTMLButtonElement;
  const contenedor = () => el.querySelector('.atlas-fab') as HTMLElement | null;
  const topActual = () => parseFloat(contenedor()!.style.top);

  function puntero(tipo: string, y: number, id = 1): void {
    boton().dispatchEvent(new PointerEvent(tipo, { pointerId: id, clientY: y, clientX: 10, button: 0, bubbles: true }));
    fixture.detectChanges();
  }

  function crear(): void {
    fixture = TestBed.createComponent(AtlasBotonFlotanteComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    TestBed.configureTestingModule({ imports: [AtlasBotonFlotanteComponent] });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('nace en el 75 % de la altura de la ventana', () => {
    crear();
    expect(topActual()).toBe(Math.round(0.75 * 800));
  });

  it('no se dibuja cuando `visible` es false', () => {
    crear();
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    expect(contenedor()).toBeNull();
  });

  it('el contenedor deja pasar el puntero: solo el botón lo recibe (sin zonas muertas alrededor)', () => {
    crear();
    // jsdom no aplica la hoja de estilos del componente, así que se comprueba en el propio CSS.
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
    const regla = (selector: string) => new RegExp(`\\.${selector}(\\[[^\\]]*\\])*\\s*\\{[^}]*pointer-events:\\s*(\\w+)`);
    expect(css.match(regla('atlas-fab'))?.[2]).toBe('none');
    expect(css.match(regla('atlas-fab-btn'))?.[2]).toBe('auto');
  });

  it('un toque (sin mover) abre el chat', () => {
    crear();
    const abrir = vi.fn();
    fixture.componentInstance.abrir.subscribe(abrir);
    puntero('pointerdown', 400);
    puntero('pointerup', 402); // 2 px: por debajo del umbral
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(topActual()).toBe(Math.round(0.75 * 800));
  });

  it('un arrastre vertical mueve el botón, NO abre el chat y guarda la posición', () => {
    crear();
    const abrir = vi.fn();
    fixture.componentInstance.abrir.subscribe(abrir);
    const inicio = topActual();

    puntero('pointerdown', 500);
    puntero('pointermove', 440);
    expect(contenedor()?.classList.contains('arrastrando')).toBe(true);
    expect(topActual()).toBe(inicio - 60);

    puntero('pointerup', 440);
    expect(abrir).not.toHaveBeenCalled();
    expect(contenedor()?.classList.contains('arrastrando')).toBe(false);
    expect(parseFloat(localStorage.getItem('atlas-boton-posicion') ?? '')).toBeCloseTo((inicio - 60) / 800, 5);
  });

  it('el arrastre respeta los límites (no tapa la barra superior ni el botón Escanear)', () => {
    crear();
    puntero('pointerdown', 500);
    puntero('pointermove', -2000);
    expect(topActual()).toBe(MARGEN_SUPERIOR);
    puntero('pointermove', 5000);
    expect(topActual()).toBe(800 - MARGEN_INFERIOR);
    puntero('pointerup', 5000);
  });

  it('ignora punteros que no son el que empezó el arrastre', () => {
    crear();
    puntero('pointerdown', 500, 1);
    puntero('pointermove', 300, 2);
    expect(topActual()).toBe(Math.round(0.75 * 800));
    puntero('pointerup', 300, 1);
  });

  it('recuerda la posición entre visitas', () => {
    localStorage.setItem('atlas-boton-posicion', '0.3');
    crear();
    expect(topActual()).toBe(Math.round(0.3 * 800));
  });

  it('una posición guardada inválida se ignora', () => {
    localStorage.setItem('atlas-boton-posicion', 'basura');
    crear();
    expect(topActual()).toBe(Math.round(0.75 * 800));
  });

  it('se puede mover con las flechas del teclado (alternativa accesible al arrastre)', () => {
    crear();
    const inicio = topActual();
    boton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(topActual()).toBe(inicio - 32);
    boton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    boton().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(topActual()).toBe(inicio + 32);
  });

  it('Enter/Espacio (clic sin posición) abren el chat; el clic de ratón no se cuenta dos veces', () => {
    crear();
    const abrir = vi.fn();
    fixture.componentInstance.abrir.subscribe(abrir);
    boton().click(); // detail 0 = teclado
    expect(abrir).toHaveBeenCalledTimes(1);
    boton().dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true })); // el que sigue a un puntero
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('al acercar el puntero o el foco avisa para precargar el 3D', () => {
    crear();
    const intencion = vi.fn();
    fixture.componentInstance.intencion.subscribe(intencion);
    boton().dispatchEvent(new Event('pointerenter'));
    expect(intencion).toHaveBeenCalledTimes(1);
    boton().dispatchEvent(new Event('focus'));
    expect(intencion).toHaveBeenCalledTimes(2);
  });

  it('al cambiar el tamaño de la ventana se vuelve a encajar entre los márgenes', () => {
    crear();
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();
    expect(topActual()).toBe(400 - MARGEN_INFERIOR);
  });

  it('"Ocultar" lo quita hasta recargar: una instancia nueva vuelve a mostrarlo', () => {
    crear();
    (el.querySelector('.ocultar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(contenedor()).toBeNull();
    expect(sessionStorage.getItem('atlas-boton-oculto')).toBeNull();

    fixture.destroy();
    crear();
    expect(contenedor()).not.toBeNull();
  });

  it('muestra el punto de "Atlas respondió" solo cuando hay una respuesta pendiente', () => {
    crear();
    expect(el.querySelector('.pendiente')).toBeNull();
    fixture.componentRef.setInput('pendiente', true);
    fixture.detectChanges();
    expect(el.querySelector('.pendiente')).not.toBeNull();
  });

  it('tiene nombre accesible y su cara es la mascota 3D de Atlas', () => {
    crear();
    expect(boton().getAttribute('aria-label')).toBe('Abrir el chat con Atlas');
    expect(boton().querySelector('app-atlas-mascota.atlas-3d')).not.toBeNull();
  });
});
