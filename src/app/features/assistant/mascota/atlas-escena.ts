import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MaquinaEstado, PARAMETROS, salidaConRebote, type EstadoAtlas } from './atlas-estados';

/**
 * Escena 3D de Atlas. Se carga con import() dinámico desde el componente, así
 * three.js solo se descarga en /m y nunca entra al bundle principal del ERP.
 *
 * Todo es procedural (primitivas + luces + un mapa de entorno de estudio): no
 * se descarga ningún modelo ni textura, y el servidor no llama a nadie.
 */
export interface OpcionesEscena {
  lienzo: HTMLCanvasElement;
  /** El usuario pidió menos movimiento (prefers-reduced-motion): sin flotar, parpadear ni girar. */
  reducirMovimiento: boolean;
  /** Pocos FPS o contexto WebGL perdido: quien llama debe pasar al respaldo CSS y destruir la escena. */
  alDegradar: () => void;
  /** No vigilar el rendimiento (localStorage atlas3d=forzar, útil para depurar). */
  sinVigilancia?: boolean;
}

const VERDE = new Color('#5cd600');
const AMBAR = new Color('#ffb020');
const FPS_MINIMO = 18;
const MUESTRAS_CALENTAMIENTO = 45;
const MUESTRAS_MEDIDAS = 120;

type Pos = [number, number, number];

export class AtlasEscena {
  private readonly renderer: WebGLRenderer;
  private readonly escena = new Scene();
  private readonly camara = new PerspectiveCamera(28, 1, 0.1, 60);
  private readonly maquina = new MaquinaEstado();

  private readonly geometrias: BufferGeometry[] = [];
  private readonly materiales: Material[] = [];
  private readonly texturas: Texture[] = [];
  private readonly entorno: WebGLRenderTarget;

  private readonly atlas = new Group();
  private readonly cabeza = new Group();
  private readonly ojoI = new Group();
  private readonly ojoD = new Group();
  private readonly antena = new Group();
  private readonly orbita = new Group();
  private readonly boca: Mesh;
  private readonly bulbo: Mesh;
  private readonly manoI: Mesh;
  private readonly manoD: Mesh;
  private readonly sombra: Mesh;
  private readonly puntos: Mesh[] = [];

  private readonly matOjo: MeshBasicMaterial;
  private readonly matBrillo: MeshBasicMaterial;
  private readonly matBulbo: MeshStandardMaterial;
  private readonly matPunto: MeshBasicMaterial;

  private readonly tinte = new Color();
  private readonly v = { ojoAbierto: 1, ojoInclinacion: 0, sonrisa: 0.55, bocaVisible: 1, brilloAntena: 0.9, orbita: 0, miradaArriba: 0, ambar: 0 };

  private t = 0;
  private raf = 0;
  private ultimo = 0;
  private corriendo = false;

  private yaw = 0;
  private pitch = 0;
  private punteroX = 0;
  private punteroY = 0;
  private punteroHasta = 0;
  private salto = 0;
  private velSalto = 0;
  private temblor = 0;
  private entrada = 0;
  private zoom = 0;
  private zoomObjetivo = 0;
  private proximoParpadeo = 2.2;
  private parpadeoInicio = -1;
  private muestras = 0;
  private acumulado = 0;

  private readonly alPerderContexto = (e: Event) => {
    e.preventDefault();
    this.op.alDegradar();
  };

