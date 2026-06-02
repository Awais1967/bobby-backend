const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

const {
  calculateDurationMinutes,
  formatReportDate,
} = require("../../utils/date");

function formatCurrency(amount, currency = "usd") {
  const safeAmount = Number(amount || 0);
  return `${safeAmount.toFixed(2)} ${String(currency || "usd").toUpperCase()}`;
}

function normalizeRows(data, columns) {
  return data.map((row) =>
    columns.reduce((record, column) => {
      record[column.header] = typeof column.value === "function" ? column.value(row) : row[column.key];
      return record;
    }, {})
  );
}

function exportToCsv(data, columns) {
  try {
    const parser = new Parser({
      fields: columns.map((column) => column.header),
    });

    return parser.parse(normalizeRows(data, columns));
  } catch (error) {
    const exportError = new Error("Failed to generate export file.");
    exportError.statusCode = 500;
    throw exportError;
  }
}

async function exportToExcel(data, columns, sheetName = "Report") {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.header,
      width: column.width || 20,
    }));

    normalizeRows(data, columns).forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    return workbook.xlsx.writeBuffer();
  } catch (error) {
    const exportError = new Error("Failed to generate export file.");
    exportError.statusCode = 500;
    throw exportError;
  }
}

module.exports = {
  calculateDurationMinutes,
  exportToCsv,
  exportToExcel,
  formatCurrency,
  formatReportDate,
};
