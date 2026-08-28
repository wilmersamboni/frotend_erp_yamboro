import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { Curso } from '../../../shared/models';

/**
 * Equivalente a PageCourse.tsx de React.
 *
 * React:                         Angular:
 * useParams()          →  ActivatedRoute.snapshot.params
 * useNavigate()        →  Router.navigate()
 * useState / useEffect →  signal + ngOnInit
 */
@Component({
  selector: 'app-page-course',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <button (click)="router.navigate(['/seguimiento'])"
            class="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 mb-1 transition-colors">
            ← Volver a áreas
          </button>
          <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Cursos del Área</h1>
        </div>
        <button (click)="abrirModal()"
          class="flex items-center gap-2 px-4 py-2 bg-[#39A900] text-white rounded-lg
                 hover:bg-[#2d8400] transition-colors text-sm font-medium">
          + Nuevo curso
        </button>
      </div>

      <!-- Error -->
      @if (error()) {
        <div class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          ⚠️ {{ error() }}
        </div>
      }

      <!-- Loading -->
      @if (loading()) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      }

      <!-- Grid de cursos -->
      @if (!loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          @for (curso of cursos(); track curso.id_curso) {
            <div class="group bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900
                        border border-gray-700 rounded-2xl shadow-lg p-6 relative
                        hover:shadow-2xl hover:shadow-blue-500/20 hover:border-blue-500/50
                        hover:scale-105 hover:-translate-y-1 transition-all duration-300 cursor-pointer"
              (click)="router.navigate(['/pagetable', curso.id_curso])">

              <!-- Acciones -->
              <div class="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button (click)="$event.stopPropagation(); editarCurso(curso)"
                  class="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                         m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button (click)="$event.stopPropagation(); confirmarEliminar(curso)"
                  class="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6
                         m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>

              <h3 class="text-white text-xl font-bold tracking-tight group-hover:text-blue-300 transition-colors">
                {{ curso.codigo ?? 'Sin código' }}
              </h3>
              @if (curso.nombre) {
                <p class="text-gray-400 text-sm mt-1">{{ curso.nombre }}</p>
              }
              @if (curso.estado) {
                <span class="inline-block mt-3 text-[10px] font-medium px-2 py-0.5 rounded-full
                              bg-white/10 text-white/60">
                  {{ curso.estado }}
                </span>
              }
            </div>
          }

          @if (cursos().length === 0) {
            <div class="col-span-full text-center py-12 text-gray-500">No hay cursos registrados</div>
          }
        </div>
      }

      <!-- Modal crear/editar -->
      @if (modalOpen()) {
        <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 class="text-lg font-bold text-gray-800 mb-4">
              {{ cursoSeleccionado() ? 'Editar curso' : 'Nuevo curso' }}
            </h2>
            <div class="space-y-3">
              <input [(ngModel)]="form.codigo" placeholder="Código del curso"
                class="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              <input [(ngModel)]="form.nombre" placeholder="Nombre del curso"
                class="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </div>
            @if (modalError()) {
              <p class="text-red-500 text-xs mt-2">{{ modalError() }}</p>
            }
            <div class="flex justify-end gap-2 mt-6">
              <button (click)="cerrarModal()"
                class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button (click)="guardar()" [disabled]="saving()"
                class="px-5 py-2 bg-[#39A900] text-white text-sm font-medium rounded-lg
                       hover:bg-[#2d8400] disabled:opacity-60">
                {{ saving() ? 'Guardando...' : 'Guardar' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PageCourseComponent implements OnInit {
  cursos           = signal<Curso[]>([]);
  loading          = signal(false);
  error            = signal<string | null>(null);
  modalOpen        = signal(false);
  cursoSeleccionado = signal<Curso | null>(null);
  saving           = signal(false);
  modalError       = signal<string | null>(null);

  form = { codigo: '', nombre: '' };
  private idArea!: number;

  constructor(
    private route:  ActivatedRoute,
    public  router: Router,
    private api:    ApiService,
    private toast:  ToastService,
  ) {}

  ngOnInit(): void {
    this.idArea = Number(this.route.snapshot.params['idArea']);
    if (!this.idArea) { this.error.set('ID de área no válido.'); return; }
    this.cargarCursos();
  }

  async cargarCursos(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.api.listarCursosArea(this.idArea);
      this.cursos.set(data);
      this.error.set(null);
    } catch {
      this.error.set('Error al cargar los cursos.');
    } finally {
      this.loading.set(false);
    }
  }

  abrirModal(): void {
    this.cursoSeleccionado.set(null);
    this.form = { codigo: '', nombre: '' };
    this.modalError.set(null);
    this.modalOpen.set(true);
  }

  editarCurso(curso: Curso): void {
    this.cursoSeleccionado.set(curso);
    this.form = { codigo: curso.codigo ?? '', nombre: curso.nombre ?? '' };
    this.modalError.set(null);
    this.modalOpen.set(true);
  }

  cerrarModal(): void {
    this.modalOpen.set(false);
    this.cursoSeleccionado.set(null);
  }

  async guardar(): Promise<void> {
    if (!this.form.codigo.trim()) { this.modalError.set('El código es obligatorio.'); return; }
    this.saving.set(true);
    try {
      const sel = this.cursoSeleccionado();
      if (sel) {
        await this.api.editarCurso(sel.id_curso, this.form);
        this.toast.ok('Curso actualizado', `El curso ${this.form.codigo} fue guardado.`);
      } else {
        await this.api.crearCurso({ ...this.form, fk_area: this.idArea });
        this.toast.ok('Curso creado', `El curso ${this.form.codigo} fue registrado correctamente.`);
      }
      this.cerrarModal();
      await this.cargarCursos();
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo guardar el curso.');
      this.modalError.set('No se pudo guardar.');
    } finally {
      this.saving.set(false);
    }
  }

  async confirmarEliminar(curso: Curso): Promise<void> {
    if (!window.confirm('¿Seguro que deseas eliminar este curso?')) return;
    try {
      await this.api.eliminarCurso(curso.id_curso);
      this.toast.ok('Curso eliminado', 'El curso fue eliminado correctamente.');
      await this.cargarCursos();
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo eliminar el curso.');
    }
  }
}
