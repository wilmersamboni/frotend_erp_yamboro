import { Injectable, signal, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MessageService, ConfirmationService } from 'primeng/api';
import { CONFIG, Modulo } from '../config/admin.config';

export interface OpcionSelect {
  label: string;
  value: any;
}

@Injectable()
export class AdminService {

  // ── FILTRO ──────────────────────────────────────────────
  filtro = signal<string>('');

  // ── State ──────────────────────────────────────────────
  activeTab     = signal<Modulo>('personas');
  data          = signal<Record<string, any[]>>({});
  loading       = signal(false);
  modalOpen     = signal(false);
  editando      = signal<any | null>(null);
  saving        = signal(false);
  modalError    = signal<string | null>(null);
  modalForm:    Record<string, any> = {};

  /** Datos crudos sin aplanar (UUIDs reales) — usado en edición y por paneles
   *  que necesitan cruzar relaciones (ej. app-permisos-panel). */
  rawData = signal<Record<string, any[]>>({});

  /** Opciones de selects para el modal activo: { campo → [{label, value}] } */
  opcionesModal: Record<string, OpcionSelect[]> = {};

  // ── Paginación ─────────────────────────────────────────
  paginaActual       = signal(1);
  registrosPorPagina = signal(20);

  /** Registro de módulos ya cargados (o en curso) — ver cargarConDependencias. */
  private cargaPromesas = new Map<Modulo, Promise<void>>();

  constructor(
    private http:        HttpClient,
    private msg:         MessageService,
    private confirmSvc:  ConfirmationService,
  ) {
    // Cada cambio de pestaña dispara la carga de ESE módulo (y sus dependencias
    // de FK), en vez de traer las ~24 tablas del sistema de una sola vez al
    // entrar al panel. Memoizado en cargarConDependencias: volver a una
    // pestaña ya visitada no repite la petición.
    effect(() => {
      const mod = this.activeTab();
      this.paginaActual.set(1);
      this.cargarActivo(mod);
    }, { allowSignalWrites: true });
  }

  private async cargarActivo(mod: Modulo): Promise<void> {
    this.loading.set(true);
    try {
      await this.cargarConDependencias(mod);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Carga un módulo junto con los módulos de los que dependen sus
   * `selectores` (necesarios para resolver FKs a nombres legibles y para
   * poblar los <select> del modal de creación/edición) — recursivamente,
   * así que también arrastra las dependencias transitivas (p.ej. cursos →
   * áreas → sedes → centros). Memoizado por módulo: una vez cargado, cambiar
   * de pestaña y volver no repite la petición hasta que `cargar()` lo invalide.
   */
  private cargarConDependencias(mod: Modulo): Promise<void> {
    const enCurso = this.cargaPromesas.get(mod);
    if (enCurso) return enCurso;

    const deps = new Set(Object.values(CONFIG[mod].selectores ?? {}).map(s => s.modulo));
    const promesa = (async () => {
      await Promise.all([...deps].map(d => this.cargarConDependencias(d)));
      await this.cargarDatos(mod);
    })();

    this.cargaPromesas.set(mod, promesa);
    return promesa;
  }

  // ── DATA BASE ──────────────────────────────────────────
  private allActiveData = computed(() =>
    this.data()[this.activeTab()] ?? []
  );

  // ── FILTRADO ──────────────────────────────────────────
  private filteredData = computed(() => {
  const filtro = this.filtro().toLowerCase().trim();
  const data = this.allActiveData();

  if (!filtro) {
    return data;
  }

  return data.filter((item: any) => {
    // Unir nombre + apellido
    const nombreCompleto = `${item.nombre ?? ''} ${item.apellido ?? ''}`
      .toLowerCase()
      .trim();

    // Buscar también en los demás campos
    const coincideNombre = nombreCompleto.includes(filtro);

    const coincideOtrosCampos = Object.entries(item).some(
      ([key, valor]: [string, any]) => {
        // Evitamos buscar nuevamente en nombre/apellido
        if (key === 'nombre' || key === 'apellido') {
          return false;
        }

        if (valor === null || valor === undefined) {
          return false;
        }

        return String(valor)
          .toLowerCase()
          .includes(filtro);
      }
    );

    return coincideNombre || coincideOtrosCampos;
  });
});

  // ── DATA PAGINADA (YA FILTRADA) ───────────────────────
  activeData = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.registrosPorPagina();
    const fin = inicio + this.registrosPorPagina();
    return this.filteredData().slice(inicio, fin);
  });

