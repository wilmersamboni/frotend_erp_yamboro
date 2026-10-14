import { codigoLoteSugerido, siglaProducto } from './codigo-lote.util';

// Mismos casos que backend-practica-hexagonal/src/common/materiales/codigo-lote.util.spec.ts:
// si una de las dos siglas cambia, este test avisa que el formulario mostraría otro código.
describe('código de lote sugerido', () => {
  it('sigla igual a la del backend', () => {
    expect(siglaProducto('Arduino Nano Esp32')).toBe('ANE');
    expect(siglaProducto('PATCH CORD UTP')).toBe('PCU');
    expect(siglaProducto('Nano-shield')).toBe('NS');
    expect(siglaProducto('Baterías de litio')).toBe('BL');
    expect(siglaProducto('Cable de red para exteriores categoría seis')).toBe('CREC');
    expect(siglaProducto('Multitoma')).toBe('MUL');
    expect(siglaProducto('DHT22')).toBe('DHT');
    expect(siglaProducto('')).toBe('LT');
  });

  it('código con la fecha de ingreso', () => {
    expect(codigoLoteSugerido('Arduino Nano Esp32', '2026-10-06')).toBe('ANE-06-10-26');
  });
});
