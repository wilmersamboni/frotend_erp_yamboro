import { MaterialesNovedadesComponent } from './administration/novedades.component';
import { InstructorMaterialesNovedadesComponent } from './instructor/novedades.component';

const items: any[] = [
  { id_item: 'i1', placa_sena: 'SENA-001', codigo_sku: null, producto: { nombre: 'Portátil' } },
  { id_item: 'i2', placa_sena: null, codigo_sku: 'MOU-1', producto: { nombre: 'Mouse' } },
  { id_item: 'i3', placa_sena: 'SENA-003', codigo_sku: 'X', producto: { nombre: 'Taladro' } },
];

// Se prueba solo el método de escaneo: no hace falta armar el componente con todas sus dependencias.
const armar = (clase: { prototype: object }) => {
  const c: any = Object.create(clase.prototype);
  c.items = items;
  c.form = { tipo: 'DAÑO', descripcion: '', id_item: null };
  c.escaneo = null;
  return c;
};

describe.each([
  ['administración', MaterialesNovedadesComponent],
  ['instructor', InstructorMaterialesNovedadesComponent],
])('Novedades (%s): escaneo de placa', (_rol, clase) => {
  it('una placa conocida selecciona el ítem en el formulario', () => {
    const c = armar(clase);
    c.onPlacaEscaneada('SENA-001');
    expect(c.form.id_item).toBe('i1');
    expect(c.escaneo.ok).toBe(true);
    expect(c.escaneo.texto).toContain('Portátil');
  });

  it('tolera espacios y mayúsculas/minúsculas del lector', () => {
    const c = armar(clase);
    c.onPlacaEscaneada('  sena-003 ');
    expect(c.form.id_item).toBe('i3');
  });

  it('un ítem sin placa se encuentra por su código', () => {
    const c = armar(clase);
    c.onPlacaEscaneada('MOU-1');
    expect(c.form.id_item).toBe('i2');
  });

  it('el código de un ítem que SÍ tiene placa no lo selecciona (la placa manda)', () => {
    const c = armar(clase);
    c.onPlacaEscaneada('X');
    expect(c.form.id_item).toBeNull();
    expect(c.escaneo.ok).toBe(false);
  });

  it('una placa desconocida avisa y no cambia el formulario', () => {
    const c = armar(clase);
    c.form.id_item = 'i1';
    c.onPlacaEscaneada('NO-EXISTE');
    expect(c.form.id_item).toBe('i1');
    expect(c.escaneo.ok).toBe(false);
    expect(c.escaneo.texto).toContain('NO-EXISTE');
  });
});