  // ── COLUMNAS ──────────────────────────────────────────
  activeColumns = computed(() => {
    const mod = this.activeTab();
    const cfg = CONFIG[mod];

    if (cfg.columnas) return cfg.columnas;

    const rows = this.allActiveData();
    if (!rows.length) return [];

    // Campos a ocultar siempre en la vista de tabla
    const SYSTEM_FIELDS = new Set([
      'id', 'centroid', 'sedeid', 'createdat', 'updatedat',
      'actas_pdf', 'ruta_archivo', 'mime_type', 'tamanio',
    ]);

    return Object.keys(rows[0]).filter(k => {
      const key = k.toLowerCase();
      return (
        !SYSTEM_FIELDS.has(key) &&
        !key.includes('password') &&
        !key.includes('token') &&
        !key.includes('secret') &&
        !key.startsWith('id_') &&
        !key.startsWith('fk_') &&
        !k.endsWith('Id')   // oculta FK crudas como municipioId, etapaId, etc.
      );
    });
  });

  editableColumns = computed(() => {
    const mod = this.activeTab();
    const cfg = CONFIG[mod];

    if (cfg.campos) return cfg.campos;

    return this.activeColumns().filter(c =>
      !c.startsWith('id_') && !c.startsWith('fk_')
    );
  });

  // ── PAGINACIÓN ────────────────────────────────────────
  setRegistrosPorPagina(n: number) {
    this.registrosPorPagina.set(n);
    this.paginaActual.set(1);
  }

  totalRegistros = computed(() => this.filteredData().length);

  totalPaginas = computed(() =>
    Math.ceil(this.totalRegistros() / this.registrosPorPagina())
  );

  // ── FILTRO ────────────────────────────────────────────
  setFiltro(valor: string) {
    this.filtro.set(valor);
    this.paginaActual.set(1);
  }

  // ── HTTP ──────────────────────────────────────────────

