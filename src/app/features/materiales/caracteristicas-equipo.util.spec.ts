import { describe, expect, it } from 'vitest';
import { camposPropios, esCampoPropio, gruposDe, resumenCaracteristicas, valoresLimpios } from './caracteristicas-equipo.util';
import { PlantillaCaracteristicas } from './data-access/materiales-api.service';

describe('características de equipos', () => {
  it('agrupa los campos en el orden de la plantilla', () => {
    const plantilla: PlantillaCaracteristicas = {
      codigo: 'COMPUTO',
      nombre: 'Equipo de cómputo',
      campos: [
        { clave: 'procesador', etiqueta: 'Procesador', grupo: 'Procesador', tipo: 'TEXTO' },
        { clave: 'ram_gb', etiqueta: 'Capacidad', grupo: 'RAM', tipo: 'NUMERO' },
        { clave: 'ram_tipo', etiqueta: 'Tipo', grupo: 'RAM', tipo: 'OPCION', opciones: ['DDR4'] },
      ],
    };
    expect(gruposDe(plantilla).map((g) => [g.grupo, g.campos.length])).toEqual([['Procesador', 1], ['RAM', 2]]);
    expect(gruposDe(null)).toEqual([]);
  });

  it('manda solo lo escrito, sin espacios', () => {
    expect(valoresLimpios({ procesador: ' i5 ', ram_gb: 8, ram_tipo: undefined, graficos_modelo: '  ' })).toEqual({ procesador: 'i5', ram_gb: '8' });
  });

  it('resume en una línea lo que haya', () => {
    expect(resumenCaracteristicas({ ram_gb: '16', ram_tipo: 'DDR5', almacenamiento_tipo: 'SSD NVMe', almacenamiento_gb: '1024', pantalla_pulgadas: '15.6' }))
      .toBe('16 GB DDR5 · SSD NVMe 1024 GB · 15.6 pulg.');
    expect(resumenCaracteristicas(null)).toBe('');
  });

  it('campos propios: se reconocen, se ordenan y van al final del resumen', () => {
    expect(esCampoPropio('ram_gb')).toBe(false);
    expect(esCampoPropio('Pines GPIO')).toBe(true);
    const c = { ram_gb: '4', 'Pines GPIO': '40', Conectividad: 'Wi-Fi' };
    expect(camposPropios(c)).toEqual([{ campo: 'Conectividad', valor: 'Wi-Fi' }, { campo: 'Pines GPIO', valor: '40' }]);
    expect(resumenCaracteristicas(c)).toBe('4 GB · Conectividad: Wi-Fi · Pines GPIO: 40');
    expect(valoresLimpios({ '  Pines   GPIO ': ' 40 ' })).toEqual({ 'Pines GPIO': '40' });
  });
});
