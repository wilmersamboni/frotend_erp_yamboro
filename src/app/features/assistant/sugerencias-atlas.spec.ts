import { sugerenciasAtlas } from './sugerencias-atlas';

describe('sugerenciasAtlas', () => {
  it('el administrador recibe preguntas de supervisión y no "mi horario"', () => {
    const s = sugerenciasAtlas(true, 'administrador');
    expect(s).toContain('¿Qué clases no han iniciado hoy?');
    expect(s).not.toContain('¿Qué horario tengo hoy?');
  });

  it('el instructor puede preguntar por su horario y sus solicitudes de material', () => {
    const s = sugerenciasAtlas(false, 'instructor');
    expect(s).toContain('¿Qué horario tengo hoy?');
    expect(s).toContain('¿Tengo solicitudes de material pendientes?');
  });

  it('el aprendiz solo recibe lo que Atlas puede contestarle: su horario y los ambientes libres', () => {
    expect(sugerenciasAtlas(false, 'aprendiz')).toEqual(['¿Qué horario tengo hoy?', '¿Qué ambientes están libres ahora?']);
  });

  it('un rol desconocido cae en la lista más conservadora', () => {
    expect(sugerenciasAtlas(false, '')).toEqual(sugerenciasAtlas(false, 'aprendiz'));
  });

  it('todos reciben la de ambientes libres', () => {
    for (const [admin, cargo] of [[true, 'administrador'], [false, 'instructor'], [false, 'aprendiz']] as const) {
      expect(sugerenciasAtlas(admin, cargo)).toContain('¿Qué ambientes están libres ahora?');
    }
  });
});
