import { Directive, Input, OnInit, TemplateRef, ViewContainerRef, inject, effect } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Directiva estructural que muestra u oculta un elemento
 * según el cargo del usuario autenticado.
 *
 * Uso:
 *   <button *appHasRole="['administrador']">Eliminar</button>
 *   <button *appHasRole="['administrador', 'instructor']">Editar</button>
 *
 * Si el cargo del usuario NO está en la lista, el elemento no se renderiza.
 */
@Directive({
  selector: '[appHasRole]',
  standalone: true,
})
export class HasRoleDirective implements OnInit {
  @Input() appHasRole: string[] = [];

  private auth = inject(AuthService);

  constructor(
    private templateRef:    TemplateRef<any>,
    private viewContainer:  ViewContainerRef,
  ) {}

  ngOnInit(): void {
    this.updateView();

    // Re-evalúa si el usuario cambia (ej: logout/login sin recargar)
    effect(() => {
      this.auth.cargo(); // suscripción al signal
      this.updateView();
    }, { injector: (this as any)['_injector'] ?? undefined });
  }

  private updateView(): void {
    const cargo = this.auth.cargo();
    const allowed = this.appHasRole.length === 0 || this.appHasRole.includes(cargo);

    this.viewContainer.clear();
    if (allowed) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    }
  }
}
