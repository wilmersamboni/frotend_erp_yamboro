import { Injectable } from '@angular/core';

export const TEMAS = [
  // textoClaro / textoOscuro: el acento usado como TEXTO en cada modo
  // (--accent-text). En verde, textoClaro es el #2d8500 que ya usaban los
  // textos verdes de las pantallas, para que el modo claro no cambie;
  // textoOscuro es el de la propuesta aprobada (el base se lee mal en oscuro).
  // vivo: el tono "brillante" que las pantallas usan en fondos, bordes y
  // barras (--accent-brand). En verde es el #39A900 que ya estaba escrito a
  // mano en los CSS, para que el tema por defecto no cambie.
  { id: 'verde',   label: 'Verde SENA', color: '#007832', vivo: '#39A900', textoClaro: '#2d8500', textoOscuro: '#6fd13a' },
  { id: 'azul',    label: 'Azul',       color: '#1e40af', vivo: '#2563eb', textoClaro: '#1e40af', textoOscuro: '#8ab4f8' },
  { id: 'indigo',  label: 'Índigo',     color: '#6366f1', vivo: '#6366f1', textoClaro: '#4f46e5', textoOscuro: '#a5b4fc' },
  { id: 'naranja', label: 'Naranja',    color: '#f97316', vivo: '#f97316', textoClaro: '#c2410c', textoOscuro: '#fdba74' },
];

