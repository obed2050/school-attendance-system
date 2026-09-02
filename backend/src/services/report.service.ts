import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import {
  AttendanceExportQuery,
  getAttendanceRecordsForExport
} from "./attendance.service";

type RawRecord = {
  user: {
    fullName: string;
    email: string;
    phoneNumber: string;
    department: { name: string };
  };
  attendanceDate: Date;
  checkInTime: Date;
  status: string;
  verificationStatus: string;
};

type ReportRecord = RawRecord;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatCheckInTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function normalizeRecord(record: RawRecord): ReportRecord {
  return {
    user: record.user,
    attendanceDate: new Date(record.attendanceDate),
    checkInTime: new Date(record.checkInTime),
    status: record.status,
    verificationStatus: record.verificationStatus
  };
}

function formatFiltersLabel(filters: AttendanceExportQuery): string[] {
  const parts: string[] = [];
  if (filters.date) parts.push(`Date: ${filters.date}`);
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`From: ${filters.dateFrom ?? "start"}  To: ${filters.dateTo ?? "today"}`);
  }
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.search) parts.push(`Search: "${filters.search}"`);
  return parts;
}

async function resolveDepartmentName(departmentId?: number): Promise<string | undefined> {
  if (!departmentId) return undefined;
  const department = await prisma.department.findUnique({
    where: { id: departmentId }
  });
  return department?.name;
}

export interface AttendanceExportData {
  records: ReportRecord[];
  filters: string[];
  departmentName?: string;
}

export async function buildAttendanceExportData(
  filters: AttendanceExportQuery
): Promise<AttendanceExportData> {
  const [rawRecords, departmentName] = await Promise.all([
    getAttendanceRecordsForExport(filters),
    resolveDepartmentName(filters.department)
  ]);

  const records = (rawRecords as RawRecord[]).map(normalizeRecord);

  return {
    records,
    filters: formatFiltersLabel(filters),
    departmentName
  };
}

export async function buildAttendancePdfBuffer(
  data: AttendanceExportData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(env.SCHOOL_NAME, { align: "center" });
    doc.moveDown(0.4);
    doc.fontSize(13).text("Attendance Report", { align: "center" });
    doc.moveDown(0.8);

    const filterLines = [...data.filters];
    if (data.departmentName) {
      filterLines.push(`Department: ${data.departmentName}`);
    }
    if (filterLines.length > 0) {
      doc.fontSize(9).text(`Filters: ${filterLines.join("   |   ")}`);
      doc.moveDown(0.3);
    }

    doc
      .fontSize(9)
      .text(`Generated: ${new Date().toLocaleString("en-US")}`, { align: "right" });
    doc.moveDown(0.8);

    const margins = { left: doc.page.margins.left, right: doc.page.margins.right };
    const pageWidth = doc.page.width - margins.left - margins.right;
    const cols: { label: string; width: number }[] = [
      { label: "Full Name", width: 0.17 },
      { label: "Email", width: 0.19 },
      { label: "Phone", width: 0.13 },
      { label: "Department", width: 0.16 },
      { label: "Date", width: 0.09 },
      { label: "Check-in", width: 0.09 },
      { label: "Status", width: 0.08 },
      { label: "Verification", width: 0.09 }
    ];

    const drawHeader = (y: number): number => {
      doc.rect(margins.left, y, pageWidth, 16).fill("#1D4ED8");
      let x = margins.left;
      for (const col of cols) {
        const w = col.width * pageWidth;
        doc
          .fillColor("#FFFFFF")
          .text(col.label, x + 3, y + 4, {
            width: w - 3,
            ellipsis: true
          });
        x += w;
      }
      return y + 16;
    };

    const drawRow = (record: ReportRecord, y: number): number => {
      const values = [
        record.user.fullName,
        record.user.email,
        record.user.phoneNumber,
        record.user.department.name,
        formatDate(record.attendanceDate),
        formatCheckInTime(record.checkInTime),
        record.status,
        record.verificationStatus ?? "PENDING"
      ];
      let x = margins.left;
      for (let i = 0; i < cols.length; i += 1) {
        const w = cols[i].width * pageWidth;
        doc
          .fillColor("#111827")
          .text(values[i], x + 3, y + 4, {
            width: w - 3,
            ellipsis: true,
            lineBreak: false
          });
        x += w;
      }
      const nextY = y + 22;
      doc
        .moveTo(margins.left, nextY - 6)
        .lineTo(margins.left + pageWidth, nextY - 6)
        .strokeColor("#E5E7EB")
        .stroke();
      return nextY;
    };

    let y = drawHeader(doc.y);
    for (const record of data.records) {
      if (y > doc.page.height - 90) {
        doc.addPage();
        y = drawHeader(doc.y + 10);
      }
      y = drawRow(record, y);
    }

    doc
      .fillColor("#6B7280")
      .fontSize(8)
      .text(`Total records: ${data.records.length}`, margins.left, y + 8);

    doc.end();
  });
}

export async function buildAttendanceExcelBuffer(
  data: AttendanceExportData
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = env.SCHOOL_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Attendance Report");

  sheet.columns = [
    { header: "Full Name", key: "fullName", width: 24 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone Number", key: "phoneNumber", width: 18 },
    { header: "Department", key: "department", width: 30 },
    { header: "Attendance Date", key: "date", width: 16 },
    { header: "Check-in Time", key: "checkIn", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Verification", key: "verification", width: 14 }
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4ED8" }
  };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.getRow(1).height = 20;

  for (const record of data.records) {
    sheet.addRow({
      fullName: record.user.fullName,
      email: record.user.email,
      phoneNumber: record.user.phoneNumber,
      department: record.user.department.name,
      date: formatDate(record.attendanceDate),
      checkIn: formatCheckInTime(record.checkInTime),
      status: record.status,
      verification: record.verificationStatus ?? "PENDING"
    });
  }

  sheet.eachRow((row) => {
    row.alignment = { vertical: "middle" };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}