  /**
   * Carga un módulo sin tocar el signal `loading` (para uso interno en
   * cargarConDependencias, que gestiona `loading` de forma centralizada).
   */
  private async cargarDatos(mod: Modulo): Promise<void> {
    try {
      const result: any = await firstValueFrom(
        this.http.get(CONFIG[mod].listar, { withCredentials: true })
      );
      let rows = Array.isArray(result) ? result : result?.data ?? [];

      if (mod === 'matriculas') {
        const personasRaw: any[] = this.rawData()['personas'] ?? [];
        rows = rows.map((m: any) => {
          const personaId  = m.idPersona ?? (typeof m.persona === 'string' ? m.persona : m.persona?.idPersona) ?? '';
          const cursoId    = m.idCurso   ?? (typeof m.curso   === 'string' ? m.curso   : m.curso?.idCurso)     ?? '';
          const personaData = personasRaw.find((p: any) => p.idPersona === personaId);
          return {
            ...m,
            persona:    personaId,
            curso:      cursoId,
            // avance llega como string decimal "0.00" desde la BD → convertir a número
            avance:     m.avance != null ? parseFloat(m.avance) : m.avance,
            estudiante: personaData?.nombre ?? m.persona?.nombre ?? m.persona?.name ?? '—',
            cargo:      personaData?.cargo  ?? m.persona?.cargo  ?? '—',
          };
        });
      }

      // Etapas: añadir campo 'aprendiz' cruzando matriculaId → rawData de matrículas
      // Esto permite usar label: 'aprendiz' en el selector de etapas dentro de seguimientos.
      // Se ejecuta ANTES del rawData.update para que rawData ya lleve el campo calculado.
      if (mod === 'etapas') {
        const matriculas: any[] = this.rawData()['matriculas'] ?? [];
        rows = rows.map((e: any) => {
          const mat = matriculas.find(
            (m: any) => String(m.idMatricula ?? '').toLowerCase() === String(e.matriculaId ?? '').toLowerCase()
          );
          return {
            ...e,
            aprendiz: mat?.persona?.nombre ?? mat?.estudiante ?? '—',
          };
        });
      }

      if (mod === 'credenciales') {
        rows = rows.map((c: any) => ({
          ...c,
          usuario: c.usuario?.persona?.nombre ?? c.usuario?.idUsuario ?? '—',
          rol:     c.rol?.nombre              ?? c.rol?.descripcion    ?? '—',
        }));
      }

      // Guarda copia cruda (con UUIDs reales) para usar en edición
      this.rawData.update(d => ({ ...d, [mod]: rows }));

      // Seguimientos: añadir campo 'aprendiz' cruzando etapa → rawData de etapas (ya tienen el aprendiz calculado)
      if (mod === 'seguimientos') {
        const etapas: any[] = this.rawData()['etapas'] ?? [];
        rows = rows.map((s: any) => {
          const etapaId = s.etapa?.id ?? s.etapaId ?? s.etapa ?? '';
          const etapa = etapas.find(
            (e: any) => String(e.id ?? '').toLowerCase() === String(etapaId).toLowerCase()
          );
          return { ...s, aprendiz: etapa?.aprendiz ?? '—' };
        });
      }
      // Resolución inline de municipio en empresas:
      // 'municipio' guarda UUID del municipio como texto plano en api2.
      // Si rawData de municipios ya está disponible lo resolvemos aquí;
      // si no, hacemos un fetch puntual para garantizarlo.
      if (mod === 'empresas') {
        let municipios: any[] = this.rawData()['municipios'] ?? [];
        if (municipios.length === 0) {
          try {
            const r: any = await firstValueFrom(
              this.http.get('/api/municipios', { withCredentials: true })
            );
            municipios = Array.isArray(r) ? r : r?.data ?? [];
            this.rawData.update(d => ({ ...d, municipios }));
          } catch (err) {
            console.error('[Admin] No se pudo cargar municipios para empresas:', err);
          }
        }

        // Debug: muestra qué claves tiene el primer municipio para detectar el nombre real del PK
        if (municipios.length > 0) {
          console.log('[Admin] municipios[0] keys:', Object.keys(municipios[0]));
          console.log('[Admin] municipios sample:', municipios.slice(0, 3).map((m: any) => ({
            idMunicipio: m.idMunicipio, id_municipio: m.id_municipio, nombre: m.nombre,
          })));
        } else {
          console.warn('[Admin] rawData[municipios] está vacío — no se podrá resolver municipio en empresas');
        }

        // Primera pasada: resolver con la lista en memoria
        const unresolved: { idx: number; uuid: string }[] = [];
        rows = rows.map((e: any, idx: number) => {
          const raw  = String(e.municipio ?? '').trim().toLowerCase();
          const match = municipios.find((m: any) => {
            const pk = String(m.idMunicipio ?? m.id_municipio ?? m.id ?? '').trim().toLowerCase();
            const nombre = String(m.nombre ?? '').trim().toLowerCase();
            return pk === raw || nombre === raw;
          });
          if (match) return { ...e, municipio: match.nombre };
          // UUID no encontrado en la lista — intentar fetch individual
          if (e.municipio && /^[0-9a-f-]{36}$/i.test(String(e.municipio))) {
            unresolved.push({ idx, uuid: e.municipio });
          }
          return e; // mantiene UUID por ahora
        });

        // Segunda pasada: fetch individual para UUIDs no encontrados en la lista
        if (unresolved.length > 0) {
          const fetchResults = await Promise.allSettled(
            unresolved.map(async ({ idx, uuid }) => {
              const r: any = await firstValueFrom(
                this.http.get(`/api/municipios/${uuid}`, { withCredentials: true })
              );
              return { idx, nombre: r?.nombre ?? uuid };
            })
          );
          fetchResults.forEach((res, i) => {
            if (res.status === 'fulfilled') {
              const { idx, nombre } = res.value;
              rows[idx] = { ...rows[idx], municipio: nombre };
              // Agrega a la lista para futuros usos en esta sesión
              const uuid = unresolved[i].uuid;
              if (!municipios.some((m: any) => (m.idMunicipio ?? m.id) === uuid)) {
                municipios.push({ idMunicipio: uuid, nombre });
                this.rawData.update(d => ({ ...d, municipios: [...(d['municipios'] ?? []), { idMunicipio: uuid, nombre }] }));
              }
            } else {
              console.warn(`[Admin] municipio UUID "${unresolved[i].uuid}" no encontrado en backend-epsas`);
            }
          });
        }
      }

      // Resuelve otros FK UUIDs a nombres legibles
      rows = this.resolverSelectores(mod, rows);

      // Aplana objetos anidados para mostrar en tabla
      rows = rows.map((fila: any) => this.aplanarFila(fila));
      this.data.update(d => ({ ...d, [mod]: rows }));

    } catch (e: any) {
      const status = e?.status ?? '?';
      const detail = e?.error?.message ?? e?.error?.mensaje ?? e?.message ?? 'Error desconocido';
      console.error(`[Admin] Error cargando ${mod} (${status}):`, detail);
      this.msg.add({
        severity: 'warn',
        summary: `No se pudo cargar ${CONFIG[mod].label}`,
        detail: status === 401 ? 'Sin autorización — vuelve a iniciar sesión' : String(detail),
        life: 6000,
      });
    }
  }

