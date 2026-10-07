import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MaterialesApiService, OpcionesSalida } from '../data-access/materiales-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ToastService } from '../../../core/services/toast.service';
import { MaterialesSalidasComponent } from './salidas.component';

const OPCIONES: OpcionesSalida = {
  lotes: [{ id_lote: 'lote-1', producto_nombre: 'Cable UTP', codigo_lote: 'L1', unidad_medida: 'METRO', libres: 10, fecha_vencimiento: null }],
  unidades: [
    { id_item: 'item-1', producto_nombre: 'Repetidor', marca: null, modelo: null, placa_sena: null, codigo_sku: null, codigo: 'AB12', id_cuentadante: null, cuentadante_nombre: null, puede_despachar: true },
    { id_item: 'item-cu', producto_nombre: 'Workstation', marca: 'HP', modelo: null, placa_sena: '9528', codigo_sku: null, codigo: 'CD34', id_cuentadante: 'u-9', cuentadante_nombre: 'Otra Persona', puede_despachar: true },
  ],
  jefes: [],
};

function crear() {
  const crearSalida = vi.fn().mockResolvedValue({
    id_salida: 's1',
    codigo: 'SAL-20261006-001',
    lineas: [{ id_linea: 'linea-1', id_lote: 'lote-1', producto_nombre: 'Cable UTP' }],
  });
  const subirFoto = vi.fn().mockResolvedValue({});
  const toast = { ok: vi.fn(), warn: vi.fn(), error: vi.fn(), httpError: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: MaterialesApiService, useValue: { crearSalida, subirFotoLineaSalida: subirFoto, listarSalidas: vi.fn().mockResolvedValue([]) } },
      { provide: AuthService, useValue: { isAdmin: () => false, tieneServicio: () => true, user: () => ({ id: 'yo' }) } },
      { provide: ToastService, useValue: toast },
      { provide: ConfirmService, useValue: { ask: vi.fn() } },
    ],
  });
  const c = TestBed.runInInjectionContext(() => new MaterialesSalidasComponent());
  c.opciones.set(OPCIONES);
  return { c, crearSalida, subirFoto, toast };
}

