import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLottieOptions } from 'ngx-lottie';

import { FloatingButtons } from './floating-buttons';

describe('FloatingButtons', () => {
  let component: FloatingButtons;
  let fixture: ComponentFixture<FloatingButtons>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FloatingButtons],
      providers: [
        provideLottieOptions({
          // Player fake: cualquier método del AnimationItem es un no-op
          player: () => ({ loadAnimation: () => new Proxy({}, { get: () => () => undefined }) }) as any,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FloatingButtons);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('escapa HTML/JS embebido en la respuesta del asistente en vez de ejecutarlo (XSS)', () => {
    const payload = '<img src=x onerror="window.__xss=1">';
    const safeHtml = component.formatearMensaje(payload) as any;
    const html: string = safeHtml.changingThisBreaksApplicationSecurity ?? String(safeHtml);

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('sigue aplicando el formato markdown propio (negrita) sobre texto normal', () => {
    const safeHtml = component.formatearMensaje('**Atlas**') as any;
    const html: string = safeHtml.changingThisBreaksApplicationSecurity ?? String(safeHtml);

    expect(html).toContain('<strong>Atlas</strong>');
  });
});