  /**
   * Para cada selector definido en el módulo, reemplaza el campo FK UUID
   * por un campo con nombre legible, p.ej. municipioId → municipio: 'Bogotá'.
   * Opera sobre los datos de display (no modifica rawData).
   */
  /**
   * Para cada selector definido en el módulo, reemplaza el campo FK UUID
   * por un campo con nombre legible, p.ej. municipioId → municipio: 'Bogotá'.
   * Si el campo FK no existe en la fila (el backend ya devuelve un objeto anidado),
   * se omite sin tocar el dato original para que aplanarFila lo procese.
   */
  private resolverSelectores(mod: Modulo, rows: any[]): any[] {
    const cfg = CONFIG[mod];
    if (!cfg.selectores) return rows;

    return rows.map(row => {
      const display: any = { ...row };
      for (const [campo, selector] of Object.entries(cfg.selectores!)) {
        let fkVal = row[campo];
        // Nombre de clave para mostrar: quita el sufijo 'Id' si existe
        const displayKey = campo.endsWith('Id') ? campo.slice(0, -2) : campo;
        // Si el backend devuelve un objeto anidado { id: '...' }, extraemos el UUID
        if (fkVal !== null && typeof fkVal === 'object' && !Array.isArray(fkVal)) {
          fkVal = fkVal['id'] ?? fkVal['uuid'] ?? null;
        }
        // Si no hay campo FK plano (p.ej. 'usuarioId') pero sí el objeto de
        // relación ya anidado bajo el nombre sin 'Id' (p.ej. 'usuario', como
        // devuelve GET /permisos con eager relations), resolvemos el label
        // desde ESE objeto en vez de ir a rawData() — aplanarFila solo aplana
        // un nivel, así que esto cubre selectores cuyo `label` en realidad
        // vive un nivel más adentro (ej. usuario.persona.nombre).
        if ((fkVal === null || fkVal === undefined) && row[displayKey] && typeof row[displayKey] === 'object') {
          const objAnidado: any = row[displayKey];
          let nested: any = objAnidado[selector.label];
          if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
            nested = nested.nombre ?? nested.codigo ?? nested.descripcion ?? nested.name
              ?? Object.values(nested).find((v: any) => typeof v === 'string') ?? null;
          }
          if (nested !== null && nested !== undefined) display[displayKey] = String(nested);
          // Misma razón que en aplanarFila: la cédula vive en el objeto
          // anidado y se pierde acá (este branch resuelve el selector ANTES
          // de que aplanarFila llegue a procesar `persona`, así que el
          // stash de aplanarFila nunca se alcanza para módulos con
          // `selectores` como usuarios) — sin esto, buscar por cédula en la
          // pestaña Usuarios no encontraba nada.
          if (objAnidado.cedula !== undefined && objAnidado.cedula !== null) {
            display[`${displayKey}Cedula`] = objAnidado.cedula;
          }
          continue;
        }
        // Si el campo no existe como FK plana, lo salta para que aplanarFila lo procese.
        if (fkVal === null || fkVal === undefined) continue;

        const relItems: any[] = this.rawData()[selector.modulo] ?? [];
        const fkStr = String(fkVal).trim().toLowerCase();
        const match = relItems.find((item: any) => {
          // intenta con el value configurado, luego con variantes snake/camel del PK
          const primary = String(item[selector.value] ?? '').trim().toLowerCase();
          if (primary === fkStr) return true;
          // fallback: prueba id_municipio, idMunicipio, id, etc.
          const alt = String(item['id_municipio'] ?? item['idMunicipio'] ?? item['id'] ?? '').trim().toLowerCase();
          return alt === fkStr;
        });
        display[displayKey] = match
          ? (match[selector.label] ?? String(fkVal))
          : String(fkVal);
        // Elimina el campo crudo UUID de la vista (queda solo en rawData)
        if (displayKey !== campo) delete display[campo];
      }
      return display;
    });
  }

  private aplanarFila(fila: any): any {
    const resultado: any = {};
    for (const [clave, valor] of Object.entries(fila)) {
      if (
        valor !== null &&
        typeof valor === 'object' &&
        !Array.isArray(valor) &&
        !(valor instanceof Date)
      ) {
        const obj = valor as any;
        resultado[clave] =
          obj.nombre ??
          obj.codigo ??
          obj.descripcion ??
          obj.name ??
          Object.values(obj).find(v => typeof v === 'string') ??
          '—';
        // La cédula vive un nivel más adentro (ej. usuarios: item.persona.cedula)
        // y se pierde al aplanar (solo se queda el nombre como string) — sin
        // esto, buscar por cédula en la pestaña Usuarios no encontraba nada
        // porque filteredData() solo escanea las claves de primer nivel.
        // No se muestra como columna propia (no está en cfg.columnas), solo
        // queda disponible para que el buscador la encuentre.
        if (obj.cedula !== undefined && obj.cedula !== null) {
          resultado[`${clave}Cedula`] = obj.cedula;
        }
      } else {
        resultado[clave] = valor;
      }
    }
    return resultado;
  }

  /** Recarga un módulo individual (muestra spinner durante la operación). */
  async cargar(mod: Modulo): Promise<void> {
    this.loading.set(true);
    await this.cargarDatos(mod);
    // Marca el módulo como ya cargado para que cargarConDependencias no
    // repita esta petición la próxima vez que se visite su pestaña.
    this.cargaPromesas.set(mod, Promise.resolve());
    this.loading.set(false);
  }

  // ── SELECTORES ────────────────────────────────────────
  private buildOpciones(mod: Modulo): Record<string, OpcionSelect[]> {
    const cfg = CONFIG[mod];
    const opciones: Record<string, OpcionSelect[]> = {};

    for (const [campo, selector] of Object.entries(cfg.selectores ?? {})) {
      let items: any[] = this.data()[selector.modulo] ?? [];

      // Aplica filtro si está definido en el selector (p.ej. { cargo: 'aprendiz' })
      if (selector.filtro) {
        items = items.filter((item: any) =>
          Object.entries(selector.filtro!).every(([k, v]) => item[k] === v)
        );
      }

      opciones[campo] = items.map(item => ({
      label: item[selector.label] ?? '—',
      value: item[selector.value],
    }));
    }
    // Opciones estáticas
        const staticOpts = cfg.opcionesEstaticas ?? {};
        for (const [campo, opts] of Object.entries(staticOpts)) {
          opciones[campo] = opts;
        }

        return opciones;
  }

  // ── MODAL ─────────────────────────────────────────────
  /**
   * Abre el modal de creación. Espera a que el módulo activo (y los módulos
   * de sus selectores) terminen de cargar antes de construir las opciones —
   * necesario para "crear directo" desde la pantalla de inicio (crearDirecto),
   * que activa la pestaña y abre el modal en el mismo instante, sin margen
   * para que la carga perezosa haya terminado todavía.
   */
  async abrirModal(): Promise<void> {
    const mod = this.activeTab();
    await this.cargarConDependencias(mod);

    this.editando.set(null);
    this.modalForm = {};
    const tiposCampo = CONFIG[mod].tiposCampo ?? {};
    const defaults = CONFIG[mod].defaultsCampo ?? {};
    this.editableColumns().forEach(c => (
      this.modalForm[c] = c in defaults ? defaults[c] : (tiposCampo[c] === 'boolean' ? false : '')
    ));
    this.opcionesModal = this.buildOpciones(mod);
    this.modalError.set(null);
    this.modalOpen.set(true);
  }

  editarFila(row: any): void {
    const mod = this.activeTab();
    const cfg = CONFIG[mod];

    // ✅ Busca el registro crudo (con UUIDs reales) en lugar del aplanado
    const rawRow = this.rawData()[mod]?.find(
      r => r[cfg.idKey] === row[cfg.idKey]
    ) ?? row;

    this.editando.set(rawRow);
    this.modalForm = { ...rawRow };
    this.opcionesModal = this.buildOpciones(mod);
    this.modalError.set(null);
    this.modalOpen.set(true);
  }

  cerrarModal(): void {
    this.modalOpen.set(false);
    this.editando.set(null);
    this.modalError.set(null);
  }

  private sanitizarForm(form: Record<string, any>): Record<string, any> {
    const mod = this.activeTab();
    const tiposCampo = CONFIG[mod]?.tiposCampo ?? {};
    const resultado: Record<string, any> = {};
    for (const [clave, valor] of Object.entries(form)) {
      if (valor === '' || valor === null || valor === undefined) continue;

      if (tiposCampo[clave] === 'number') {
        // Campo explícitamente numérico: convertir string a número si es necesario
        if (typeof valor === 'string' && valor.trim() !== '') {
          const num = Number(valor.trim());
          resultado[clave] = isNaN(num) ? valor : num;
        } else {
          resultado[clave] = valor; // ya es número (desde input type="number")
        }
      } else {
        // Campo NO numérico: si el API devolvió un number (p.ej. nit como int en DB),
        // lo convertimos a string porque el DTO del backend espera @IsString().
        resultado[clave] = typeof valor === 'number' ? String(valor) : valor;
      }
    }
    return resultado;
  }

  /**
   * Traduce los errores de validación del backend (class-validator, en inglés
   * y por campo) a un mensaje legible en español, agrupado por campo.
   * Ej: ['telefono should not be empty', 'telefono must be a string']
   *  →  'Revisa estos campos: Telefono es obligatorio'
   */
  private extraerMensajeError(e: any): string {
    const body = e?.error;
    const raw  = body?.message;

    if (Array.isArray(raw) && raw.length) {
      // Agrupa todos los mensajes por campo (class-validator emite uno por decorador)
      const porCampo = new Map<string, string[]>();
      for (const msgRaw of raw) {
        const m = String(msgRaw);
        const campo = m.split(' ')[0];
        (porCampo.get(campo) ?? porCampo.set(campo, []).get(campo)!).push(m);
      }

      const detalles: string[] = [];
      for (const [campo, mensajes] of porCampo) {
        const etiqueta = campo
          .replace(/([A-Z])/g, ' $1')
          .replace(/_/g, ' ')
          .trim()
          .toLowerCase()
          .replace(/^\w/, c => c.toUpperCase());

        const valores = mensajes
          .map(m => /must be one of the following values: (.+)/i.exec(m))
          .find(Boolean);

        let motivo = 'es inválido';
        if (mensajes.some(m => /should not be empty/i.test(m)))    motivo = 'es obligatorio';
        else if (mensajes.some(m => /must be an? email/i.test(m))) motivo = 'debe ser un correo válido';
        else if (mensajes.some(m => /must be a number/i.test(m)))  motivo = 'debe ser un número';
        else if (valores)                                          motivo = `debe ser uno de: ${valores[1]}`;

        detalles.push(`${etiqueta} ${motivo}`);
      }

      if (detalles.length) return 'Revisa estos campos: ' + detalles.join(' · ');
    }

    if (typeof raw === 'string' && raw.trim()) return raw;
    return body?.mensaje ?? body?.error ?? 'Error al guardar.';
  }

  // ── CRUD ──────────────────────────────────────────────
  async guardar(): Promise<void> {
  const mod = this.activeTab();
  const cfg = CONFIG[mod];
  this.saving.set(true);
  this.modalError.set(null);

  try {
    const registroExistente = this.editando();
    let formData = this.sanitizarForm(this.modalForm);

    // --- NUEVA LÓGICA DE FILTRADO ---
    // Si el módulo tiene una lista de 'campos' definida, eliminamos todo lo que no esté en ella.
    if (cfg.campos) {
      const bodyFiltrado: Record<string, any> = {};
      cfg.campos.forEach(campo => {
        if (formData.hasOwnProperty(campo)) {
          bodyFiltrado[campo] = formData[campo];
        }
      });
      formData = bodyFiltrado;
    }
    // --------------------------------

    const opts = { withCredentials: true };

    if (registroExistente) {
      // Eliminamos el ID por si acaso no estaba en 'campos' pero sí en formData
      const { [cfg.idKey]: _, ...body } = formData;
      const url = cfg.actualizar!(registroExistente[cfg.idKey]);

      await firstValueFrom(
        cfg.usePatch
          ? this.http.patch(url, body, opts)
          : this.http.put(url, body, opts)
      );
    } else {
      await firstValueFrom(this.http.post(cfg.crear!, formData, opts));
    }

    this.cerrarModal();
    await this.cargar(mod);

    this.msg.add({
      severity: 'success',
      summary: registroExistente ? 'Actualizado' : 'Registrado',
      detail: `El registro fue procesado correctamente.`,
      life: 3000,
    });
  } catch (e: any) {
      const detail = this.extraerMensajeError(e);
      this.modalError.set(detail);
      this.msg.add({ severity: 'error', summary: 'No se pudo guardar', detail, life: 6000 });
    } finally {
      this.saving.set(false);
    }
  }

  eliminarFila(row: any): void {
    const mod = this.activeTab();
    const cfg = CONFIG[mod];

    this.confirmSvc.confirm({
      message: '¿Estás seguro? Esta acción no se puede deshacer.',
      header: 'Atención',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Sí, eliminar', severity: 'danger' },
      accept: async () => {
        try {
          await firstValueFrom(this.http.delete(cfg.eliminar!(row[cfg.idKey]), { withCredentials: true }));
          await this.cargar(mod);
          this.msg.add({
            severity: 'success',
            summary: 'Eliminado',
            detail: 'Registro eliminado correctamente.',
            life: 3000,
          });
        } catch (e: any) {
          const detail = e?.error?.mensaje ?? e?.error?.error ?? 'No se pudo eliminar.';
          this.msg.add({ severity: 'error', summary: 'No se pudo eliminar', detail, life: 5000 });
        }
      },
    });
  }
}