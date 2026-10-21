import {
  construirModulos, construirRecurso, decisionPara, efectivoDe, fraseServicio, nivelDe, normalizar, origenDe,
  textoNivel, tieneHuecos,
} from './permisos-catalogo';

const svc = (nombre: string, id = nombre) => ({ idServicio: id, nombre });

describe('permisos-catalogo', () => {
  describe('decisionPara — decisión mínima para lograr un resultado', () => {
    it('modo usuario: si coincide con el rol no crea excepción', () => {
      expect(decisionPara(true, true, false)).toBe('heredar');
      expect(decisionPara(false, false, false)).toBe('heredar');
    });
    it('modo usuario: da lo que el rol no da y quita lo que el rol da', () => {
      expect(decisionPara(true, false, false)).toBe('otorgado');
      expect(decisionPara(false, true, false)).toBe('denegado');
    });
    it('modo rol: solo otorgado o heredar (= quitar), nunca denegado', () => {
      expect(decisionPara(true, false, true)).toBe('otorgado');
      expect(decisionPara(false, true, true)).toBe('heredar');
    });
  });

  describe('efectivoDe / origenDe', () => {
    it('heredar vale lo que da el rol en modo usuario y "no" en modo rol', () => {
      expect(efectivoDe('heredar', true, false)).toBe(true);
      expect(efectivoDe('heredar', true, true)).toBe(false);
    });
    it('otorgado y denegado mandan sobre el rol', () => {
      expect(efectivoDe('otorgado', false, false)).toBe(true);
      expect(efectivoDe('denegado', true, false)).toBe(false);
    });
    it('distingue del rol, extra, bloqueado y no lo tiene', () => {
      expect(origenDe(true, true)).toBe('rol');
      expect(origenDe(true, false)).toBe('extra');
      expect(origenDe(false, true)).toBe('bloqueado');
      expect(origenDe(false, false)).toBe('no');
    });
  });

  describe('fraseServicio', () => {
    it('usa la frase del diccionario si existe', () => {
      expect(fraseServicio('materiales.traslados.aprobar')).toBe('Aprobar traslados');
    });
    it('arma una frase legible con servicios que no están en el diccionario', () => {
      expect(fraseServicio('materiales.lotes.crear')).toBe('Crear material que se gasta (lotes)');
      expect(fraseServicio('materiales.cosa-nueva.editar')).toBe('Editar cosa nueva');
    });
  });

  describe('escalera de nivel', () => {
    const r = construirRecurso('materiales.productos', [
      svc('materiales.productos.eliminar'),
      svc('materiales.productos.ver'),
      svc('materiales.productos.crear'),
      svc('materiales.productos.editar'),
    ]);

    it('ordena los peldaños y junta crear+editar en uno', () => {
      expect(r.pasos.map(p => p.label)).toEqual(['Ver', 'Editar', 'Eliminar']);
      expect(r.pasos[1].servicios).toHaveLength(2);
    });

    it('el nivel cuenta peldaños consecutivos desde abajo con TODOS sus servicios', () => {
      const activos = new Set(['materiales.productos.ver', 'materiales.productos.crear']);
      expect(nivelDe(r, id => activos.has(id))).toBe(1); // editar está a medias
      activos.add('materiales.productos.editar');
      expect(nivelDe(r, id => activos.has(id))).toBe(2);
    });

    it('detecta permisos sueltos por encima del nivel', () => {
      const activos = new Set(['materiales.productos.eliminar']);
      expect(tieneHuecos(r, id => activos.has(id))).toBe(true);
      expect(tieneHuecos(r, () => false)).toBe(false);
    });

    it('describe el nivel en una frase', () => {
      expect(textoNivel(r, 0)).toBe('Sin acceso');
      expect(textoNivel(r, 1)).toBe('Ver');
      expect(textoNivel(r, 3)).toBe('Ver, editar y eliminar');
    });

    it('las acciones que no son nivel (aprobar...) quedan como interruptores con frase completa', () => {
      const t = construirRecurso('materiales.traslados', [
        svc('materiales.traslados.ver'), svc('materiales.traslados.aprobar'), svc('materiales.traslados.rechazar'),
      ]);
      expect(t.pasos).toHaveLength(1);
      expect(t.extras.map(e => e.label)).toEqual(['Aprobar traslados', 'Rechazar traslados']);
    });

    it('respeta los textos especiales de empresas (gestionar = ver listado)', () => {
      const e = construirRecurso('practica.empresas', [
        svc('practica.empresas.ver'), svc('practica.empresas.gestionar'), svc('practica.empresas.administrar'),
      ]);
      expect(e.pasos.map(p => p.label)).toEqual(['Ver detalle', 'Ver listado', 'Control total']);
    });
  });

  describe('construirModulos', () => {
    it('agrupa por módulo, ordena por importancia y renombra RBAC', () => {
      const modulos = construirModulos([
        { idServicio: '1', nombre: 'permisos.gestionar', modulo: { nombre: 'RBAC' } },
        { idServicio: '2', nombre: 'materiales.sitios.ver', modulo: { nombre: 'Materiales' } },
        { idServicio: '3', nombre: 'personas.ver', modulo: { nombre: 'Personas y Matrículas' } },
        { idServicio: '4', nombre: 'algo.raro', modulo: { nombre: 'Zeta' } },
        { idServicio: '5', nombre: 'sin.modulo' },
      ]);
      expect(modulos.map(m => m.etiqueta)).toEqual([
        'Personas y Matrículas', 'Materiales', 'Roles y permisos', 'Otros', 'Zeta',
      ]);
    });
  });

  it('normalizar quita tildes y mayúsculas para buscar', () => {
    expect(normalizar('Matrículas')).toBe('matriculas');
  });
});
