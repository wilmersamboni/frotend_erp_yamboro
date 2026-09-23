import { BarcodeFormat } from '@zxing/library';

/**
 * Formatos 1D reales encontrados en placas/etiquetas de la operación (no
 * solo Code128): las placas de activos del SENA vienen de fábrica en
 * **UPC-A** (12 dígitos, confirmado con una placa real — antes faltaba en
 * esta lista, así que ZXing ni lo intentaba), los insumos comerciales
 * colombianos en **EAN-13** (13 dígitos, prefijo país 770), y CODE_39/ITF se
 * suman porque son los otros dos formatos típicos de etiquetas de
 * inventario/activos que no cuesta nada intentar (TRY_HARDER ya está
 * activo). QR queda por si algún sitio imprime sus propias etiquetas en QR
 * en vez de código de barras.
 */
export const FORMATOS_ESCANEO_DEFECTO: BarcodeFormat[] = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.QR_CODE,
];
