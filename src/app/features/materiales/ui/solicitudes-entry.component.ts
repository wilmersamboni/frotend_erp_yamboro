import { Component, inject } from '@angular/core';
import { MaterialesSolicitudesUsuarioComponent } from '../instructor/solicitudes.component';

/** Entrada canónica: conserva la UI y permisos de cada rol mientras se extrae
 * la implementación compartida. Así los enlaces apuntan a una sola URL. */
@Component({
  standalone: true,
  imports: [MaterialesSolicitudesUsuarioComponent],
  template: `
    <app-materiales-solicitudes-usuario />
  `,
})
export class SolicitudesEntryComponent {}
