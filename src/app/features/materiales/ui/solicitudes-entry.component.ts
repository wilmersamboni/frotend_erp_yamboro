import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialesSolicitudesComponent } from '../administration/solicitudes.component';
import { InstructorMaterialesSolicitudesComponent } from '../instructor/solicitudes.component';
import { AprendizMaterialesSolicitudesComponent } from '../apprentice/solicitudes.component';

/** Entrada canónica: conserva la UI y permisos de cada rol mientras se extrae
 * la implementación compartida. Así los enlaces apuntan a una sola URL. */
@Component({
  standalone: true,
  imports: [MaterialesSolicitudesComponent, InstructorMaterialesSolicitudesComponent, AprendizMaterialesSolicitudesComponent],
  template: `
    @if (auth.isAdmin()) { <app-materiales-solicitudes /> }
    @else if (auth.cargo() === 'instructor') { <app-instructor-materiales-solicitudes /> }
    @else { <app-aprendiz-materiales-solicitudes /> }
  `,
})
export class SolicitudesEntryComponent {
  readonly auth = inject(AuthService);
}
