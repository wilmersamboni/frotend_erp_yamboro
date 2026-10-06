/**
 * Gráficos NATIVOS de Excel para archivos hechos con ExcelJS (2026-10-06).
 * ExcelJS no sabe crear gráficos, así que después de escribir el libro se
 * abre el .xlsx (un zip) y se le agregan las piezas OOXML a mano:
 * xl/charts/chartN.xml, un dibujo que los ancla a la hoja, sus relaciones y
 * los tipos de contenido. Los gráficos apuntan a RANGOS de celdas (no a
 * datos copiados): si alguien cambia los datos, Excel los redibuja solo.
 * No se escriben cachés de valores: Excel los reconstruye al abrir.
 */

export interface SerieGrafico {
  /** Celda con el nombre de la serie, p. ej. "Resumen!$B$40". */
  nombre: string;
  /** Rango de valores, p. ej. "Resumen!$B$41:$B$52". */
  valores: string;
  /** Color RRGGBB. */
  color: string;
}

export interface GraficoNativo {
  tipo: 'columnas' | 'dona';
  titulo: string;
  /** Rango de categorías (meses, estados…). */
  categorias: string;
  /** Formato de las categorías si son fechas, p. ej. "mmm yy". */
  formatoCategorias?: string;
  series: SerieGrafico[];
  /** Solo columnas: separación entre marcas del eje de valores (entero; evita "1, 1, 1, 0" con valores chicos). */
  pasoEje?: number;
  /** Solo dona: un color por porción, en el orden de las categorías. */
  coloresPuntos?: string[];
  /** Ancla en la hoja (columnas y filas en base 0; `hasta` es exclusivo). */
  desde: { col: number; fila: number };
  hasta: { col: number; fila: number };
}

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const relleno = (rgb: string) => `<c:spPr><a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill></c:spPr>`;
const texto = (sz: number, color = '374151', negrita = false) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${negrita ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="es-CO"/></a:p></c:txPr>`;

function titulo(t: string): string {
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr>`
    + `<a:r><a:rPr lang="es-CO" sz="1100" b="1"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx>`
    + `<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`;
}

function categoriasXml(g: GraficoNativo): string {
  // Fechas → numRef con formato; textos → strRef.
  return g.formatoCategorias
    ? `<c:cat><c:numRef><c:f>${esc(g.categorias)}</c:f></c:numRef></c:cat>`
    : `<c:cat><c:strRef><c:f>${esc(g.categorias)}</c:f></c:strRef></c:cat>`;
}

function chartColumnas(g: GraficoNativo): string {
  const series = g.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>`
    + `<c:tx><c:strRef><c:f>${esc(s.nombre)}</c:f></c:strRef></c:tx>${relleno(s.color)}<c:invertIfNegative val="0"/>`
    + `${categoriasXml(g)}<c:val><c:numRef><c:f>${esc(s.valores)}</c:f></c:numRef></c:val></c:ser>`).join('');
  return `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}`
    + `<c:gapWidth val="70"/><c:overlap val="-8"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>`
    + `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>`
    + (g.formatoCategorias ? `<c:numFmt formatCode="${esc(g.formatoCategorias)}" sourceLinked="0"/>` : '')
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
    + `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D1D5DB"/></a:solidFill></a:ln></c:spPr>${texto(800, '6B7280')}`
    + `<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    + `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>`
    + `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="EEF0F3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>`
    + `<c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>`
    + `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${texto(800, '9CA3AF')}<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>`
    + (g.pasoEje ? `<c:majorUnit val="${g.pasoEje}"/>` : '') + `</c:valAx>`;
}

function chartDona(g: GraficoNativo): string {
  const s = g.series[0];
  const puntos = (g.coloresPuntos ?? []).map((rgb, i) =>
    `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
  return `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>`
    + `<c:tx><c:strRef><c:f>${esc(s.nombre)}</c:f></c:strRef></c:tx>${puntos}`
    // "0%;;;": las porciones en cero no muestran etiqueta.
    + `<c:dLbls><c:numFmt formatCode="0%;;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${texto(900, 'FFFFFF', true)}`
    + `<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="0"/></c:dLbls>`
    + `${categoriasXml(g)}<c:val><c:numRef><c:f>${esc(s.valores)}</c:f></c:numRef></c:val></c:ser>`
    + `<c:firstSliceAng val="0"/><c:holeSize val="58"/></c:doughnutChart>`;
}

function chartXml(g: GraficoNativo): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/>`
    + `<c:chart>${titulo(g.titulo)}<c:plotArea><c:layout/>${g.tipo === 'dona' ? chartDona(g) : chartColumnas(g)}</c:plotArea>`
    + `<c:legend><c:legendPos val="${g.tipo === 'dona' ? 'r' : 'b'}"/><c:overlay val="0"/>${texto(800, '4B5563')}</c:legend>`
    + `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
    + `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr>`
    + `</c:chartSpace>`;
}

