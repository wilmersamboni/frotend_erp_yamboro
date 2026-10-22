import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { ChatMovilComponent } from './chat-movil.component';

describe('ChatMovilComponent', () => {
  let fixture: ComponentFixture<ChatMovilComponent>;
  let linkManifest: HTMLLinkElement;
  let linkApple: HTMLLinkElement;
  let linkIcono: HTMLLinkElement;

  const cargo = signal('aprendiz');
  const esAdmin = signal(false);
  const chat = {
    sendMessage: vi.fn(),
    obtenerHistorialReciente: vi.fn(),
    resetSession: vi.fn(),
    adoptarSession: vi.fn(),
  };
  const auth = {
    user: signal<{ nombre?: string } | null>({ nombre: 'Ana María Pérez' }),
    cargo,
    isAdmin: esAdmin,
    logout: vi.fn(),
  };

  beforeEach(() => {
    cargo.set('aprendiz');
    esAdmin.set(false);
    chat.sendMessage.mockReset().mockReturnValue(of({ reply: 'Respuesta de prueba' }));
    chat.obtenerHistorialReciente.mockReset().mockReturnValue(of(null));
    chat.resetSession.mockReset();
    chat.adoptarSession.mockReset();
    auth.logout.mockReset();

    linkManifest = document.createElement('link');
    linkManifest.rel = 'manifest';
    linkManifest.setAttribute('href', 'manifest.webmanifest');
    document.head.appendChild(linkManifest);

    linkApple = document.createElement('link');
    linkApple.rel = 'apple-touch-icon';
    linkApple.setAttribute('href', '/icons/icon-192x192.png');
    document.head.appendChild(linkApple);

    linkIcono = document.createElement('link');
    linkIcono.rel = 'icon';
    linkIcono.setAttribute('type', 'image/x-icon');
    linkIcono.setAttribute('href', '/img/logo.ico');
    document.head.appendChild(linkIcono);

    TestBed.configureTestingModule({
      imports: [ChatMovilComponent],
      providers: [
        provideRouter([]),
        { provide: ChatService, useValue: chat },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  afterEach(() => {
    linkManifest.remove();
    linkApple.remove();
    linkIcono.remove();
    vi.useRealTimers();
  });

  async function montar(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ChatMovilComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function escribir(el: HTMLElement, valor: string): void {
    const campo = el.querySelector('textarea') as HTMLTextAreaElement;
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function enviarFormulario(el: HTMLElement): void {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }

  it('muestra el saludo de Atlas y el nombre de pila del usuario', async () => {
    const el = await montar();
    expect(el.textContent).toContain('Soy Atlas');
    expect(el.querySelector('.titulos p')?.textContent).toContain('Hola, Ana');
    expect(el.querySelector('.titulos p')?.textContent).not.toContain('Pérez');
  });

  it('ofrece sugerencias distintas según el rol, solo con preguntas que ese rol puede hacer', async () => {
    let el = await montar();
    let chips = Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim());
    expect(chips).toEqual(['¿Qué horario tengo hoy?', '¿Qué ambientes están libres ahora?']);
    fixture.destroy();

    cargo.set('instructor');
    el = await montar();
    chips = Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim());
    expect(chips).toContain('¿Tengo solicitudes de material pendientes?');
    fixture.destroy();

    cargo.set('administrador');
    esAdmin.set(true);
    el = await montar();
    chips = Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim());
    expect(chips).toContain('¿Qué clases no han iniciado hoy?');
    expect(chips).not.toContain('¿Qué horario tengo hoy?');
  });

  it('envía el mensaje recortado, lo muestra con la respuesta y oculta las sugerencias', async () => {
    const el = await montar();
    escribir(el, '  ¿Qué horario tengo hoy?  ');
    enviarFormulario(el);

    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith('¿Qué horario tengo hoy?');
    expect(el.querySelector('.burbuja.usuario')?.textContent).toContain('¿Qué horario tengo hoy?');
    expect(el.textContent).toContain('Respuesta de prueba');
    expect(el.querySelectorAll('.chip').length).toBe(0);
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('una sugerencia se envía al tocarla', async () => {
    const el = await montar();
    (el.querySelector('.chip') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith('¿Qué horario tengo hoy?');
  });

  it('no envía mensajes vacíos y el botón queda deshabilitado', async () => {
    const el = await montar();
    escribir(el, '   ');
    enviarFormulario(el);
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect((el.querySelector('.enviar') as HTMLButtonElement).disabled).toBe(true);
  });

  it('mientras espera respuesta muestra "escribiendo" y no deja enviar otro mensaje', async () => {
    const respuesta = new Subject<{ reply: string }>();
    chat.sendMessage.mockReturnValue(respuesta);
    const el = await montar();

    escribir(el, 'primero');
    enviarFormulario(el);
    expect(el.querySelector('.escribiendo')).not.toBeNull();

    escribir(el, 'segundo');
    enviarFormulario(el);
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);

    respuesta.next({ reply: 'listo' });
    respuesta.complete();
    fixture.detectChanges();
    expect(el.querySelector('.escribiendo')).toBeNull();
    expect(el.textContent).toContain('listo');
  });

  it('avisa que puede tardar si la respuesta se demora', async () => {
    const respuesta = new Subject<{ reply: string }>();
    chat.sendMessage.mockReturnValue(respuesta);
    const el = await montar();

    vi.useFakeTimers();
    escribir(el, 'hola');
    enviarFormulario(el);
    expect(el.querySelector('.aviso')).toBeNull();

    vi.advanceTimersByTime(8000);
    fixture.detectChanges();
    expect(el.querySelector('.aviso')?.textContent).toContain('puede tardar');

    respuesta.next({ reply: 'ya' });
    respuesta.complete();
    fixture.detectChanges();
    expect(el.querySelector('.aviso')).toBeNull();
  });

  it('si el backend falla muestra un error y permite reintentar', async () => {
    chat.sendMessage.mockReturnValue(throwError(() => new Error('boom')));
    const el = await montar();
    escribir(el, 'hola');
    enviarFormulario(el);

    expect(el.textContent).toContain('Ocurrió un error, intenta de nuevo.');
    expect(el.querySelector('.escribiendo')).toBeNull();

    chat.sendMessage.mockReturnValue(of({ reply: 'ahora sí' }));
    escribir(el, 'otra vez');
    enviarFormulario(el);
    expect(el.textContent).toContain('ahora sí');
  });

  it('una respuesta con HTML no crea elementos: se muestra como texto (XSS)', async () => {
    chat.sendMessage.mockReturnValue(of({ reply: '<img src=x onerror="window.__xss=1"> **hola**' }));
    const el = await montar();
    escribir(el, 'prueba');
    enviarFormulario(el);

    const burbujas = el.querySelectorAll('.burbuja.asistente');
    const ultima = burbujas[burbujas.length - 1];

    expect(el.querySelector('img')).toBeNull();
    expect(ultima.textContent).toContain('<img src=x onerror="window.__xss=1">');
    expect(ultima.querySelector('strong')?.textContent).toBe('hola');
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('retoma la última conversación: adopta la sesión y muestra los mensajes con formato', async () => {
    chat.obtenerHistorialReciente.mockReturnValue(
      of({
        sessionId: 'sesion-previa',
        mensajes: [
          { rol: 'usuario', contenido: 'hola' },
          { rol: 'asistente', contenido: '**qué tal**' },
        ],
      }),
    );
    const el = await montar();

    expect(chat.adoptarSession).toHaveBeenCalledExactlyOnceWith('sesion-previa');
    expect(el.querySelector('.burbuja.usuario')?.textContent).toContain('hola');
    expect(el.querySelector('.asistente strong')?.textContent).toBe('qué tal');
    expect(el.querySelectorAll('.chip').length).toBe(0);
  });

  it('"Nueva conversación" reinicia la sesión y vuelve al saludo', async () => {
    const el = await montar();
    escribir(el, 'hola');
    enviarFormulario(el);

    (el.querySelector('.icono') as HTMLButtonElement).click();
    fixture.detectChanges();
    const opcion = Array.from(el.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')).find((o) =>
      o.textContent?.includes('Nueva conversación'),
    );
    opcion?.click();
    fixture.detectChanges();

    expect(chat.resetSession).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('.burbuja.usuario').length).toBe(0);
    expect(el.querySelector('.menu')).toBeNull();
  });

  it('"Cerrar sesión" llama al logout', async () => {
    const el = await montar();
    (el.querySelector('.icono') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('.menu .salir') as HTMLButtonElement).click();
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('muestra a Atlas grande al empezar y lo pasa a avatar de la cabecera cuando hay conversación', async () => {
    const el = await montar();
    const mascota = () => el.querySelector('app-atlas-mascota') as HTMLElement;
    expect(mascota().classList.contains('compacta')).toBe(false);
    expect(el.querySelector('.heroe-espacio')?.classList.contains('compacta')).toBe(false);

    escribir(el, 'hola');
    enviarFormulario(el);
    expect(mascota().classList.contains('compacta')).toBe(true);
    expect(el.querySelector('.heroe-espacio')?.classList.contains('compacta')).toBe(true);
  });

  it('con el teclado virtual abierto (campo enfocado y área visible reducida) la mascota pasa a avatar, y vuelve al cerrarlo', async () => {
    const visor = Object.assign(new EventTarget(), { height: 760, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { value: visor, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    try {
      const el = await montar();
      const mascota = () => el.querySelector('app-atlas-mascota') as HTMLElement;
      const campo = el.querySelector('textarea') as HTMLTextAreaElement;
      expect(mascota().classList.contains('compacta')).toBe(false);

      // Área visible reducida SIN foco en el campo: no es el teclado (p. ej. la ventana aún se está dimensionando).
      visor.height = 300;
      visor.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(mascota().classList.contains('compacta')).toBe(false);

      campo.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      expect(mascota().classList.contains('compacta')).toBe(true);

      campo.dispatchEvent(new Event('blur'));
      visor.height = 760;
      visor.dispatchEvent(new Event('resize'));
      fixture.detectChanges();
      expect(mascota().classList.contains('compacta')).toBe(false);
    } finally {
      Reflect.deleteProperty(window, 'visualViewport');
      Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    }
  });

  it('retomar una conversación previa arranca con la mascota ya en modo avatar', async () => {
    chat.obtenerHistorialReciente.mockReturnValue(
      of({ sessionId: 's', mensajes: [{ rol: 'usuario', contenido: 'hola' }] }),
    );
    const el = await montar();
    expect(el.querySelector('app-atlas-mascota')?.classList.contains('compacta')).toBe(true);
  });

  it('mientras Atlas contesta la mascota piensa y el estado de la cabecera dice "pensando…"', async () => {
    const respuesta = new Subject<{ reply: string }>();
    chat.sendMessage.mockReturnValue(respuesta);
    const el = await montar();
    expect(el.querySelector('.estado')?.textContent).toContain('en línea');

    escribir(el, 'hola');
    enviarFormulario(el);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.estado')?.textContent).toContain('pensando…');
    expect(el.querySelector('.orbe')?.getAttribute('data-estado')).toBe('pensando');

    respuesta.next({ reply: 'listo' });
    respuesta.complete();
    fixture.detectChanges();
    expect(el.querySelector('.estado')?.textContent).toContain('en línea');
    expect(el.querySelector('.orbe')?.getAttribute('data-estado')).toBe('feliz');
  });

  it('si el backend falla la mascota se asusta (estado de error)', async () => {
    chat.sendMessage.mockReturnValue(throwError(() => new Error('boom')));
    const el = await montar();
    escribir(el, 'hola');
    enviarFormulario(el);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.orbe')?.getAttribute('data-estado')).toBe('error');
  });

  it('usa el manifiesto del chat mientras está abierto y restaura el original al salir', async () => {
    await montar();
    expect(linkManifest.getAttribute('href')).toBe('manifest-chat.webmanifest');

    fixture.destroy();
    expect(linkManifest.getAttribute('href')).toBe('manifest.webmanifest');
  });

  it('mientras está abierto la pestaña y el ícono de iOS son los de Atlas (no el logo del sistema), y se restauran al salir', async () => {
    await montar();
    expect(linkApple.getAttribute('href')).toBe('/icons/atlas-apple-180x180.png');
    expect(linkIcono.getAttribute('href')).toBe('/icons/atlas-favicon-64x64.png');
    expect(linkIcono.getAttribute('type')).toBe('image/png');

    fixture.destroy();
    expect(linkApple.getAttribute('href')).toBe('/icons/icon-192x192.png');
    expect(linkIcono.getAttribute('href')).toBe('/img/logo.ico');
    expect(linkIcono.getAttribute('type')).toBe('image/x-icon');
  });
});
