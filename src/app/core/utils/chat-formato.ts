/**
 * Convierte la respuesta del asistente (texto plano con un markdown mínimo:
 * **negrita**, listas numeradas y con guion) en HTML.
 *
 * El texto lo redacta un modelo de lenguaje, así que NUNCA se confía en él: se
 * escapa antes de agregar ninguna etiqueta. Lo único que puede llegar al DOM
 * son las que se arman acá (strong, ol, ul, li, br). Aun así el resultado se
 * enlaza con [innerHTML], que además pasa por el sanitizador de Angular.
 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function escapar(texto: string): string {
  return texto.replace(/[&<>]/g, (c) => ESCAPES[c]);
}

const ITEM_NUMERADO = /^\s*\d+\.\s+(.*)$/;
const ITEM_VINETA = /^\s*[-•*]\s+(.*)$/;

export function formatearMensajeChat(entrada: string | null | undefined): string {
  if (!entrada) return '';

  const lineas = escapar(entrada)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));

  const bloques: string[] = [];
  let parrafo: string[] = [];
  let lista: { etiqueta: 'ol' | 'ul'; items: string[] } | null = null;

  const cerrarParrafo = () => {
    while (parrafo.length && parrafo[0] === '') parrafo.shift();
    while (parrafo.length && parrafo[parrafo.length - 1] === '') parrafo.pop();
    if (parrafo.length) bloques.push(parrafo.join('<br>'));
    parrafo = [];
  };
  const cerrarLista = () => {
    if (!lista) return;
    bloques.push(`<${lista.etiqueta}>${lista.items.map((i) => `<li>${i}</li>`).join('')}</${lista.etiqueta}>`);
    lista = null;
  };

  for (const linea of lineas) {
    const numerado = ITEM_NUMERADO.exec(linea);
    const vineta = numerado ? null : ITEM_VINETA.exec(linea);
    const item = numerado ?? vineta;

    if (item) {
      const etiqueta = numerado ? 'ol' : 'ul';
      cerrarParrafo();
      if (lista && lista.etiqueta !== etiqueta) cerrarLista();
      lista ??= { etiqueta, items: [] };
      lista.items.push(item[1]);
      continue;
    }

    cerrarLista();
    parrafo.push(linea.trim());
  }

  cerrarLista();
  cerrarParrafo();
  return bloques.join('');
}
