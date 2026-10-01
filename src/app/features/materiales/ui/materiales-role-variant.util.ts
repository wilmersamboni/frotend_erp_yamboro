import { Type } from '@angular/core';

export function seleccionarVarianteMateriales<T>(
  cargo: string,
  esAdmin: boolean,
  variantes: { admin: Type<T>; instructor: Type<T>; aprendiz: Type<T> },
): Type<T> {
  if (esAdmin) return variantes.admin;
  return cargo === 'instructor' ? variantes.instructor : variantes.aprendiz;
}
