import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';
import { FormularioVigilado, UnsavedChangesService } from './unsaved-changes.service';

describe('FormularioVigilado', () => {
  it('no cuenta como modificado un formulario recién abierto, aunque traiga valores precargados', () => {
    const datos = { nombre: 'precargado' };
    const f = new FormularioVigilado(() => JSON.stringify(datos));
    f.iniciar();
    expect(f.sucio).toBe(false);
  });

  it('pasa a modificado cuando el usuario cambia algo, y vuelve a limpio si lo deja como estaba', () => {
    const datos = { obs: '' };
    const f = new FormularioVigilado(() => JSON.stringify(datos));
    f.iniciar();
    datos.obs = 'hola';
    expect(f.sucio).toBe(true);
    datos.obs = '';
    expect(f.sucio).toBe(false);
  });

  it('cerrado (terminar) nunca está sucio, ni antes de abrirse', () => {
    const datos = { obs: 'x' };
    const f = new FormularioVigilado(() => JSON.stringify(datos));
    expect(f.sucio).toBe(false);
    f.iniciar();
    datos.obs = 'y';
    f.terminar();
    expect(f.sucio).toBe(false);
  });
});

describe('UnsavedChangesService', () => {
  let servicio: UnsavedChangesService;
  let respuesta: boolean;
  let preguntas: number;

  beforeEach(() => {
    respuesta = true;
    preguntas = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ConfirmService,
          useValue: { ask: () => { preguntas++; return Promise.resolve(respuesta); } },
        },
      ],
    });
    servicio = TestBed.inject(UnsavedChangesService);
  });

  it('deja salir sin preguntar cuando nada tiene cambios', async () => {
    servicio.registrar(() => false);
    expect(await servicio.confirmarSalida()).toBe(true);
    expect(preguntas).toBe(0);
  });

  it('pregunta si alguna fuente tiene cambios, y respeta la respuesta', async () => {
    servicio.registrar(() => false);
    servicio.registrar(() => true);

    respuesta = false;
    expect(await servicio.confirmarSalida()).toBe(false);

    respuesta = true;
    expect(await servicio.confirmarSalida()).toBe(true);
    expect(preguntas).toBe(2);
  });

  it('al quitar la fuente (componente destruido) ya no molesta', async () => {
    const quitar = servicio.registrar(() => true);
    expect(servicio.hayCambios()).toBe(true);
    quitar();
    expect(servicio.hayCambios()).toBe(false);
    expect(await servicio.confirmarSalida()).toBe(true);
  });
});