describe('Salidas: validación del formulario', () => {
  it('antes de intentar enviar no marca nada en rojo (salvo mínimos de caracteres al escribir)', () => {
    const { c } = crear();
    expect(c.err('id_sitio')).toBe('');
    expect(c.err('motivo')).toBe('');
    c.f.motivo = 'corto';
    expect(c.err('motivo')).toBe('Faltan 5 caracteres (mínimo 10).');
  });

  it('al intentar enviar un formulario vacío marca bodega, motivo y la línea, y no llama al backend', async () => {
    const { c, crearSalida } = crear();
    await c.guardarNueva();
    expect(c.err('id_sitio')).toContain('bodega');
    expect(c.err('motivo')).toContain('Cuenta para qué');
    expect(c.err('l0_clave')).toBe('Elige el lote.');
    expect(c.cantidadErrores()).toBeGreaterThanOrEqual(3);
    expect(crearSalida).not.toHaveBeenCalled();
  });

  it('"para otra persona" exige nombre (mín. 3) y sede; "para mí" no', () => {
    const { c } = crear();
    c.intento = true;
    expect(c.err('dest_nombre')).toBe('');
    c.f.tipo_destino = 'TERCERO';
    expect(c.err('dest_nombre')).toBe('Escribe quién recibe el material.');
    expect(c.err('dest_sede')).toBe('Escribe la sede de esa persona.');
    c.f.dest_nombre = 'Al';
    expect(c.err('dest_nombre')).toBe('Faltan 1 caracteres (mínimo 3).');
    c.f.dest_nombre = 'Alberto';
    c.f.dest_sede = 'San Agustín';
    expect(c.err('dest_nombre')).toBe('');
    expect(c.err('dest_sede')).toBe('');
  });

  it('cantidad: entera, de 1 en adelante y sin pasar el saldo libre del lote', () => {
    const { c } = crear();
    c.intento = true;
    c.f.lineas = [{ clave: 'lote-1', cantidad: 0, valor: null, serial: '' }];
    expect(c.err('l0_cantidad')).toContain('entero');
    c.f.lineas[0].cantidad = 2.5;
    expect(c.err('l0_cantidad')).toContain('entero');
    c.f.lineas[0].cantidad = 11;
    expect(c.err('l0_cantidad')).toBe('Solo hay 10 libres en ese lote.');
    c.f.lineas[0].cantidad = 10;
    expect(c.err('l0_cantidad')).toBe('');
  });

  it('cantidad: el tope del lote se aplica en vivo (al escribir y al cambiar de lote), sin esperar a enviar', () => {
    const { c } = crear();
    const l: { clave: string | null; cantidad: number; valor: number | null; serial: string; ajustada?: boolean } = { clave: 'lote-1', cantidad: 25, valor: null, serial: '' };
    c.f.lineas = [l];
    const input = { valueAsNumber: 25, value: '25' } as HTMLInputElement;
    c.fijarCantidad(l, input);
    expect(l.cantidad).toBe(10); // libres del lote
    expect(input.value).toBe('10');
    expect(l.ajustada).toBe(true);
    c.fijarCantidad(l, { valueAsNumber: 4, value: '4' } as HTMLInputElement);
    expect(l.ajustada).toBe(false);
    // Sin "Enviar": un 0 se marca de una vez.
    l.cantidad = 0;
    expect(c.err('l0_cantidad')).toContain('entero');
    // Al cambiar a un lote con menos saldo, la cantidad baja a ese máximo.
    l.cantidad = 9;
    c.opciones.set({ ...c.opciones()!, lotes: [...c.opciones()!.lotes, { id_lote: 'lote-2', producto_nombre: 'Conector', codigo_lote: null, unidad_medida: 'UNIDAD', libres: 3, fecha_vencimiento: null }] });
    l.clave = 'lote-2';
    c.alCambiarLote(l);
    expect(l.cantidad).toBe(3);
    expect(l.ajustada).toBe(true);
  });

  it('no deja repetir el mismo lote en dos líneas', () => {
    const { c } = crear();
    c.intento = true;
    c.f.lineas = [
      { clave: 'lote-1', cantidad: 1, valor: null, serial: '' },
      { clave: 'lote-1', cantidad: 1, valor: null, serial: '' },
    ];
    expect(c.err('l0_clave')).toBe('');
    expect(c.err('l1_clave')).toBe('Ya lo agregaste en otra línea.');
  });

  it('devolutivo: primero hay que indicar si regresa', () => {
    const { c } = crear();
    c.intento = true;
    expect(c.err('con_regreso')).toBe('');
    c.elegirClase('DEVOLUTIVO');
    expect(c.err('con_regreso')).toBe('Indica si el material regresa a la sede.');
    c.regresa.set(false);
    expect(c.err('con_regreso')).toBe('');
  });

  it('devolutivo (regrese o no, con o sin cuentadante): pide destino, transporte, jefe y valor asegurado de cada unidad', () => {
    for (const regresa of [true, false]) {
      TestBed.resetTestingModule();
      const { c } = crear();
      c.intento = true;
      c.elegirClase('DEVOLUTIVO');
      c.regresa.set(regresa);
      c.f.lineas = [
        { clave: 'item-1', cantidad: 1, valor: null, serial: '' },
        { clave: 'item-cu', cantidad: 1, valor: null, serial: '' },
      ];
      expect(c.conPoliza()).toBe(true);
      expect(c.err('lugar_destino')).toBeTruthy();
      expect(c.err('medio_transporte')).toBeTruthy();
      expect(c.err('id_jefe_inmediato')).toBe('Elige el jefe inmediato.');
      expect(c.err('l0_valor')).toBe('Escribe el valor asegurado de esta unidad.'); // sin cuentadante también
      expect(c.err('l1_valor')).toBe('Escribe el valor asegurado de esta unidad.');
      c.f.lineas[0].valor = 0;
      expect(c.err('l0_valor')).toBe('');
    }
  });

  it('consumibles: sin datos de póliza', () => {
    const { c } = crear();
    c.intento = true;
    expect(c.conPoliza()).toBe(false);
    expect(c.err('lugar_destino')).toBe('');
    expect(c.err('id_jefe_inmediato')).toBe('');
  });

  it('solo hay dos formas de salida: consumibles o devolutivos', () => {
    const { c } = crear();
    expect(c.tiposClase.map((t) => t.value)).toEqual(['CONSUMO', 'DEVOLUTIVO']);
  });

  it('consumible: la foto es obligatoria; un devolutivo no la pide', () => {
    const { c } = crear();
    c.intento = true;
    c.f.lineas = [{ clave: 'lote-1', cantidad: 1, valor: null, serial: '' }];
    expect(c.err('l0_foto')).toBe('Toma la foto del material.');
    c.f.lineas[0].foto = new Blob(['x'], { type: 'image/jpeg' });
    expect(c.err('l0_foto')).toBe('');
    c.elegirClase('DEVOLUTIVO');
    c.f.lineas = [{ clave: 'item-1', cantidad: 1, valor: null, serial: '' }];
    expect(c.err('l0_foto')).toBe('');
  });

  it('con todo correcto envía y manda solo lo que corresponde, y después sube la foto de cada material', async () => {
    const { c, crearSalida, subirFoto } = crear();
    const foto = new Blob(['x'], { type: 'image/jpeg' });
    c.f.id_sitio = 'sitio-1';
    c.f.motivo = 'Cable para la práctica de redes en San Agustín';
    c.f.lineas = [{ clave: 'lote-1', cantidad: 5, valor: null, serial: '', foto }];
    await c.guardarNueva();
    expect(crearSalida).toHaveBeenCalledWith({
      clase: 'CONSUMO',
      id_sitio: 'sitio-1',
      tipo_destino: 'PROPIO',
      motivo: 'Cable para la práctica de redes en San Agustín',
      lineas: [{ id_lote: 'lote-1', cantidad: 5 }],
    });
    expect(subirFoto).toHaveBeenCalledWith('s1', 'linea-1', foto);
  });

  it('si una foto no sube, la salida queda creada y se avisa qué falta', async () => {
    const { c, subirFoto, toast } = crear();
    subirFoto.mockRejectedValue(new Error('sin red'));
    c.f.id_sitio = 'sitio-1';
    c.f.motivo = 'Cable para la práctica de redes en San Agustín';
    c.f.lineas = [{ clave: 'lote-1', cantidad: 5, valor: null, serial: '', foto: new Blob(['x']) }];
    await c.guardarNueva();
    expect(toast.ok).not.toHaveBeenCalled();
    expect(toast.warn.mock.calls[0][1]).toContain('«Cable UTP»');
    expect(c.nueva()).toBe(false);
  });
});
