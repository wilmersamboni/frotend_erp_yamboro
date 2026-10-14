import { describe, expect, it } from 'vitest';
import { puedeSerCuentadante } from './cuentadante-formato';

describe('puedeSerCuentadante (misma regla que el backend)', () => {
  const cuenta = (cargo: string | null, marca = false) => ({ puedeSerCuentadante: marca, persona: cargo ? { cargo } : null });

  it('instructores y administradores, sin marca', () => {
    for (const cargo of ['instructor', 'administrador', 'administrador_erp', 'Administrador_ERP']) {
      expect(puedeSerCuentadante(cuenta(cargo))).toBe(true);
    }
  });

  it('otro cargo solo si está habilitado en Usuarios', () => {
    expect(puedeSerCuentadante(cuenta('funcionario'))).toBe(false);
    expect(puedeSerCuentadante(cuenta('funcionario', true))).toBe(true);
  });

  it('un aprendiz nunca, aunque tenga la marca', () => {
    expect(puedeSerCuentadante(cuenta('aprendiz', true))).toBe(false);
  });
});
