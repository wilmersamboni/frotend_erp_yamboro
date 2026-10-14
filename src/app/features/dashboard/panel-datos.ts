import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * Prácticas con el nombre del aprendiz, su empresa, ficha y programa ya
 * resueltos. Las usan el panel de inicio y su reporte para imprimir
 * (`reporte-panel.component.ts`): una sola versión del cruce.
 */
export async function cargarPracticasPanel(api: ApiService, auth: AuthService): Promise<any[]> {
  // Por SERVICIO, no por cargo: 'findAll' en empresa.controller.ts exige
  // 'practica.empresas.gestionar' — un administrador/instructor sin ese
  // nivel recibía 403 y, dentro del Promise.all, tumbaba la carga de todo.
  const puedeVerEmpresas = auth.tieneServicio('practica.empresas.gestionar');
  const [practicas, empresas, matriculas]: [any[], any[], any[]] = await Promise.all([
    api.listarPracticas(),
    puedeVerEmpresas ? api.listarEmpresas() : Promise.resolve([]),
    api.listarTodasMatriculas(),
  ]);

  const empresaMap = new Map<string, string>(
    empresas.map((e: any) => [e.id, e.nombre ?? e.razon_social ?? e.nombreEmpresa ?? e.name ?? e.id]),
  );
  const matriculaMap = new Map<string, any>(matriculas.map((m: any) => [m.idMatricula ?? m.id, m]));

  return practicas.map((p: any) => {
    const matricula = matriculaMap.get(p.matriculaId);
    const persona = matricula?.persona;
    const curso = matricula?.curso;
    return {
      ...p,
      empresaNombre: empresaMap.get(p.empresa?.id) ?? p.empresa?.nombre ?? '—',
      nombre: persona
        ? `${persona.nombres ?? persona.nombre ?? ''} ${persona.apellidos ?? persona.apellido ?? ''}`.trim()
        : '—',
      identificacion: persona?.cedula ?? persona?.documento ?? '—',
      ficha: curso?.codigo ?? curso?.numeroFicha ?? curso?.ficha ?? '—',
      programa: curso?.programa?.nombre ?? curso?.nombrePrograma ?? '—',
    };
  });
}