  constructor(private readonly op: OpcionesEscena) {
    this.renderer = new WebGLRenderer({ canvas: op.lienzo, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000, 0);
    op.lienzo.addEventListener('webglcontextlost', this.alPerderContexto);

    // Reflejos de "estudio fotográfico" para el acabado brillante, sin cargar ninguna imagen.
    const pmrem = new PMREMGenerator(this.renderer);
    const estudio = new RoomEnvironment();
    // Cubo de 64 px (por defecto 256): para los reflejos de una mascota de ~150 px sobra, y generar el de 256
    // era una de las dos tareas de ~200 ms que bloqueaban la página cada vez que se abría el chat.
    this.entorno = pmrem.fromScene(estudio, 0.04, 0.1, 100, { size: 64 });
    this.escena.environment = this.entorno.texture;
    estudio.dispose();
    pmrem.dispose();

    const luz = new DirectionalLight('#ffffff', 1.5);
    luz.position.set(2.5, 3.5, 4);
    const contraluz = new DirectionalLight('#8dff4d', 1.1);
    contraluz.position.set(-3, 1.5, -2);
    this.escena.add(luz, contraluz);

    // ── Materiales ──────────────────────────────────────────────────────
    const cuerpo = this.mat(new MeshPhysicalMaterial({ color: '#f5f8f2', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }));
    const visor = this.mat(new MeshPhysicalMaterial({ color: '#0b130e', roughness: 0.08, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }));
    const marca = this.mat(new MeshPhysicalMaterial({ color: '#39a900', roughness: 0.32, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
    this.matOjo = this.mat(new MeshBasicMaterial({ color: VERDE.clone(), toneMapped: false }));
    this.matBrillo = this.mat(
      new MeshBasicMaterial({
        map: this.textura((c, n) => this.degradado(c, n, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)')),
        color: VERDE.clone(),
        transparent: true,
        opacity: 0.6,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.matBulbo = this.mat(new MeshStandardMaterial({ color: '#e4ffcc', emissive: VERDE.clone(), emissiveIntensity: 1, roughness: 0.3 }));
    this.matPunto = this.mat(new MeshBasicMaterial({ color: VERDE.clone(), toneMapped: false }));

    // ── Cabeza: esfera achatada + visor + ojos + boca ───────────────────
    const esfera = this.geo(new SphereGeometry(1, 64, 48));
    const cabezaMalla = new Mesh(esfera, cuerpo);
    cabezaMalla.scale.set(1.12, 1, 1);
    const visorMalla = new Mesh(this.geo(new SphereGeometry(1, 48, 32)), visor);
    visorMalla.scale.set(0.9, 0.62, 0.3);
    visorMalla.position.set(0, 0.04, 0.85);

    const capsula = this.geo(new CapsuleGeometry(0.075, 0.17, 6, 16));
    const brilloGeo = this.geo(new PlaneGeometry(0.62, 0.62));
    for (const [ojo, x] of [[this.ojoI, -0.3], [this.ojoD, 0.3]] as const) {
      ojo.position.set(x, 0.1, 1.1);
      const brillo = new Mesh(brilloGeo, this.matBrillo);
      brillo.position.z = 0.04;
      ojo.add(new Mesh(capsula, this.matOjo), brillo);
    }

    this.boca = new Mesh(this.geo(new TorusGeometry(0.11, 0.022, 10, 28, Math.PI)), this.matOjo);
    this.boca.rotation.z = Math.PI; // el arco de TorusGeometry sale como "∩": girado queda en sonrisa
    this.boca.position.set(0, -0.1, 1.12);

    const orejaGeo = this.geo(new CylinderGeometry(0.2, 0.2, 0.16, 32));
    const orejaI = new Mesh(orejaGeo, marca);
    const orejaD = new Mesh(orejaGeo, marca);
    orejaI.rotation.z = orejaD.rotation.z = Math.PI / 2;
    orejaI.position.set(-1.14, 0, 0);
    orejaD.position.set(1.14, 0, 0);

    // Antena: tallo + bombilla (pivote en lo alto de la cabeza para que se mueva con soltura)
    this.antena.position.set(0, 0.98, 0);
    const tallo = new Mesh(this.geo(new CylinderGeometry(0.025, 0.03, 0.3, 12)), cuerpo);
    tallo.position.y = 0.15;
    this.bulbo = new Mesh(this.geo(new SphereGeometry(0.095, 24, 16)), this.matBulbo);
    this.bulbo.position.y = 0.36;
    this.antena.add(tallo, this.bulbo);

    this.cabeza.add(cabezaMalla, visorMalla, this.ojoI, this.ojoD, this.boca, orejaI, orejaD, this.antena);

    // ── Manos flotantes ─────────────────────────────────────────────────
    const manoGeo = this.geo(new SphereGeometry(0.17, 32, 24));
    this.manoI = new Mesh(manoGeo, cuerpo);
    this.manoD = new Mesh(manoGeo, cuerpo);
    this.manoI.position.set(-1.12, -0.92, 0.32);
    this.manoD.position.set(1.12, -0.92, 0.32);

    // ── Órbitas de "pensando": tres puntos girando alrededor de la cabeza ──
    const puntoGeo = this.geo(new SphereGeometry(0.075, 14, 12));
    for (let i = 0; i < 3; i++) {
      const punto = new Mesh(puntoGeo, this.matPunto);
      const ang = (i * Math.PI * 2) / 3;
      punto.position.set(Math.cos(ang) * 1.6, 0.25, Math.sin(ang) * 1.6);
      this.puntos.push(punto);
      this.orbita.add(punto);
    }
    this.orbita.visible = false;

    this.atlas.add(this.cabeza, this.manoI, this.manoD, this.orbita);
    this.atlas.scale.setScalar(0.0001);
    this.escena.add(this.atlas);

    // ── Sombra en el piso ───────────────────────────────────────────────
    this.sombra = new Mesh(
      this.geo(new PlaneGeometry(2.8, 2.8)),
      this.mat(
        new MeshBasicMaterial({
          map: this.textura((c, n) => this.degradado(c, n, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.16)')),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    this.sombra.rotation.x = -Math.PI / 2;
    this.sombra.position.y = -1.6;
    this.escena.add(this.sombra);

    this.maquina.disparar('saludo', 0);
    this.aplicarCamara();
  }

  // ── API pública ────────────────────────────────────────────────────────
  /**
   * Compila los shaders sin bloquear el hilo principal (compileAsync usa KHR_parallel_shader_compile cuando
   * existe). Compilarlos en el primer render era la otra tarea larga (~150 ms) de cada apertura del chat.
   * Mientras tanto la página sigue respondiendo y el orbe CSS cubre el hueco.
   */
  async preparar(): Promise<void> {
    this.orbita.visible = true; // para compilar también el material de los puntos
    try {
      await this.renderer.compileAsync(this.escena, this.camara);
    } finally {
      this.orbita.visible = false;
    }
  }

  iniciar(): void {
    if (this.corriendo) return;
    this.corriendo = true;
    this.ultimo = performance.now();
    const paso = (ahora: number) => {
      if (!this.corriendo) return;
      const real = (ahora - this.ultimo) / 1000;
      this.ultimo = ahora;
      this.vigilarRendimiento(real);
      this.actualizar(Math.min(real, 0.05));
      this.dibujar();
      this.raf = requestAnimationFrame(paso);
    };
    this.raf = requestAnimationFrame(paso);
  }

  pausar(): void {
    this.corriendo = false;
    cancelAnimationFrame(this.raf);
  }

  redimensionar(ancho: number, alto: number): void {
    if (ancho < 2 || alto < 2) return;
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
    if (!this.corriendo) this.dibujar();
  }

  /** Estado de fondo: pensando mientras Atlas contesta. */
  pensar(activo: boolean): void {
    this.maquina.pensar(activo);
  }

  celebrar(): void {
    this.maquina.disparar('feliz', this.t);
    this.salto = 0;
    this.velSalto = 3.4;
  }

  fallar(): void {
    this.maquina.disparar('error', this.t);
    this.temblor = 1;
  }

  /** Vuelve a aparecer girando y saluda con la mano. */
  saludar(): void {
    this.maquina.disparar('saludo', this.t);
    this.entrada = 0;
  }

  /** Un toque a la mascota: cosquillas. */
  cosquillas(): void {
    this.maquina.disparar('feliz', this.t);
    this.velSalto = 2.6;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* vibrar es un extra: en iOS no existe */
    }
  }

  /** Hacia dónde mira, en coordenadas normalizadas (−1…1) respecto al centro de la mascota. */
  mirarHacia(nx: number, ny: number): void {
    this.punteroX = MathUtils.clamp(nx, -1, 1);
    this.punteroY = MathUtils.clamp(ny, -1, 1);
    this.punteroHasta = this.t + 2.5;
  }

  /** Modo avatar (cabecera) frente a modo héroe (grande, de cuerpo entero). */
  compacta(activa: boolean): void {
    this.zoomObjetivo = activa ? 1 : 0;
  }

  destruir(): void {
    this.pausar();
    this.op.lienzo.removeEventListener('webglcontextlost', this.alPerderContexto);
    this.geometrias.forEach((g) => g.dispose());
    this.materiales.forEach((m) => m.dispose());
    this.texturas.forEach((t) => t.dispose());
    this.entorno.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ── Animación ──────────────────────────────────────────────────────────
  private actualizar(dt: number): void {
    const rm = this.op.reducirMovimiento;
    this.t += dt;
    const estado = this.maquina.actual(this.t);
    const p = PARAMETROS[estado];
    const v = this.v;

    v.ojoAbierto = MathUtils.damp(v.ojoAbierto, p.ojoAbierto, 10, dt);
    v.ojoInclinacion = MathUtils.damp(v.ojoInclinacion, p.ojoInclinacion, 10, dt);
    v.sonrisa = MathUtils.damp(v.sonrisa, p.sonrisa, 8, dt);
    v.bocaVisible = MathUtils.damp(v.bocaVisible, p.bocaVisible, 8, dt);
    v.brilloAntena = MathUtils.damp(v.brilloAntena, p.brilloAntena, 6, dt);
    v.orbita = MathUtils.damp(v.orbita, p.orbita, 5, dt);
    v.miradaArriba = MathUtils.damp(v.miradaArriba, p.miradaArriba, 5, dt);
    v.ambar = MathUtils.damp(v.ambar, p.tono === 'ambar' ? 1 : 0, 8, dt);

    // Entrada: aparece creciendo con un rebote y girando una vuelta.
    this.entrada = Math.min(1, this.entrada + dt / 0.95);
    const e = salidaConRebote(this.entrada);
    this.atlas.scale.setScalar(Math.max(0.0001, e));
    this.atlas.rotation.y = (1 - Math.min(1, e)) * Math.PI * 2;

    // Flotar, saltar (resorte amortiguado) y temblar si hubo un error.
    const flota = rm ? 0 : Math.sin(this.t * 1.7) * 0.07;
    this.velSalto += (-70 * this.salto - 9 * this.velSalto) * dt;
    this.salto += this.velSalto * dt;
    this.atlas.position.y = flota + this.salto;
    this.temblor = Math.max(0, this.temblor - dt * 1.6);
    this.atlas.rotation.z = (rm ? 0 : Math.sin(this.t * 0.9) * 0.03) + Math.sin(this.t * 46) * 0.07 * this.temblor;

    // Mirada: sigue el dedo/cursor; sin puntero, curiosea con un vaivén lento.
    const sigue = this.t < this.punteroHasta && !rm;
    const yawObj = sigue ? this.punteroX * 0.5 : rm ? 0 : Math.sin(this.t * 0.45) * 0.14;
    const pitchObj = (sigue ? this.punteroY * 0.28 : rm ? 0 : Math.sin(this.t * 0.33) * 0.05) + v.miradaArriba;
    this.yaw = MathUtils.damp(this.yaw, yawObj, 5, dt);
    this.pitch = MathUtils.damp(this.pitch, pitchObj, 5, dt);
    this.cabeza.rotation.set(this.pitch, this.yaw, 0);

    // Ojos: parpadeo, entrecerrados al estar feliz, inclinados según el ánimo.
    if (!rm && this.t >= this.proximoParpadeo) {
      this.parpadeoInicio = this.t;
      this.proximoParpadeo = this.t + 2.2 + Math.random() * 3.2;
    }
    const dtp = this.t - this.parpadeoInicio;
    const parpadeo = this.parpadeoInicio >= 0 && dtp < 0.16 ? 1 - Math.sin((Math.PI * dtp) / 0.16) * 0.92 : 1;
    const alto = Math.max(0.06, v.ojoAbierto * parpadeo);
    const ancho = 1 + (1 - Math.min(1, v.ojoAbierto)) * 0.8;
    this.ojoI.scale.set(ancho, alto, 1);
    this.ojoD.scale.set(ancho, alto, 1);
    this.ojoI.rotation.z = v.ojoInclinacion;
    this.ojoD.rotation.z = -v.ojoInclinacion;

    // Boca: sonrisa, línea neutra al pensar y ceño al fallar (escala vertical negativa).
    this.boca.scale.set(0.5 + 0.5 * v.bocaVisible, v.sonrisa * v.bocaVisible + (1 - v.bocaVisible) * 0.02, 1);

    // Color (verde ↔ ámbar) y pulso de la antena.
    this.tinte.copy(VERDE).lerp(AMBAR, v.ambar);
    this.matOjo.color.copy(this.tinte);
    this.matBrillo.color.copy(this.tinte);
    this.matBulbo.emissive.copy(this.tinte);
    this.matPunto.color.copy(this.tinte);
    const pulso = 0.5 + 0.5 * Math.sin(this.t * p.pulsoAntena);
    this.matBulbo.emissiveIntensity = v.brilloAntena * (0.55 + 0.75 * pulso);
    this.bulbo.scale.setScalar(1 + (rm ? 0 : pulso * 0.14));
    this.antena.rotation.z = rm ? 0 : Math.sin(this.t * 2.1) * 0.07 - this.yaw * 0.25;

    // Órbitas.
    this.orbita.visible = v.orbita > 0.02;
    this.orbita.scale.setScalar(Math.max(0.0001, v.orbita));
    if (!rm) this.orbita.rotation.y += dt * 2.8;
    this.puntos.forEach((m, i) => (m.position.y = 0.25 + Math.sin(this.t * 3.2 + i * 2.1) * 0.18));

    // Manos.
    const manos = this.objetivosManos(estado);
    // En modo avatar las manos se recogen un poco: en las poses de saludo y alegría se abrían más de lo que cabe en el encuadre.
    const recogida = MathUtils.lerp(1, 0.86, this.zoom);
    this.moverMano(this.manoI, [manos.i[0] * recogida, manos.i[1], manos.i[2]], dt);
    this.moverMano(this.manoD, [manos.d[0] * recogida, manos.d[1], manos.d[2]], dt);

    // Sombra: más chica y clara cuanto más alto está.
    const altura = this.atlas.position.y;
    const k = Math.max(0.5, 1 - altura * 0.35) * Math.max(0.0001, e);
    this.sombra.scale.setScalar(k);
    (this.sombra.material as MeshBasicMaterial).opacity = Math.max(0.2, 1 - altura * 0.6);

    this.zoom = MathUtils.damp(this.zoom, this.zoomObjetivo, 5, dt);
    this.aplicarCamara();
  }

  private objetivosManos(estado: EstadoAtlas): { i: Pos; d: Pos } {
    const t = this.t;
    const base = Math.sin(t * 1.7 + 1) * 0.05;
    switch (estado) {
      case 'saludo':
        return { i: [-1.12, -0.92 + base, 0.32], d: [1.3 + Math.sin(t * 11) * 0.1, 0.5 + Math.sin(t * 11 + 1) * 0.06, 0.4] };
      case 'pensando': // la mano a la barbilla
        return { i: [-1.12, -0.92 + base, 0.32], d: [0.42, -0.72, 0.95] };
      case 'feliz':
        return { i: [-1.32, 0.4 + Math.sin(t * 14) * 0.08, 0.3], d: [1.32, 0.4 + Math.sin(t * 14 + 1.5) * 0.08, 0.3] };
      case 'error':
        return { i: [-1.2, -1.02, 0.2], d: [1.2, -1.02, 0.2] };
      default:
        return { i: [-1.12, -0.92 + base, 0.32], d: [1.12, -0.92 - base, 0.32] };
    }
  }

  private moverMano(mano: Mesh, [x, y, z]: Pos, dt: number): void {
    mano.position.set(MathUtils.damp(mano.position.x, x, 10, dt), MathUtils.damp(mano.position.y, y, 10, dt), MathUtils.damp(mano.position.z, z, 10, dt));
  }

  private aplicarCamara(): void {
    const z = this.zoom;
    // Modo avatar (z=1): el encuadre tiene que incluir la cabeza CON las orejas (x ≈ ±1,22), las manos y la
    // antena, también durante el rebote de entrada (la escala llega a ~1,1). A 4,7 el ancho visible era ±1,17
    // y se recortaban; a 6,2 es ±1,55.
    this.camara.position.set(0, MathUtils.lerp(0.05, 0.3, z), MathUtils.lerp(7.1, 6.2, z));
    this.camara.lookAt(0, MathUtils.lerp(-0.12, 0.16, z), 0);
  }

  private dibujar(): void {
    this.renderer.render(this.escena, this.camara);
  }

  /** Si tras calentar la escena va por debajo de FPS_MINIMO, pide pasar al respaldo CSS. */
  private vigilarRendimiento(real: number): void {
    if (this.op.sinVigilancia || real > 0.25) return; // >250 ms = pestaña en segundo plano, no mide nada
    this.muestras++;
    if (this.muestras > MUESTRAS_CALENTAMIENTO && this.muestras <= MUESTRAS_CALENTAMIENTO + MUESTRAS_MEDIDAS) this.acumulado += real;
    if (this.muestras === MUESTRAS_CALENTAMIENTO + MUESTRAS_MEDIDAS && MUESTRAS_MEDIDAS / this.acumulado < FPS_MINIMO) {
      this.op.alDegradar();
    }
  }

  // ── Utilidades de construcción ─────────────────────────────────────────
  private geo<T extends BufferGeometry>(g: T): T {
    this.geometrias.push(g);
    return g;
  }

  private mat<T extends Material>(m: T): T {
    this.materiales.push(m);
    return m;
  }

  private textura(dibujar: (c: CanvasRenderingContext2D, n: number) => void, n = 128): CanvasTexture {
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = n;
    dibujar(lienzo.getContext('2d') as CanvasRenderingContext2D, n);
    const tx = new CanvasTexture(lienzo);
    tx.colorSpace = SRGBColorSpace;
    this.texturas.push(tx);
    return tx;
  }

  private degradado(c: CanvasRenderingContext2D, n: number, centro: string, medio: string, fin = 'rgba(0,0,0,0)'): void {
    const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, centro);
    g.addColorStop(0.4, medio);
    g.addColorStop(1, fin);
    c.fillStyle = g;
    c.fillRect(0, 0, n, n);
  }
}
