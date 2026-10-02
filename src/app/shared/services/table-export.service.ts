import { Injectable } from '@angular/core';

export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

/** Exporta exactamente las filas que el usuario está viendo, sin depender de
 * endpoints adicionales ni duplicar la conversión Excel/PDF en cada pantalla.
 *
 * exceljs (~920 kB) y jspdf (~430 kB) se cargan recién al exportar: importados
 * arriba del archivo viajaban con CADA pantalla que inyecta este servicio,
 * aunque nadie tocara el botón. */
@Injectable({ providedIn: 'root' })
export class TableExportService {
  async excel<T>(fileName: string, sheetName: string, columns: ExportColumn<T>[], rows: T[]): Promise<void> {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((column) => ({ header: column.label, key: column.label, width: Math.max(14, column.label.length + 4) }));
    rows.forEach((row) => sheet.addRow(Object.fromEntries(columns.map((column) => [column.label, this.value(column.value(row))]))));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF39A900' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    this.download(blob, `${fileName}.xlsx`);
  }

  async pdf<T>(fileName: string, title: string, columns: ExportColumn<T>[], rows: T[]): Promise<void> {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const pdf = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' });
    pdf.setFontSize(14);
    pdf.text(title, 14, 16);
    autoTable(pdf, {
      startY: 22,
      head: [columns.map((column) => column.label)],
      body: rows.map((row) => columns.map((column) => this.value(column.value(row)))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [57, 169, 0] },
    });
    this.savePdf(pdf, `${fileName}.pdf`);
  }

  /** Aparte para poder comprobar en las pruebas qué documento se generó. */
  private savePdf(pdf: { save(name: string): unknown }, name: string): void {
    pdf.save(name);
  }

  private value(value: string | number | null | undefined): string | number {
    return value == null ? '—' : value;
  }

  private download(blob: Blob, name: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
