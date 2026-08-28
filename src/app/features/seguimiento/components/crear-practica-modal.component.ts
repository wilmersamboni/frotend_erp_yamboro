import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, signal, computed,
  ViewChild, ElementRef,
} from '@angular/core';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { PracticaService, MatriculaService, PersonaService } from '../../../core/services';
import { ToastService } from '../../../core/services/toast.service';
import { FileUploadZoneComponent } from '../../../shared/components/file-upload-zone.component';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';

import { TuiDay } from '@taiga-ui/cdk';
import { OnInit } from '@angular/core';

/**
 * Componente unificado para crear O editar una etapa práctica.
 *
 * Modo crear  → no pases `practicaId` (o ponlo en null).
 * Modo editar → pasa `practicaId` con el UUID de la etapa existente.
 *               El formulario se pre-popula desde la API y al guardar
 *               llama PATCH en lugar de POST.
 *               En modo editar el instructor NO se gestiona aquí —
 *               usa el botón "Gestionar asignaciones" para eso.
 */
@Component({
  selector: 'app-crear-practica-modal',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    FileUploadZoneComponent,
    SearchableSelectComponent,
    DateInputComponent,
  ],
  template: `
    <!-- Input FUERA de @if para que @ViewChild lo encuentre siempre en el DOM -->
    <input #fileInput type="file" multiple style="display:none"
           accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip"
           (change)="onArchivosSeleccionados($event)" />

    @if (isOpen) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        (click)="$event.target === $event.currentTarget && closed.emit()">

        <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[95vh] flex flex-col">

          <!-- Header -->
          <div class="px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <h2 class="text-lg font-bold text-gray-800">
              {{ modoEditar ? 'Editar etapa práctica' : 'Crear etapa práctica' }}
            </h2>
            <p class="text-xs text-gray-400 mt-0.5">
              @if (modoEditar && alumnoPreseleccionado) {
                {{ alumnoPreseleccionado.name }} · Modifica los datos de la etapa práctica
              } @else if (modoEditar) {
                Modifica los datos de la etapa práctica
              } @else {
                Completa los datos para asignar la etapa práctica
              }
            </p>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-6 flex flex-col gap-4">

            @if (loadingData()) {
              <p class="text-sm text-gray-400 text-center py-4">Cargando datos...</p>
            } @else {

              <!-- Info del aprendiz -->
              @if (alumnoPreseleccionado) {
                <div class="flex items-center gap-3 p-3 rounded-xl bg-[#39A900]/8 border border-[#39A900]/20">
                  <div class="w-9 h-9 rounded-full bg-[#39A900]/20 text-[#39A900]
                               flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {{ initials(alumnoPreseleccionado.name) }}
                  </div>
                  <div class="flex-1">
                    <p class="text-sm font-semibold text-gray-800">{{ alumnoPreseleccionado.name }}</p>
                    <p class="text-xs text-gray-400">{{ alumnoPreseleccionado.programa }} · {{ alumnoPreseleccionado.area }}</p>
                  </div>
                  <span class="text-[10px] bg-[#39A900]/10 text-[#39A900] px-2 py-0.5 rounded-full font-medium">
                    ID: {{ alumnoPreseleccionado.id }}
                  </span>
                </div>
              }

              <!-- Select aprendiz (solo al crear sin preselección) -->
              @if (!modoEditar && !alumnoPreseleccionado) {
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">Aprendiz</label>
                  <app-ss [options]="aprendizOptions()" placeholder="Selecciona un aprendiz"
                          [(ngModel)]="form.aprendizId"></app-ss>
                </div>
              }

              <!-- Modalidad -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Modalidad</label>
                <app-ss [options]="modalidadOptions()" placeholder="Selecciona una modalidad"
                        [(ngModel)]="form.modalidadId"></app-ss>
              </div>

              <!-- Empresa -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Empresa</label>
                <app-ss [options]="empresaOptions()" placeholder="Selecciona una empresa"
                        [(ngModel)]="form.empresaId"></app-ss>
              </div>

              <!-- Fechas -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <!-- Fecha inicio -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">Fecha inicio</label>
                  <app-date-input [formControl]="fechaInicioCtrl"></app-date-input>
                </div>

                <!-- Fecha fin -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">Fecha fin</label>
                  <app-date-input [formControl]="fechaFinCtrl" [min]="fechaInicioCtrl.value"></app-date-input>
                </div>

              </div>

              <!-- Instructor (solo al crear) -->
              @if (!modoEditar) {
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">
                    Instructor responsable
                    <span class="text-gray-400 text-xs font-normal">(opcional)</span>
                  </label>
                  <div class="relative">
                    <input
                      type="text"
                      [value]="instructorTexto"
                      (input)="onBuscarInstructor($any($event.target).value)"
                      (focus)="mostrarListaInstructor = true"
                      (blur)="ocultarListaConDelay()"
                      placeholder="Buscar instructor o administrador..."
                      autocomplete="off"
                      class="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />

                    @if (mostrarListaInstructor && instructoresFiltrados().length > 0) {
                      <div class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        @for (inst of instructoresFiltrados(); track inst.idPersona ?? inst.id_persona) {
                          <button type="button"
                            (mousedown)="seleccionarInstructor(inst)"
                            class="w-full text-left px-4 py-2 text-sm hover:bg-[#39A900]/10
                                   hover:text-[#39A900] transition-colors flex items-center gap-2">
                            <span class="flex-1">{{ inst.nombre }}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
                              {{ inst.cargo }}
                            </span>
                          </button>
                        }
                      </div>
                    }

                    @if (mostrarListaInstructor && instructoresFiltrados().length === 0 && instructorTexto.length > 0) {
                      <div class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-400">
                        Sin resultados para "{{ instructorTexto }}"
                      </div>
                    }
                  </div>
                </div>

                <!-- Horas al instructor (solo si se seleccionó uno) -->
                @if (form.instructorId) {
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1.5">
                      Horas asignadas al instructor
                    </label>
                    <input
                      type="number"
                      min="1"
                      [(ngModel)]="form.horasInstructor"
                      placeholder="Ej: 40"
                      class="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                  </div>
                }
              }

              <!-- Zona de archivos -->
              <app-file-upload-zone
                [multiple]="true"
                [hint]="'PDF, Word, Excel, imágenes · Máx. 10MB c/u · Hasta 20 archivos'"
                [files]="archivosSeleccionados"
                (filesChange)="archivosSeleccionados = $event"
                (clickZone)="abrirSelectorArchivos()"
              />

              <!-- Estado -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Estado</label>
                <app-ss [options]="estadoOptions" placeholder="Selecciona un estado"
                        [(ngModel)]="form.estado"></app-ss>
              </div>

              <!-- Observación -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1.5">Observación (opcional)</label>
                <textarea [(ngModel)]="form.observacion" rows="3"
                  placeholder="Escribe una observación..."
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] resize-y">
                </textarea>
              </div>

              @if (error()) {
                <p class="text-red-500 text-xs">{{ error() }}</p>
              }
            }
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
            <button (click)="closed.emit()" [disabled]="loading()"
              class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-60">
              Cancelar
            </button>
            <button (click)="guardar()" [disabled]="loading() || loadingData()"
              class="px-5 py-2 text-sm text-white font-medium rounded-lg transition-all
                     bg-sena-gradient hover:opacity-90
                     disabled:opacity-60 disabled:grayscale disabled:cursor-not-allowed">
              @if (loading()) {
                {{ modoEditar ? 'Guardando...' : 'Creando...' }}
              } @else {
                {{ modoEditar ? 'Guardar cambios' : 'Crear etapa práctica' }}
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CrearPracticaModalComponent implements OnChanges, OnInit {

  ngOnInit(): void {
      // Fecha fin < fecha inicio no es válido en ningún sentido: si cambia
      // la fecha inicio y deja obsoleta la fecha fin ya elegida, o si el
      // usuario elige una fecha fin anterior a la fecha inicio ya puesta,
      // se limpia y se avisa (antes solo se escuchaba fechaInicioCtrl, así
      // que elegir primero inicio y luego un fin anterior no se detectaba).
      this.fechaInicioCtrl.valueChanges.subscribe((fechaInicio)=>{
        if(!fechaInicio) return;

        const fechaFin = this.fechaFinCtrl.value;

        if(fechaFin && fechaFin.daySameOrAfter(fechaInicio) === false){
           this.fechaFinCtrl.setValue(null);
           this.error.set('La fecha fin se reinició porque era anterior a la nueva fecha de inicio.');
        }
      });

      this.fechaFinCtrl.valueChanges.subscribe((fechaFin)=>{
        if(!fechaFin) return;

        const fechaInicio = this.fechaInicioCtrl.value;

        if(fechaInicio && fechaFin.daySameOrAfter(fechaInicio) === false){
           this.fechaFinCtrl.setValue(null);
           this.error.set('La fecha fin no puede ser anterior a la fecha de inicio.');
        }
      });
  }

  /** UUID de la etapa existente — si se pasa, el modal entra en modo editar */
  @Input() practicaId: string | null = null;
  @Input() isOpen   = false;
  @Input() aprendices: any[] = [];
  @Input() alumnoPreseleccionado: any = null;
  @Output() closed  = new EventEmitter<void>();
  @Output() success = new EventEmitter<void>();

  get modoEditar(): boolean { return !!this.practicaId; }

  /* ── Señales ──────────────────────────────────────────────────── */
  modalidades  = signal<any[]>([]);
  empresas     = signal<any[]>([]);
  instructores = signal<any[]>([]);
  sinPractica  = signal<any[]>([]);
  loadingData  = signal(false);
  loading      = signal(false);
  error        = signal('');

  /* ── Calendarios ──────────────────────────────────────────────── */
  fechaInicioCtrl = new FormControl<TuiDay | null>(null);
  fechaFinCtrl    = new FormControl<TuiDay | null>(null);

  /* ── Opciones para los <app-ss> ───────────────────────────────── */
  aprendizOptions: () => SSOption[] = computed(() =>
    this.sinPractica().map(a => ({ value: a.id, label: `${a.name} — ${a.programa}` }))
  );
  modalidadOptions: () => SSOption[] = computed(() =>
    this.modalidades().map(m => ({ value: m.id, label: m.nombre }))
  );
  empresaOptions: () => SSOption[] = computed(() =>
    this.empresas().map(e => ({ value: e.id, label: e.nombre }))
  );
  estadoOptions: SSOption[] = [
    { value: 'activo',            label: 'Activo' },
    { value: 'inactivo',          label: 'Inactivo' },
    { value: 'suspendido',        label: 'Suspendido' },
    { value: 'condicionado',      label: 'Condicionado' },
    { value: 'certificado',       label: 'Certificado' },
    { value: 'por certificar',    label: 'Por certificar' },
    { value: 'cancelado',         label: 'Cancelado' },
    { value: 'retiro voluntario', label: 'Retiro Voluntario' },
  ];

  /* ── Autocomplete instructor ──────────────────────────────────── */
  instructorTexto        = '';
  mostrarListaInstructor = false;

  instructoresFiltrados = computed(() => {
    const texto = this.instructorTexto.toLowerCase().trim();
    if (!texto) return this.instructores();
    return this.instructores().filter((p: any) =>
      (p.nombre ?? '').toLowerCase().includes(texto)
    );
  });

  /* ── Archivos ─────────────────────────────────────────────────── */
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;
  archivosSeleccionados: File[] = [];

  /* ── Modelo formulario ────────────────────────────────────────── */
  form = {
    aprendizId:      '',
    modalidadId:     '',
    empresaId:       '',
    estado:          'activo',
    observacion:     '',
    instructorId:    '',
    horasInstructor: 0,
  };

  constructor(
    private practicaSvc:  PracticaService,
    private matriculaSvc: MatriculaService,
    private personaSvc:   PersonaService,
    private toast:        ToastService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.resetForm();
      this.cargarDatos();
    }
    if (changes['aprendices']) {
      this.sinPractica.set(this.aprendices.filter(a => !a.id_practica));
    }
  }

  resetForm(): void {
    this.form = {
      aprendizId:      this.alumnoPreseleccionado
        ? String(this.alumnoPreseleccionado.id ?? this.alumnoPreseleccionado.idPersona ?? '')
        : '',
      modalidadId:     '',
      empresaId:       '',
      estado:          'activo',
      observacion:     '',
      instructorId:    '',
      horasInstructor: 0,
    };
    this.fechaInicioCtrl.reset(null);
    this.fechaFinCtrl.reset(null);
    this.instructorTexto        = '';
    this.mostrarListaInstructor = false;
    this.archivosSeleccionados  = [];
    this.error.set('');
  }

  /* ── Carga de catálogos ───────────────────────────────────────── */
  async cargarDatos(): Promise<void> {
    this.loadingData.set(true);
    try {
      if (this.modoEditar) {
        const [mods, emps, practica] = await Promise.all([
          this.practicaSvc.listarModalidades(),
          this.practicaSvc.listarEmpresas(),
          this.practicaSvc.obtenerPractica(this.practicaId!),
        ]);
        this.modalidades.set(mods);
        this.empresas.set(emps);
        this.prepoblarDesde(practica, mods, emps);
      } else {
        const [mods, emps, insts] = await Promise.all([
          this.practicaSvc.listarModalidades(),
          this.practicaSvc.listarEmpresas(),
          this.personaSvc.listarInstructores(),
        ]);
        this.modalidades.set(mods);
        this.empresas.set(emps);
        this.instructores.set(insts);
      }
    } catch {
      this.error.set('Error cargando datos.');
    } finally {
      this.loadingData.set(false);
    }
  }

  /** Pre-popula el formulario con los datos del backend en modo editar */
  private prepoblarDesde(practica: any, mods: any[], emps: any[]): void {
    const modalidad = mods.find((m: any) =>
      m.id === (practica.modalidadId ?? practica.fk_modalidad) ||
      m.nombre === practica.modalidad?.nombre
    );
    const empresa = emps.find((e: any) =>
      e.id === (practica.empresaId ?? practica.fk_empresa) ||
      e.nombre === practica.empresa?.nombre
    );

    this.form.modalidadId = modalidad?.id ? String(modalidad.id) : '';
    this.form.empresaId   = empresa?.id   ? String(empresa.id)   : '';
    this.form.estado      = practica.estado      ?? 'activo';
    this.form.observacion = practica.observacion ?? '';

    this.fechaInicioCtrl.setValue(
      this.isoToTuiDay(practica.fecha_inicio ?? practica.fechaInicio ?? '')
    );
    this.fechaFinCtrl.setValue(
      this.isoToTuiDay(practica.fecha_fin ?? practica.fechaFin ?? '')
    );
  }

  /* ── Autocomplete instructor ──────────────────────────────────── */
  onBuscarInstructor(texto: string): void {
    this.instructorTexto        = texto;
    this.mostrarListaInstructor = true;
    if (!texto.trim()) this.form.instructorId = '';
  }

  seleccionarInstructor(inst: any): void {
    this.form.instructorId      = String(inst.idPersona ?? inst.id_persona ?? inst.id ?? '');
    this.instructorTexto        = inst.nombre ?? '';
    this.mostrarListaInstructor = false;
  }

  ocultarListaConDelay(): void {
    setTimeout(() => { this.mostrarListaInstructor = false; }, 200);
  }

  /* ── Archivos ─────────────────────────────────────────────────── */

  abrirSelectorArchivos(): void {
    const input = this.fileInputRef?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onArchivosSeleccionados(event: Event): void {
    const input = event.target as HTMLInputElement;
    const nuevos = Array.from(input.files ?? []);
    this.archivosSeleccionados = [...this.archivosSeleccionados, ...nuevos];
    input.value = '';
  }

  /** Sube los archivos al endpoint del módulo documentos */
  private async subirDocumentos(etapaId: string): Promise<void> {
    if (!this.archivosSeleccionados.length) return;
    const formData = new FormData();
    this.archivosSeleccionados.forEach(f => formData.append('archivos', f));
    await this.practicaSvc.subirDocumentos(etapaId, formData);
  }

  /* ── Helpers de fecha ─────────────────────────────────────────── */
  private tuiDayToISO(day: TuiDay | null): string {
    if (!day) return '';
    const m = String(day.month + 1).padStart(2, '0');
    const d = String(day.day).padStart(2, '0');
    return `${day.year}-${m}-${d}`;
  }

  private isoToTuiDay(iso: string): TuiDay | null {
    if (!iso) return null;
    const parts = iso.substring(0, 10).split('-');
    if (parts.length !== 3) return null;
    return new TuiDay(+parts[0], +parts[1] - 1, +parts[2]);
  }

  /* ── Guardar ──────────────────────────────────────────────────── */
  async guardar(): Promise<void> {
    const fechaInicio = this.tuiDayToISO(this.fechaInicioCtrl.value);
    const fechaFin    = this.tuiDayToISO(this.fechaFinCtrl.value);

    if (!this.form.modalidadId) { this.error.set('Selecciona una modalidad.'); return; }
    if (!this.form.empresaId)   { this.error.set('Selecciona una empresa.'); return; }
    if (!fechaInicio)           { this.error.set('Ingresa la fecha de inicio.'); return; }
    if (!fechaFin)              { this.error.set('Ingresa la fecha de fin.'); return; }
    // Comparación lexicográfica válida: ambas son ISO "YYYY-MM-DD" con padding.
    if (fechaFin < fechaInicio) { this.error.set('La fecha fin no puede ser anterior a la fecha de inicio.'); return; }

    this.loading.set(true);
    this.error.set('');

    try {
      let etapaId: string;

      if (this.modoEditar) {
        await this.guardarEdicion(fechaInicio, fechaFin);
        etapaId = this.practicaId!;
      } else {
        etapaId = await this.guardarCreacion(fechaInicio, fechaFin);
      }

      await this.subirDocumentos(etapaId);

      this.toast.ok(
        this.modoEditar ? 'Etapa actualizada' : 'Etapa creada',
        this.modoEditar
          ? 'Los cambios fueron guardados correctamente.'
          : 'La etapa práctica fue creada correctamente.',
      );
      this.success.emit();
      this.closed.emit();
    } catch (e: any) {
      // Si guardarCreacion()/guardarEdicion() ya dejó un mensaje específico
      // (p.ej. "sin matrícula") antes de lanzar el error, ese tiene prioridad
      // sobre el mensaje genérico de la respuesta HTTP.
      const especifico = this.error();
      const msg = e?.error?.message;
      const detail = especifico || (
        Array.isArray(msg)      ? msg.join(' · ') :
        typeof msg === 'string' ? msg :
        this.modoEditar         ? 'Error al guardar los cambios.' :
                                  'Error al crear la etapa práctica.'
      );
      this.error.set(detail);
      this.toast.error('Error', detail);
    } finally {
      this.loading.set(false);
    }
  }

  private async guardarEdicion(fechaInicio: string, fechaFin: string): Promise<void> {
    await this.practicaSvc.actualizarPractica(this.practicaId!, {
      modalidadId:  this.form.modalidadId,
      empresaId:    this.form.empresaId,
      fecha_inicio: fechaInicio,
      fecha_fin:    fechaFin,
      estado:       this.form.estado,
      observacion:  this.form.observacion,
    });
  }

  /** Crea la práctica y retorna el id generado por el backend */
  private async guardarCreacion(fechaInicio: string, fechaFin: string): Promise<string> {
    const aprendizId = this.alumnoPreseleccionado
      ? String(this.alumnoPreseleccionado.id ?? this.alumnoPreseleccionado.idPersona ?? '')
      : this.form.aprendizId;

    if (!aprendizId) { this.error.set('Selecciona un aprendiz.'); throw new Error('sin aprendiz'); }

    const matriculas = await this.matriculaSvc.listarMatriculasPorAlumno(aprendizId);
    if (!matriculas.length) {
      this.error.set('El aprendiz no tiene una matrícula registrada. Por favor crea la matrícula antes de asignar la etapa práctica.');
      throw new Error('sin matricula');
    }

    if (this.form.instructorId && (!this.form.horasInstructor || this.form.horasInstructor < 1)) {
      this.error.set('Ingresa las horas asignadas al instructor.');
      throw new Error('horas requeridas');
    }

    const matriculaId = matriculas[0].idMatricula ?? matriculas[0].id_matricula;

    const resultadosAprobados = this.alumnoPreseleccionado
      ? Boolean(this.alumnoPreseleccionado.resultados_aprobados ?? false)
      : Boolean(matriculas[0]?.resultadosAprobados ?? false);

    const payload: any = {
      matriculaId,
      modalidadId:      this.form.modalidadId,
      empresaId:        this.form.empresaId,
      fecha_inicio:     fechaInicio,
      fecha_fin:        fechaFin,
      estado:           this.form.estado,
      observacion:      this.form.observacion,
      resultadosAprobados,
        };

    if (this.form.instructorId) {
      payload.asignacion = {
        instructor:   this.form.instructorId,
        fecha_inicio: fechaInicio,
        fecha_fin:    fechaFin,
        estado:       'activo',
        horas:        Number(this.form.horasInstructor),
      };
    }

    const respuesta = await this.practicaSvc.crearPractica(payload);
    return String(respuesta?.id ?? respuesta?.idEtapa ?? respuesta?.etapaId ?? '');
  }

  /* ── Util ─────────────────────────────────────────────────────── */
  initials(name: string): string {
    return (name ?? '').split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase();
  }
}
