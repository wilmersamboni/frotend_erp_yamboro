import { AprendizMisHorariosComponent } from './aprendiz-mis-horarios.component';

/**
 * Fase F5: aprendiz-mis-horarios.component.ts creaba un setInterval(..., 60000)
 * sin guardar el handle y sin ngOnDestroy — cada vez que el aprendiz entraba a
 * la pantalla se acumulaba un timer nuevo que seguía haciendo requests para
 * siempre (polling zombie).
 *
 * El constructor del componente recibe sus dependencias como parámetros planos
 * (no usa inject()), así que se instancia directamente con stubs — sin
 * TestBed/ChangeDetection de Angular de por medio — para probar el ciclo de
 * vida (ngOnInit/ngOnDestroy) de forma determinista.
 */
describe('AprendizMisHorariosComponent — polling (Fase F5)', () => {
  const fichaStub = { id: 'f1', codigo: 'FICHA-1', programa: 'Test' };
  const matriculasStub = [{ idMatricula: 'm1', ficha: fichaStub }];
  const cdrStub = { detectChanges: () => {} } as any;

  function crearComponente(overrides?: { getEventosByFicha?: ReturnType<typeof vi.fn> }) {
    const horariosApiStub = {
      getHorariosByFicha: vi.fn().mockResolvedValue([]),
      getEventosByFicha: overrides?.getEventosByFicha ?? vi.fn().mockResolvedValue([]),
    } as any;
    const erpCatalogoStub = {
      getMatriculasDePersona: vi.fn().mockResolvedValue(matriculasStub),
      getFichas: vi.fn().mockResolvedValue([fichaStub]),
      getAmbientes: vi.fn().mockResolvedValue([]),
      getInstructores: vi.fn().mockResolvedValue([]),
    } as any;
    const authStub = { user: () => ({ personaId: 'p1' }) } as any;
    return new AprendizMisHorariosComponent(horariosApiStub, erpCatalogoStub, authStub, cdrStub);
  }

  it('no acumula intervalos al entrar y salir 5 veces de la pantalla', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    for (let i = 0; i < 5; i++) {
      const comp = crearComponente();
      await comp.ngOnInit();
      comp.ngOnDestroy(); // simula salir de la ruta
    }

    // Antes de la fase F5 esto habría sido 5 setInterval y 0 clearInterval
    // (el handle nunca se guardaba) — un timer zombie por cada visita.
    expect(setIntervalSpy).toHaveBeenCalledTimes(5);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(5);
  });

  it('el tick periódico no refresca nada si la pestaña está en segundo plano', async () => {
    vi.useFakeTimers();
    try {
      const getEventos = vi.fn().mockResolvedValue([]);
      const comp = crearComponente({ getEventosByFicha: getEventos });
      await comp.ngOnInit();
      getEventos.mockClear(); // limpia la llamada inicial (no depende de document.hidden)

      // Pestaña oculta: el tick de los 60s debe salir en la primera línea
      // (if (document.hidden) return;) sin pedir eventos de nuevo.
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getEventos).not.toHaveBeenCalled();

      // Pestaña visible de nuevo: el siguiente tick sí debe refrescar.
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getEventos).toHaveBeenCalled();

      comp.ngOnDestroy();
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      vi.useRealTimers();
    }
  });
});
