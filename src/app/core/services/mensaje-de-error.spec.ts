import { HttpErrorResponse } from '@angular/common/http';
import { mensajeDeError } from './toast.service';

describe('mensajeDeError', () => {
  it('usa el mensaje propio del backend', () => {
    const e = new HttpErrorResponse({ status: 400, error: { message: 'La ficha ya tiene un horario en ese rango.' } });
    expect(mensajeDeError(e, 'No se pudo guardar.')).toBe('La ficha ya tiene un horario en ese rango.');
  });

  it('une la lista de errores de validación', () => {
    const e = new HttpErrorResponse({ status: 400, error: { message: ['nombre no puede estar vacío', 'cantidad debe ser mayor a 0'] } });
    expect(mensajeDeError(e, 'x')).toBe('nombre no puede estar vacío · cantidad debe ser mayor a 0');
  });

  it('traduce el nombre del estado HTTP en inglés que Nest devuelve cuando no puso mensaje', () => {
    const e = new HttpErrorResponse({ status: 409, error: { statusCode: 409, error: 'Conflict' } });
    expect(mensajeDeError(e, 'x')).toContain('registro está en uso');
  });

  it('un error HTTP sin mensaje usa el de respaldo y no el "Http failure response…" técnico', () => {
    const e = new HttpErrorResponse({ status: 502, statusText: 'Bad Gateway', url: '/api/x', error: '<html>502</html>' });
    expect(e.message).toContain('Http failure response');
    expect(mensajeDeError(e, 'No se pudo cargar.')).toBe('No se pudo cargar.');
  });

  it('un Error lanzado a propósito conserva su mensaje, pero un fallo del código no se muestra', () => {
    expect(mensajeDeError(new Error('El archivo supera 50 MB'), 'x')).toBe('El archivo supera 50 MB');
    expect(mensajeDeError(new TypeError("Cannot read properties of undefined (reading 'id')"), 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });

  it('sin nada útil, devuelve el respaldo', () => {
    expect(mensajeDeError(undefined, 'Respaldo')).toBe('Respaldo');
    expect(mensajeDeError(null)).toBe('Ha ocurrido un error inesperado.');
  });
});