function anclaXml(g: GraficoNativo, i: number): string {
  return `<xdr:twoCellAnchor editAs="oneCell">`
    + `<xdr:from><xdr:col>${g.desde.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.desde.fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:to><xdr:col>${g.hasta.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.hasta.fila}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
    + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${100 + i}" name="${esc(g.titulo)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
    + `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
    + `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="rIdGrafico${i + 1}"/></a:graphicData></a:graphic>`
    + `</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

/**
 * Agrega los gráficos a la hoja `archivoHoja` (p. ej. "sheet1.xml", la
 * primera hoja creada) y devuelve el .xlsx nuevo. La hoja no debe tener ya
 * un dibujo propio (imágenes): este helper no los combina.
 */
export async function agregarGraficosNativos(xlsx: ArrayBuffer, archivoHoja: string, graficos: GraficoNativo[]): Promise<ArrayBuffer> {
  if (!graficos.length) return xlsx;
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(xlsx);
  const rutaHoja = `xl/worksheets/${archivoHoja}`;
  const hoja = await zip.file(rutaHoja)?.async('string');
  if (!hoja) return xlsx;

  const dibujo = 'graficosNativos1.xml';
  graficos.forEach((g, i) => zip.file(`xl/charts/graficoNativo${i + 1}.xml`, chartXml(g)));
  zip.file(`xl/drawings/${dibujo}`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}">${graficos.map(anclaXml).join('')}</xdr:wsDr>`);
  zip.file(`xl/drawings/_rels/${dibujo}.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PKG}">`
    + graficos.map((_, i) => `<Relationship Id="rIdGrafico${i + 1}" Type="${NS_R}/chart" Target="../charts/graficoNativo${i + 1}.xml"/>`).join('') + `</Relationships>`);

  // Relación hoja → dibujo
  const rutaRels = `xl/worksheets/_rels/${archivoHoja}.rels`;
  const relDibujo = `<Relationship Id="rIdGraficosNativos" Type="${NS_R}/drawing" Target="../drawings/${dibujo}"/>`;
  const rels = await zip.file(rutaRels)?.async('string');
  zip.file(rutaRels, rels
    ? rels.replace('</Relationships>', `${relDibujo}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_PKG}">${relDibujo}</Relationships>`);

  // <drawing> va justo DESPUÉS de los elementos de la hoja que el esquema pone
  // antes (márgenes, página, pie, saltos…). No se busca "<extLst" para ubicarlo:
  // las barras de datos traen su propio <extLst> anidado dentro de cada regla y
  // el dibujo terminaba metido ahí (Excel lo descartaba sin avisar).
  const etiqueta = `<drawing xmlns:r="${NS_R}" r:id="rIdGraficosNativos"/>`;
  const previos = [/<printOptions[^>]*\/>/g, /<pageMargins[^>]*\/>/g, /<pageSetup[^>]*\/>/g, /<headerFooter[^>]*\/>/g,
    /<\/headerFooter>/g, /<\/rowBreaks>/g, /<\/colBreaks>/g, /<\/customProperties>/g, /<\/cellWatches>/g, /<\/ignoredErrors>/g, /<\/smartTags>/g];
  let pos = -1;
  for (const re of previos) for (const m of hoja.matchAll(re)) pos = Math.max(pos, (m.index ?? 0) + m[0].length);
  if (pos < 0) pos = hoja.lastIndexOf('</worksheet>');
  zip.file(rutaHoja, hoja.slice(0, pos) + etiqueta + hoja.slice(pos));

  // Tipos de contenido
  let tipos = (await zip.file('[Content_Types].xml')!.async('string'));
  const override = (ruta: string, tipo: string) => (tipos.includes(`PartName="${ruta}"`) ? '' : `<Override PartName="${ruta}" ContentType="${tipo}"/>`);
  const nuevos = graficos.map((_, i) => override(`/xl/charts/graficoNativo${i + 1}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml')).join('')
    + override(`/xl/drawings/${dibujo}`, 'application/vnd.openxmlformats-officedocument.drawing+xml');
  tipos = tipos.replace('</Types>', `${nuevos}</Types>`);
  zip.file('[Content_Types].xml', tipos);

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
