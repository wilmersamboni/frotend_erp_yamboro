import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialesDevolucionesComponent } from '../administration/devoluciones.component';
import { InstructorMaterialesDevolucionesComponent } from '../instructor/devoluciones.component';
import { AprendizMaterialesDevolucionesComponent } from '../apprentice/devoluciones.component';

/** Entrada canónica de Devoluciones durante la extracción gradual del flujo. */
@Component({
  standalone: true,
  imports: [MaterialesDevolucionesComponent, InstructorMaterialesDevolucionesComponent, AprendizMaterialesDevolucionesComponent],
  template: `
    @if (auth.isAdmin()) { <app-materiales-devoluciones /> }
    @else if (auth.cargo() === 'instructor') { <app-instructor-materiales-devoluciones /> }
    @else { <app-aprendiz-materiales-devoluciones /> }
  `,
})
export class DevolucionesEntryComponent {
  readonly auth = inject(AuthService);
}
