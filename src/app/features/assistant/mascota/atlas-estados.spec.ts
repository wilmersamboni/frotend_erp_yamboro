import { DURACION_TRANSITORIO, MaquinaEstado, PARAMETROS, salidaConRebote, webglDisponible } from './atlas-estados';

describe('MaquinaEstado', () => {
  it('arranca en reposo', () => {
    expect(new MaquinaEstado().actual(0)).toBe('reposo');
  });

  it('pasa a pensando y vuelve a reposo', () => {
    const m = new MaquinaEstado();
    m.pensar(true);
    expect(m.actual(5)).toBe('pensando');
    m.pensar(false);
    expect(m.actual(6)).toBe('reposo');
  });

  it('un transitorio dura su tiempo y luego regresa al estado de fondo', () => {
    const m = new MaquinaEstado();
    m.disparar('feliz', 10);
    expect(m.actual(10)).toBe('feliz');
    expect(m.actual(10 + DURACION_TRANSITORIO.feliz - 0.01)).toBe('feliz');
    expect(m.actual(10 + DURACION_TRANSITORIO.feliz)).toBe('reposo');
  });

  it('si estaba pensando, al terminar el transitorio vuelve a pensando', () => {
    const m = new MaquinaEstado();
    m.pensar(true);
    m.disparar('error', 0);
    expect(m.actual(1)).toBe('error');
    expect(m.actual(DURACION_TRANSITORIO.error + 0.1)).toBe('pensando');
  });

  it('un transitorio nuevo reemplaza al anterior y reinicia el reloj', () => {
    const m = new MaquinaEstado();
    m.disparar('feliz', 0);
    m.disparar('error', 1);
    expect(m.actual(1.5)).toBe('error');
    expect(m.actual(1 + DURACION_TRANSITORIO.error - 0.01)).toBe('error');
  });

  it('empezar a pensar corta el transitorio en curso (p. ej. escribir durante el saludo)', () => {
    const m = new MaquinaEstado();
    m.disparar('saludo', 0);
    expect(m.actual(0.5)).toBe('saludo');
    m.pensar(true);
    expect(m.actual(0.6)).toBe('pensando');
  });

  it('pensar(false) durante un transitorio no lo corta', () => {
    const m = new MaquinaEstado();
    m.pensar(true);
    m.disparar('feliz', 0);
    m.pensar(false);
    expect(m.actual(0.5)).toBe('feliz');
    expect(m.actual(DURACION_TRANSITORIO.feliz + 0.1)).toBe('reposo');
  });
});

describe('PARAMETROS', () => {
  it('define todos los estados, con orbitas solo al pensar y tono ámbar solo en error', () => {
    expect(Object.keys(PARAMETROS).sort()).toEqual(['error', 'feliz', 'pensando', 'reposo', 'saludo']);
    expect(PARAMETROS.pensando.orbita).toBe(1);
    expect(PARAMETROS.reposo.orbita).toBe(0);
    expect(PARAMETROS.error.tono).toBe('ambar');
    expect(PARAMETROS.feliz.tono).toBe('verde');
  });

  it('feliz sonríe más que reposo y error frunce el ceño (sonrisa negativa)', () => {
    expect(PARAMETROS.feliz.sonrisa).toBeGreaterThan(PARAMETROS.reposo.sonrisa);
    expect(PARAMETROS.error.sonrisa).toBeLessThan(0);
  });
});

describe('salidaConRebote', () => {
  it('va de 0 a 1, se pasa un poco en el camino y se acota fuera de rango', () => {
    expect(salidaConRebote(0)).toBeCloseTo(0, 5);
    expect(salidaConRebote(1)).toBeCloseTo(1, 5);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(salidaConRebote))).toBeGreaterThan(1);
    expect(salidaConRebote(-3)).toBeCloseTo(0, 5);
    expect(salidaConRebote(9)).toBeCloseTo(1, 5);
  });
});

describe('webglDisponible', () => {
  it('es false cuando el entorno no tiene WebGL (jsdom), sin lanzar ni ensuciar la consola', () => {
    expect(webglDisponible()).toBe(false);
  });
});