export type ModoTema = 'claro' | 'oscuro' | 'sistema';
export const MODOS: { id: ModoTema; label: string }[] = [
  { id: 'claro',   label: 'Claro' },
  { id: 'oscuro',  label: 'Oscuro' },
  { id: 'sistema', label: 'Automático' },
];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private mediaOscuro = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  private escuchandoSistema = false;

  /** 'claro' | 'oscuro' | 'sistema' (sigue al sistema operativo). Guardado en localStorage 'modo'. */
  modo(): ModoTema {
    const m = localStorage.getItem('modo');
    return m === 'oscuro' || m === 'sistema' ? m : 'claro';
  }

  /** ¿Se está viendo en oscuro ahora mismo? (resuelve 'sistema' contra el sistema operativo) */
  esOscuro(): boolean {
    const m = this.modo();
    return m === 'oscuro' || (m === 'sistema' && !!this.mediaOscuro?.matches);
  }

  /**
   * Pone data-theme en <html> — de eso cuelga todo el modo oscuro
   * (src/styles/dark-theme.css + dark-tailwind.generated.css). index.html
   * hace lo mismo antes de que cargue Angular para evitar el parpadeo blanco.
   */
  private aplicarModo(): void {
    const oscuro = this.esOscuro();
    document.documentElement.setAttribute('data-theme', oscuro ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#111312' : '#39A900');
    // En 'Automático', seguir los cambios del sistema operativo sin recargar.
    if (this.mediaOscuro && !this.escuchandoSistema) {
      this.escuchandoSistema = true;
      this.mediaOscuro.addEventListener('change', () => {
        if (this.modo() === 'sistema') this.aplicarModo();
      });
    }
  }

  /** Lee localStorage y vuelca todos los overrides CSS en <style id="epsas-theme"> */
  apply(): void {
    this.aplicarModo();
    const tema     = TEMAS.find(t => t.id === (localStorage.getItem('tema') ?? 'verde'));
    const accent   = tema?.color ?? '#39A900';
    const accentTextoClaro  = tema?.textoClaro ?? '#2d8500';
    const accentTextoOscuro = tema?.textoOscuro ?? '#6fd13a';
    const vivo = tema?.vivo ?? '#39A900';
    // En verde se conservan los hex exactos que había en los CSS.
    const vivoDark  = tema?.id === 'verde' || !tema ? '#2d8500' : this.darken(vivo);
    const vivoLight = tema?.id === 'verde' || !tema ? '#5cd600' : this.lighten(vivo);
    const sizeMap: Record<string, string> = { small: '13px', normal: '15px', large: '17px' };
    const fontSize = sizeMap[localStorage.getItem('fontSize') ?? 'normal'] ?? '15px';

    const [r, g, b]     = this.hexToRgb(accent);
    const darkHex       = this.darken(accent);
    const [dr, dg, db]  = this.hexToRgb(darkHex);
    const lightHex      = this.lighten(accent);   // para hover:text-[#acd8a7]

    let el = document.getElementById('epsas-theme') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'epsas-theme';
      document.head.appendChild(el);
    }

    el.textContent = `
/* ═══════════════════════════════════════════════════════════
   EPSAS Theme  —  generado por ThemeService
   Accent: ${accent}   Dark: ${darkHex}   Light: ${lightHex}
═══════════════════════════════════════════════════════════ */

/* ── Variables globales ── */
:root[data-theme="dark"] {
  --accent:           rgb(${r} ${g} ${b});
  --accent-text:      ${accentTextoOscuro};
  --accent-soft:      rgb(${r} ${g} ${b} / 0.14);
  --accent-active-bg: rgb(${r} ${g} ${b} / 0.18);
}
:root {
  font-size: ${fontSize};
  --accent:             rgb(${r} ${g} ${b});
  --accent-brand:       ${vivo};
  --accent-brand-dark:  ${vivoDark};
  --accent-brand-light: ${vivoLight};
  --accent-text:        ${accentTextoClaro};
  --accent-soft:        rgb(${r} ${g} ${b} / 0.08);
  --accent-active-bg:   ${lightHex};   /* enlace activo del sidebar */
  --epsas-accent:       rgb(${r} ${g} ${b});
  --epsas-accent-dark:  rgb(${dr} ${dg} ${db});
  --epsas-accent-light: ${lightHex};
  --tui-primary:             rgb(${r} ${g} ${b});
  --tui-primary-hover:       rgb(${dr} ${dg} ${db});
  --tui-background-accent-1: rgb(${r} ${g} ${b});
  --tui-text-action:         rgb(${r} ${g} ${b});
  --tui-border-focus:        rgb(${r} ${g} ${b});
}

/* ══ bg-[color] ══════════════════════════════════════════ */
.bg-\\[\\#39A900\\],
.bg-\\[\\#2d8400\\],
.bg-\\[\\#2d8600\\],
.bg-\\[\\#007832\\]
  { background-color: rgb(${r} ${g} ${b}) !important; }

.bg-\\[\\#39A900\\]\\/5   { background-color: rgb(${r} ${g} ${b} / 0.05) !important; }
.bg-\\[\\#39A900\\]\\/8   { background-color: rgb(${r} ${g} ${b} / 0.08) !important; }
.bg-\\[\\#39A900\\]\\/10  { background-color: rgb(${r} ${g} ${b} / 0.10) !important; }
.bg-\\[\\#39A900\\]\\/15  { background-color: rgb(${r} ${g} ${b} / 0.15) !important; }
.bg-\\[\\#39A900\\]\\/20  { background-color: rgb(${r} ${g} ${b} / 0.20) !important; }
.bg-\\[\\#007832\\]\\/5   { background-color: rgb(${r} ${g} ${b} / 0.05) !important; }
.bg-\\[\\#007832\\]\\/10  { background-color: rgb(${r} ${g} ${b} / 0.10) !important; }
.bg-\\[\\#007832\\]\\/20  { background-color: rgb(${r} ${g} ${b} / 0.20) !important; }

/* ══ text-[color] ════════════════════════════════════════ */
/* var(--accent-text): igual al acento en claro; en oscuro su versión clara
   (textoOscuro en TEMAS) — el acento base se lee mal sobre fondo oscuro. */
.text-\\[\\#39A900\\],
.text-\\[\\#007832\\],
.text-\\[\\#2d8000\\],
.text-\\[\\#2d8400\\],
.text-\\[\\#2d8500\\],
.text-\\[\\#2f8a00\\]
  { color: var(--accent-text) !important; }

/* ══ border-[color] ══════════════════════════════════════ */
.border-\\[\\#39A900\\]       { border-color:     rgb(${r} ${g} ${b})        !important; }
.border-\\[\\#007832\\]       { border-color:     rgb(${r} ${g} ${b})        !important; }
.border-t-\\[\\#39A900\\]    { border-top-color:  rgb(${r} ${g} ${b})        !important; }
.border-t-\\[\\#007832\\]    { border-top-color:  rgb(${r} ${g} ${b})        !important; }
.border-\\[\\#39A900\\]\\/20 { border-color:     rgb(${r} ${g} ${b} / 0.20) !important; }
.border-\\[\\#007832\\]\\/20 { border-color:     rgb(${r} ${g} ${b} / 0.20) !important; }
.border-\\[\\#39A900\\]\\/30 { border-color:     rgb(${r} ${g} ${b} / 0.30) !important; }
.border-\\[\\#007832\\]\\/30 { border-color:     rgb(${r} ${g} ${b} / 0.30) !important; }
.border-\\[\\#39A900\\]\\/25 { border-color:     rgb(${r} ${g} ${b} / 0.25) !important; }
.border-\\[\\#39A900\\]\\/40 { border-color:     rgb(${r} ${g} ${b} / 0.40) !important; }

/* ══ ring-[color] ════════════════════════════════════════ */
.ring-\\[\\#39A900\\] {
  --tw-ring-color: rgb(${r} ${g} ${b}) !important;
  --tw-ring-shadow: 0 0 0 var(--tw-ring-offset-width, 0px) var(--tw-ring-offset-color, #fff),
                    0 0 0 calc(1px + var(--tw-ring-offset-width, 0px)) rgb(${r} ${g} ${b}) !important;
}

/* ══ shadow-[color] ══════════════════════════════════════ */
.shadow-\\[\\#39A900\\]       { --tw-shadow-color: rgb(${r} ${g} ${b})        !important; }
.shadow-\\[\\#39A900\\]\\/20  { --tw-shadow-color: rgb(${r} ${g} ${b} / 0.20) !important; }
.shadow-\\[\\#39A900\\]\\/25  { --tw-shadow-color: rgb(${r} ${g} ${b} / 0.25) !important; }

/* ══ accent-[color] (inputs, checkboxes, etc.) ════════════ */
.accent-\\[\\#39A900\\]  { accent-color: rgb(${r} ${g} ${b}) !important; }

/* ══ Gradient stops ══════════════════════════════════════ */
.from-\\[\\#39A900\\]      { --tw-gradient-from: rgb(${r} ${g} ${b})        !important; }
.via-\\[\\#39A900\\]       { --tw-gradient-via:  rgb(${r} ${g} ${b})        !important; }
.to-\\[\\#39A900\\]        { --tw-gradient-to:   rgb(${r} ${g} ${b})        !important; }
.from-\\[\\#39A900\\]\\/0  { --tw-gradient-from: rgb(${r} ${g} ${b} / 0)    !important; }
.from-\\[\\#39A900\\]\\/5  { --tw-gradient-from: rgb(${r} ${g} ${b} / 0.05) !important; }
.to-\\[\\#39A900\\]\\/0    { --tw-gradient-to:   rgb(${r} ${g} ${b} / 0)    !important; }
.to-\\[\\#2d8500\\]        { --tw-gradient-to:   rgb(${dr} ${dg} ${db})     !important; }

/* ══ hover: ══════════════════════════════════════════════ */
.hover\\:bg-\\[\\#39A900\\]:hover,
.hover\\:bg-\\[\\#2d8000\\]:hover,
.hover\\:bg-\\[\\#2d8400\\]:hover,
.hover\\:bg-\\[\\#2d8600\\]:hover
  { background-color: rgb(${dr} ${dg} ${db}) !important; }

.hover\\:bg-\\[\\#39A900\\]\\/5:hover   { background-color: rgb(${r} ${g} ${b} / 0.05) !important; }
.hover\\:bg-\\[\\#39A900\\]\\/10:hover  { background-color: rgb(${r} ${g} ${b} / 0.10) !important; }
.hover\\:bg-\\[\\#39A900\\]\\/15:hover  { background-color: rgb(${r} ${g} ${b} / 0.15) !important; }
.hover\\:bg-\\[\\#39A900\\]\\/20:hover  { background-color: rgb(${r} ${g} ${b} / 0.20) !important; }
.hover\\:bg-\\[\\#39A900\\]\\/25:hover  { background-color: rgb(${r} ${g} ${b} / 0.25) !important; }
.hover\\:bg-\\[\\#007832\\]\\/10:hover  { background-color: rgb(${r} ${g} ${b} / 0.10) !important; }
.hover\\:bg-\\[\\#007832\\]\\/20:hover  { background-color: rgb(${r} ${g} ${b} / 0.20) !important; }
.hover\\:text-\\[\\#39A900\\]:hover     { color: var(--accent-text)        !important; }
.hover\\:text-\\[\\#007832\\]:hover     { color: var(--accent-text)        !important; }
.hover\\:text-\\[\\#2d8000\\]:hover     { color: var(--accent-text)        !important; }
.hover\\:text-\\[\\#2d8500\\]:hover     { color: var(--accent-text)        !important; }
.hover\\:text-\\[\\#acd8a7\\]:hover     { color: ${lightHex}                !important; }
.hover\\:border-\\[\\#39A900\\]:hover   { border-color: rgb(${r} ${g} ${b}) !important; }
.hover\\:border-\\[\\#39A900\\]\\/30:hover { border-color: rgb(${r} ${g} ${b} / 0.30) !important; }
.hover\\:border-\\[\\#39A900\\]\\/45:hover { border-color: rgb(${r} ${g} ${b} / 0.45) !important; }
.hover\\:border-\\[\\#39A900\\]\\/50:hover { border-color: rgb(${r} ${g} ${b} / 0.50) !important; }
.hover\\:border-\\[\\#007832\\]\\/40:hover { border-color: rgb(${r} ${g} ${b} / 0.40) !important; }
.hover\\:from-\\[\\#39A900\\]\\/5:hover    { --tw-gradient-from: rgb(${r} ${g} ${b} / 0.05) !important; }
.hover\\:shadow-\\[\\#39A900\\]\\/30:hover { --tw-shadow-color: rgb(${r} ${g} ${b} / 0.30) !important; }

/* ══ Opacidades entre corchetes y otras variantes ════════ */
.bg-\\[\\#39A900\\]\\/\\[0\\.03\\]  { background-color: rgb(${r} ${g} ${b} / 0.03) !important; }
.bg-\\[\\#39A900\\]\\/\\[0\\.06\\]  { background-color: rgb(${r} ${g} ${b} / 0.06) !important; }
.bg-\\[\\#39A900\\]\\/\\[0\\.07\\]  { background-color: rgb(${r} ${g} ${b} / 0.07) !important; }
.hover\\:bg-\\[\\#39A900\\]\\/\\[0\\.06\\]:hover { background-color: rgb(${r} ${g} ${b} / 0.06) !important; }
.peer:checked ~ .peer-checked\\:bg-\\[\\#39A900\\] { background-color: rgb(${r} ${g} ${b}) !important; }
.group:hover .group-hover\\:text-\\[\\#39A900\\],
.group:hover .group-hover\\:text-\\[\\#2d8500\\]   { color: var(--accent-text) !important; }
.group:hover .group-hover\\:bg-\\[\\#39A900\\]\\/20 { background-color: rgb(${r} ${g} ${b} / 0.20) !important; }
.disabled\\:hover\\:bg-\\[\\#39A900\\]:disabled:hover { background-color: rgb(${r} ${g} ${b}) !important; }
.focus-visible\\:ring-\\[\\#39A900\\]:focus-visible { --tw-ring-color: rgb(${r} ${g} ${b}) !important; }

/* ══ focus: ══════════════════════════════════════════════ */
.focus\\:border-\\[\\#39A900\\]:focus      { border-color: rgb(${r} ${g} ${b})        !important; }
.focus\\:border-\\[\\#39A900\\]\\/60:focus { border-color: rgb(${r} ${g} ${b} / 0.60) !important; }

.focus\\:ring-\\[\\#39A900\\]:focus {
  --tw-ring-color: rgb(${r} ${g} ${b}) !important;
  box-shadow: 0 0 0 3px rgb(${r} ${g} ${b}) !important;
}
.focus\\:ring-\\[\\#39A900\\]\\/20:focus {
  --tw-ring-color: rgb(${r} ${g} ${b} / 0.20) !important;
  box-shadow: 0 0 0 3px rgb(${r} ${g} ${b} / 0.20) !important;
}
.focus\\:ring-\\[\\#39A900\\]\\/25:focus {
  --tw-ring-color: rgb(${r} ${g} ${b} / 0.25) !important;
  box-shadow: 0 0 0 3px rgb(${r} ${g} ${b} / 0.25) !important;
}
.focus\\:ring-\\[\\#39A900\\]\\/30:focus {
  --tw-ring-color: rgb(${r} ${g} ${b} / 0.30) !important;
  box-shadow: 0 0 0 3px rgb(${r} ${g} ${b} / 0.30) !important;
}
.focus\\:ring-\\[\\#39A900\\]\\/40:focus {
  --tw-ring-color: rgb(${r} ${g} ${b} / 0.40) !important;
  box-shadow: 0 0 0 3px rgb(${r} ${g} ${b} / 0.40) !important;
}
.focus\\:ring-\\[\\#007832\\]\\/40:focus {
  --tw-ring-color: rgb(${r} ${g} ${b} / 0.40) !important;
  box-shadow: 0 0 0 3px rgb(${r} ${g} ${b} / 0.40) !important;
}

/* ══ Sidebar ═════════════════════════════════════════════ */
/* routerLinkActive aplica estas clases dinámicamente */
a.bg-\\[\\#007832\\],
a[class*="bg-\\[#007832\\]"]
  { background-color: rgb(${r} ${g} ${b}) !important; }

/* ══ Componentes con estilos encapsulados ════════════════ */
/* Estos usan !important para vencer la especificidad Angular */
.btn-primary         { background-color: rgb(${r} ${g} ${b}) !important; }
.settings-nav button.active { background-color: rgb(${r} ${g} ${b}) !important; }
.strength-seg.filled { background-color: rgb(${r} ${g} ${b}) !important; }
.progress-bar-fill   { background-color: rgb(${r} ${g} ${b}) !important; }
.dot-green           { background-color: rgb(${r} ${g} ${b}) !important; }
.font-size-btns button.active {
  border-color: rgb(${r} ${g} ${b}) !important;
  color:        var(--accent-text) !important;
  background:   var(--accent-soft) !important;
}
.color-chip.selected { border-color: var(--text) !important; }

/* ══ Sidebar link activo ══════════════════════════════════ */
.nav-link-active {
  background:        var(--accent-soft) !important;
  color:             var(--accent-text) !important;
}

/* SVG inline */
circle[stroke="#39A900"],
path[stroke="#39A900"]   { stroke: rgb(${r} ${g} ${b}) !important; }

/* Gradientes compuestos */
.settings-avatar { background: linear-gradient(135deg, rgb(${r} ${g} ${b}), rgb(${dr} ${dg} ${db})) !important; }
.personal-hero   { background: linear-gradient(135deg, rgb(${r} ${g} ${b}), rgb(${dr} ${dg} ${db})) !important; }
/* .bg-sena-gradient: ya usa tokens en styles.css (ver ahí por qué no va acá). */
.accent-card      { background: linear-gradient(135deg, rgb(${r} ${g} ${b}), rgb(${dr} ${dg} ${db})) !important; }

`;
  }

  /* ── Helpers ───────────────────────────────────────────── */

  /** #RRGGBB → [r, g, b] */
  private hexToRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  /** Oscurece ~18 puntos en cada canal */
  private darken(hex: string): string {
    const [r, g, b] = this.hexToRgb(hex);
    return this.toHex(Math.max(0, r - 30), Math.max(0, g - 30), Math.max(0, b - 30));
  }

  /** Aclara mezclando 45 % con blanco (para hover:text suave) */
  private lighten(hex: string): string {
    const [r, g, b] = this.hexToRgb(hex);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.45);
    return this.toHex(mix(r), mix(g), mix(b));
  }

  private toHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
}
