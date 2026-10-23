import { formatearMensajeChat } from './chat-formato';

describe('formatearMensajeChat', () => {
  it('devuelve vacío con texto vacío, null o undefined', () => {
    expect(formatearMensajeChat('')).toBe('');
    expect(formatearMensajeChat(null)).toBe('');
    expect(formatearMensajeChat(undefined)).toBe('');
  });

  it('escapa HTML/JS embebido en vez de dejarlo pasar (XSS)', () => {
    const html = formatearMensajeChat('<img src=x onerror="window.__xss=1"> y <script>alert(1)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('el HTML escapado no se puede "desescapar" usando negrita', () => {
    expect(formatearMensajeChat('**<b onclick=x>**')).toBe('<strong>&lt;b onclick=x&gt;</strong>');
  });

  it('aplica negrita y deja intacto un ** sin cerrar', () => {
    expect(formatearMensajeChat('Soy **Atlas**')).toBe('Soy <strong>Atlas</strong>');
    expect(formatearMensajeChat('esto ** queda igual')).toBe('esto ** queda igual');
  });

  it('convierte saltos de línea en <br> y conserva un párrafo en blanco entre bloques', () => {
    expect(formatearMensajeChat('uno\ndos')).toBe('uno<br>dos');
    expect(formatearMensajeChat('uno\n\ndos')).toBe('uno<br><br>dos');
    expect(formatearMensajeChat('\n\nuno\n\n')).toBe('uno');
  });

  it('normaliza CRLF', () => {
    expect(formatearMensajeChat('uno\r\ndos')).toBe('uno<br>dos');
  });

  it('arma una lista numerada sin repetir el número en el texto', () => {
    expect(formatearMensajeChat('Ambientes:\n1. Sala A\n2. Sala B')).toBe(
      'Ambientes:<ol><li>Sala A</li><li>Sala B</li></ol>',
    );
  });

  it('arma una lista con viñetas (- y •)', () => {
    expect(formatearMensajeChat('- uno\n• dos')).toBe('<ul><li>uno</li><li>dos</li></ul>');
  });

  it('no confunde la negrita de inicio de línea con una viñeta', () => {
    expect(formatearMensajeChat('**Atlas** responde')).toBe('<strong>Atlas</strong> responde');
  });

  it('separa dos listas de distinto tipo seguidas y respeta el texto de después', () => {
    expect(formatearMensajeChat('1. a\n- b\nfin')).toBe('<ol><li>a</li></ol><ul><li>b</li></ul>fin');
  });

  it('no trata como lista una línea que solo contiene un número con punto dentro del texto', () => {
    expect(formatearMensajeChat('Ficha 2674. Hora 8:00')).toBe('Ficha 2674. Hora 8:00');
  });
});
