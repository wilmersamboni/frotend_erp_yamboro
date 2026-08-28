import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HistorialService } from './historial.service';

/**
 * Fase F4: el forkJoin masivo original disparaba una request de
 * etapa-practica por CADA matrícula del aprendiz a la vez. Un aprendiz con
 * varias matrículas (o varios aprendices consultados en ráfaga) superaba
 * el rate limit del backend (30 req/10 s) al instante.
 *
 * Este test prueba el límite de concurrencia end-to-end contra el HTTP real
 * de consultar(): con 10 matrículas, nunca deben quedar más de 4 requests
 * de etapa-practica pendientes (sin resolver) al mismo tiempo.
 */
describe('HistorialService — límite de concurrencia (Fase F4)', () => {
  let service: HistorialService;
  let httpMock: HttpTestingController;

  const TOTAL_MATRICULAS = 10;
  const CONCURRENCIA_MAX = 4;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HistorialService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('acota a CONCURRENCIA_MAX las requests de etapa-practica en vuelo, sin importar cuántas matrículas tenga el aprendiz', () => {
    let resultado: any = null;
    service.consultar('123456789').subscribe((r) => (resultado = r));

    httpMock.expectOne('/api/personas/cedula/123456789').flush({ idPersona: 'p1', nombre: 'Test' });

    const matriculas = Array.from({ length: TOTAL_MATRICULAS }, (_, i) => ({ idMatricula: `m${i}` }));
    httpMock.expectOne('/api/matriculas/persona/p1').flush(matriculas);

    let maxConcurrentesObservado = 0;
    let resueltas = 0;

    // Vamos liberando lotes según llegan — el siguiente lote solo aparece
    // cuando mergeMap libera un slot al completarse una request anterior.
    while (resueltas < TOTAL_MATRICULAS) {
      const pendientes = httpMock.match((req) => req.url.startsWith('/api2/etapa-practica/matricula/'));
      expect(pendientes.length).toBeGreaterThan(0);
      maxConcurrentesObservado = Math.max(maxConcurrentesObservado, pendientes.length);
      expect(pendientes.length).toBeLessThanOrEqual(CONCURRENCIA_MAX);

      // Ninguna matrícula tiene etapa práctica (404) — caso más simple,
      // no dispara requests adicionales de seguimientos/asignaciones.
      pendientes.forEach((req) => req.flush({}, { status: 404, statusText: 'Not Found' }));
      resueltas += pendientes.length;
    }

    expect(resueltas).toBe(TOTAL_MATRICULAS);
    // Con 10 fuentes y tope 4, en algún momento deben coexistir exactamente 4.
    expect(maxConcurrentesObservado).toBe(CONCURRENCIA_MAX);
    expect(resultado?.practicas).toEqual([]);
  });

  it('preserva el orden de las prácticas aunque las respuestas HTTP lleguen fuera de orden', () => {
    let resultado: any = null;
    service.consultar('999').subscribe((r) => (resultado = r));

    httpMock.expectOne('/api/personas/cedula/999').flush({ idPersona: 'p2', nombre: 'Orden' });

    const matriculas = [{ idMatricula: 'a' }, { idMatricula: 'b' }, { idMatricula: 'c' }];
    httpMock.expectOne('/api/matriculas/persona/p2').flush(matriculas);

    const pendientes = httpMock.match((req) => req.url.startsWith('/api2/etapa-practica/matricula/'));
    expect(pendientes.length).toBe(3);

    // Resolvemos deliberadamente en orden inverso (c, b, a) con etapas reales.
    const porMatricula = new Map(pendientes.map((req) => [req.request.url.split('/').pop()!, req]));
    ['c', 'b', 'a'].forEach((idMat) => {
      porMatricula.get(idMat)!.flush({
        id: `etapa-${idMat}`, matriculaId: idMat, fecha_inicio: '', fecha_fin: '',
        estado: 'activo', observacion: '', empresa: {}, modalidad: {},
      });
    });

    // Cada etapa resuelta dispara seguimientos + asignaciones — los flusheamos
    // en el orden en que Angular los registró (también inverso: c, b, a).
    ['c', 'b', 'a'].forEach((idMat) => {
      httpMock.expectOne(`/api2/seguimientos/etapa/etapa-${idMat}`).flush([]);
      httpMock.expectOne(`/api2/asignaciones/etapa/etapa-${idMat}`).flush([]);
    });

    expect(resultado?.practicas?.map((p: any) => p.idMatricula)).toEqual(['a', 'b', 'c']);
  });
});
