import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { ContactWidgetService } from '../../core/services/contact-widget.service';
import { FloatingButtons } from './floating-buttons';

describe('FloatingButtons (chat con Atlas dentro del ERP)', () => {
  let fixture: ComponentFixture<FloatingButtons>;
  let component: FloatingButtons;
  let el: HTMLElement;
  let widget: ContactWidgetService;

  const cargo = signal('aprendiz');
  const esAdmin = signal(false);
  const chat = {
    sendMessage: vi.fn(),
    obtenerHistorialReciente: vi.fn(),
    resetSession: vi.fn(),
    adoptarSession: vi.fn(),
  };
  const auth = { user: signal<{ id?: string } | null>(null), cargo, isAdmin: esAdmin };

  beforeEach(async () => {
    cargo.set('aprendiz');
    esAdmin.set(false);
    auth.user.set(null);
    chat.sendMessage.mockReset().mockReturnValue(of({ reply: 'Respuesta de prueba' }));
    chat.obtenerHistorialReciente.mockReset().mockReturnValue(of(null));
    chat.resetSession.mockReset();
    chat.adoptarSession.mockReset();

    await TestBed.configureTestingModule({
      imports: [FloatingButtons],
      providers: [
        { provide: ChatService, useValue: chat },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FloatingButtons);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    widget = TestBed.inject(ContactWidgetService);
    fixture.detectChanges();
  });

  function abrir(): void {
    widget.abrirChat();
    fixture.detectChanges();
  }

  function escribirYEnviar(texto: string): void {
    const campo = el.querySelector('textarea') as HTMLTextAreaElement;
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('.enviar') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('no dibuja nada hasta que se abre desde el sidebar, y la X lo oculta', () => {
    expect(el.querySelector('.chat-box')).toBeNull();
    abrir();
    expect(el.querySelector('.chat-box')).not.toBeNull();
    expect(el.querySelector('.chat-box')?.classList.contains('cerrado')).toBe(false);

    (el.querySelector('.cerrar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.chat-box')?.classList.contains('cerrado')).toBe(true);
  });

  it('cerrar NO destruye el panel: reabrir reutiliza el mismo DOM, la misma Atlas y la conversación (no hay que volver a crearlo todo)', () => {
    abrir();
    escribirYEnviar('hola');
    const panel = el.querySelector('.chat-box');
    const mascota = el.querySelector('app-atlas-mascota');
    const mensajes = el.querySelectorAll('.mensaje').length;

    widget.cerrarChat();
    fixture.detectChanges();
    expect(el.querySelector('.chat-box')?.classList.contains('cerrado')).toBe(true);

    widget.abrirChat();
    fixture.detectChanges();
    expect(el.querySelector('.chat-box')).toBe(panel);
    expect(el.querySelector('app-atlas-mascota')).toBe(mascota);
    expect(el.querySelectorAll('.mensaje').length).toBe(mensajes);
    expect(el.querySelector('.chat-box')?.classList.contains('cerrado')).toBe(false);
  });

  it('abre con Atlas grande, el saludo y las sugerencias del rol', () => {
    abrir();
    expect(el.querySelector('.mascota')?.classList.contains('compacta')).toBe(false);
    expect(el.textContent).toContain('Soy Atlas');
    expect(Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim())).toEqual([
      '¿Qué horario tengo hoy?',
      '¿Qué ambientes están libres ahora?',
    ]);
  });

  it('las sugerencias cambian con el rol (administrador)', () => {
    esAdmin.set(true);
    cargo.set('administrador');
    abrir();
    const chips = Array.from(el.querySelectorAll('.chip')).map((c) => c.textContent?.trim());
    expect(chips).toContain('¿Qué clases no han iniciado hoy?');
    expect(chips).not.toContain('¿Qué horario tengo hoy?');
  });

  it('escapa HTML/JS embebido en la respuesta del asistente en vez de ejecutarlo (XSS)', () => {
    chat.sendMessage.mockReturnValue(of({ reply: '<img src=x onerror="window.__xss=1"> **hola**' }));
    abrir();
    escribirYEnviar('prueba');

    expect(el.querySelector('img')).toBeNull();
    const burbujas = el.querySelectorAll('.mensaje.asistente');
    const ultima = burbujas[burbujas.length - 1];
    expect(ultima.textContent).toContain('<img src=x onerror="window.__xss=1">');
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });

  it('sigue aplicando el formato markdown propio (negrita y listas) sobre el texto normal', () => {
    chat.sendMessage.mockReturnValue(of({ reply: '**Atlas** dice:\n1. uno\n2. dos' }));
    abrir();
    escribirYEnviar('hola');

    const burbujas = el.querySelectorAll('.mensaje.asistente');
    const ultima = burbujas[burbujas.length - 1];
    expect(ultima.querySelector('strong')?.textContent).toBe('Atlas');
    expect(ultima.querySelectorAll('ol li').length).toBe(2);
  });

  it('al enviar, Atlas pasa a avatar de la cabecera, desaparecen las sugerencias y se muestra la respuesta', () => {
    abrir();
    escribirYEnviar('  ¿Qué horario tengo hoy?  ');

    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith('¿Qué horario tengo hoy?');
    expect(el.querySelector('.mascota')?.classList.contains('compacta')).toBe(true);
    expect(el.querySelectorAll('.chip').length).toBe(0);
    expect(el.querySelector('.mensaje.usuario')?.textContent).toContain('¿Qué horario tengo hoy?');
    expect(el.textContent).toContain('Respuesta de prueba');
  });

  it('tocar una sugerencia la envía', () => {
    abrir();
    (el.querySelector('.chip') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith('¿Qué horario tengo hoy?');
  });

  it('no envía mensajes vacíos y el botón queda deshabilitado', () => {
    abrir();
    const campo = el.querySelector('textarea') as HTMLTextAreaElement;
    campo.value = '   ';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect((el.querySelector('.enviar') as HTMLButtonElement).disabled).toBe(true);
    component.enviar();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it('si el backend falla muestra el error y el estado de la cabecera vuelve a "en línea"', () => {
    chat.sendMessage.mockReturnValue(throwError(() => new Error('boom')));
    abrir();
    escribirYEnviar('hola');

    expect(el.textContent).toContain('Ocurrió un error, intenta de nuevo.');
    expect(el.querySelector('.estado')?.textContent).toContain('en línea');
    expect(el.querySelector('.escribiendo')).toBeNull();
  });

  it('retoma la última conversación del usuario (adopta la sesión y arranca con Atlas ya como avatar)', () => {
    chat.obtenerHistorialReciente.mockReturnValue(
      of({ sessionId: 'previa', mensajes: [{ rol: 'usuario', contenido: 'hola' }, { rol: 'asistente', contenido: '**qué tal**' }] }),
    );
    auth.user.set({ id: 'u1' });
    fixture.detectChanges();
    abrir();

    expect(chat.adoptarSession).toHaveBeenCalledExactlyOnceWith('previa');
    expect(el.querySelector('.mascota')?.classList.contains('compacta')).toBe(true);
    expect(el.querySelector('.mensaje.asistente strong')?.textContent).toBe('qué tal');
  });

  it('al cambiar de usuario reinicia la conversación y cierra el panel', () => {
    auth.user.set({ id: 'u1' });
    fixture.detectChanges();
    abrir();
    escribirYEnviar('hola');
    expect(el.querySelector('.mensaje.usuario')).not.toBeNull();

    auth.user.set({ id: 'u2' });
    fixture.detectChanges();

    expect(chat.resetSession).toHaveBeenCalled();
    expect(el.querySelector('.chat-box')?.classList.contains('cerrado')).toBe(true);
    abrir();
    expect(el.querySelector('.mensaje.usuario')).toBeNull();
  });
});
