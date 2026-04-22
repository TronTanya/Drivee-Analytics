import { ApiError, apiFetch } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import type { ReportPdfMode } from "@/lib/preferences/report-pdf";
export type { ReportPdfMode } from "@/lib/preferences/report-pdf";
import { requestJson } from "@/lib/api/request";
import { mockListReports, mockListScenarios } from "@/lib/api/mocks";
import { getReportSnapshot } from "@/lib/reports/local-snapshots";
import type { CreateReportRequestDto, NotebookScenarioDto, SavedReportDto } from "@/types/api/reports";

export async function fetchSavedReports(): Promise<SavedReportDto[]> {
  return requestJson({
    path: "/api/v1/reports",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListReports()
  });
}

export async function fetchNotebookScenarios(): Promise<NotebookScenarioDto[]> {
  return requestJson({
    path: "/api/v1/reports/scenarios",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListScenarios()
  });
}

export async function createReport(body: CreateReportRequestDto): Promise<SavedReportDto> {
  return requestJson({
    path: "/api/v1/reports",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => {
      const id = `r-${Date.now()}`;
      return {
        id,
        name: body.name,
        updated_at: new Date().toISOString(),
        schedule: "none",
        format: body.format,
        notebook_id: body.notebook_id ?? null,
        download_url: `/api/v1/reports/${id}/download`
      };
    }
  });
}

export async function rerunReport(id: string): Promise<{ status: string }> {
  return requestJson({
    path: `/api/v1/reports/${encodeURIComponent(id)}/rerun`,
    init: { method: "POST" },
    mock: async () => ({ status: "queued" })
  });
}

export async function deleteReport(id: string): Promise<void> {
  await requestJson<Record<string, never>>({
    path: `/api/v1/reports/${encodeURIComponent(id)}`,
    init: { method: "DELETE" },
    mock: async () => ({})
  });
}

function toBytesFromBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      out.push(current);
      current = w;
    }
  }
  if (current) out.push(current);
  return out;
}

function firstNumericColumn(rows: Array<Record<string, string | number>>): string | null {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0]);
  for (const key of keys) {
    if (rows.some((r) => typeof r[key] === "number")) return key;
  }
  return null;
}

async function makeFallbackPdfBlob(reportId: string, reportName: string, mode: ReportPdfMode): Promise<Blob> {
  if (typeof document === "undefined") {
    return new Blob([`Drivee Analytics\n${reportName}`], { type: "application/pdf" });
  }

  const snapshot = getReportSnapshot(reportId);
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new Blob([`Drivee Analytics\n${reportName}`], { type: "application/pdf" });
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 70;
  const left = 70;
  const contentWidth = canvas.width - left * 2;

  // Header
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 42px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
  ctx.fillText("Drivee Analytics Notebook", left, y);
  y += 55;
  ctx.font = "600 30px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
  ctx.fillText(`Отчет: ${reportName}`, left, y);
  y += 42;
  ctx.fillStyle = "#334155";
  ctx.font = "500 24px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
  ctx.fillText(`Режим: ${mode}`, left, y);
  y += 36;
  ctx.fillText(`Сформирован: ${new Date().toLocaleString("ru-RU")}`, left, y);
  y += 26;
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(canvas.width - left, y);
  ctx.stroke();
  y += 30;

  // Text blocks
  const drawLabeledText = (label: string, value?: string) => {
    if (!value) return;
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 24px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
    ctx.fillText(label, left, y);
    y += 30;
    ctx.fillStyle = "#111827";
    ctx.font = "500 22px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
    for (const line of wrapText(ctx, value, contentWidth)) {
      ctx.fillText(line, left, y);
      y += 28;
    }
    y += 14;
  };

  drawLabeledText("Сценарий", snapshot?.notebook_id ?? "—");
  drawLabeledText("Промпт", snapshot?.prompt);
  drawLabeledText("Инсайт", snapshot?.insight);
  if (typeof snapshot?.confidence === "number") {
    drawLabeledText("Confidence", snapshot.confidence.toFixed(2));
  }
  if (snapshot?.warnings?.length) {
    drawLabeledText("Предупреждения", snapshot.warnings.join(" · "));
  }
  if (snapshot?.sql) {
    drawLabeledText("SQL", snapshot.sql);
  }

  // Diagram + table from data
  if (snapshot?.table_preview?.length) {
    const rows = snapshot.table_preview;
    const xCol = Object.keys(rows[0] ?? {})[0];
    const yCol = firstNumericColumn(rows);

    if (xCol && yCol) {
      const chartTop = y + 8;
      const chartH = 260;
      const chartW = contentWidth;
      const chartX = left;

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(chartX, chartTop, chartW, chartH);
      ctx.strokeStyle = "#cbd5e1";
      ctx.strokeRect(chartX, chartTop, chartW, chartH);

      const values = rows.map((r) => Number(r[yCol] ?? 0));
      const max = Math.max(...values, 1);
      const min = Math.min(...values, 0);
      const span = Math.max(max - min, 1);

      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      rows.forEach((row, i) => {
        const px = chartX + 30 + (i * (chartW - 60)) / Math.max(rows.length - 1, 1);
        const py = chartTop + chartH - 25 - ((Number(row[yCol] ?? 0) - min) / span) * (chartH - 50);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      ctx.fillStyle = "#065f46";
      ctx.font = "700 20px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
      ctx.fillText(`Диаграмма: ${yCol} по ${xCol}`, chartX + 12, chartTop + 24);
      y = chartTop + chartH + 36;
    }

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 24px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
    ctx.fillText("Данные (первые строки)", left, y);
    y += 30;

    const cols = Object.keys(rows[0]).slice(0, 4);
    ctx.font = "700 19px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
    ctx.fillStyle = "#334155";
    ctx.fillText(cols.join(" | "), left, y);
    y += 24;
    ctx.font = "500 18px -apple-system, BlinkMacSystemFont, Segoe UI, Inter, Arial";
    ctx.fillStyle = "#111827";
    for (const row of rows.slice(0, 6)) {
      const line = cols.map((c) => String(row[c] ?? "")).join(" | ");
      for (const wrapped of wrapText(ctx, line, contentWidth)) {
        ctx.fillText(wrapped, left, y);
        y += 22;
      }
    }
  }

  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const jpegBase64 = jpegDataUrl.split(",")[1] ?? "";
  const jpegBytes = toBytesFromBase64(jpegBase64);

  const pageW = 595;
  const pageH = 842;
  const imgW = pageW;
  const imgH = pageH;

  const header = "%PDF-1.4\n";
  const obj1 = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
  const obj2 = "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n";
  const obj3 =
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >> endobj\n";
  const obj4a =
    `4 0 obj << /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >> stream\n`;
  const obj4b = "\nendstream endobj\n";
  const contentStream = `q\n${imgW} 0 0 ${imgH} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = new TextEncoder().encode(contentStream);
  const obj5a = `5 0 obj << /Length ${contentBytes.length} >> stream\n`;
  const obj5b = "\nendstream endobj\n";

  const chunks: BlobPart[] = [];
  const encoder = new TextEncoder();
  let totalBytes = 0;
  const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(toArrayBuffer(bytes));
    totalBytes += bytes.byteLength;
  };
  const pushText = (text: string) => pushBytes(encoder.encode(text));
  const size = () => totalBytes;

  pushText(header);
  const offsets: number[] = [0];
  offsets.push(size()); pushText(obj1);
  offsets.push(size()); pushText(obj2);
  offsets.push(size()); pushText(obj3);
  offsets.push(size()); pushText(obj4a); pushBytes(jpegBytes); pushText(obj4b);
  offsets.push(size()); pushText(obj5a); pushBytes(contentBytes); pushText(obj5b);

  const xrefStart = size();
  pushText(`xref\n0 7\n`);
  pushText("0000000000 65535 f \n");
  for (let i = 1; i <= 6; i += 1) {
    pushText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks, { type: "application/pdf" });
}

function makeUltraSafePdfBlob(reportName: string): Blob {
  const safeName = reportName.replace(/[()\\]/g, "_");
  const stream = [
    "BT /F1 12 Tf 72 760 Td (Drivee Analytics Notebook) Tj ET",
    `BT /F1 12 Tf 72 738 Td (Report: ${safeName}) Tj ET`,
    "BT /F1 12 Tf 72 716 Td (Fallback PDF generated) Tj ET"
  ].join("\n");
  const streamBytes = new TextEncoder().encode(stream);

  const obj1 = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
  const obj2 = "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n";
  const obj3 = "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n";
  const obj4 = "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n";
  const obj5a = `5 0 obj << /Length ${streamBytes.length} >> stream\n`;
  const obj5b = "\nendstream endobj\n";

  const chunks: BlobPart[] = [];
  const enc = new TextEncoder();
  let totalBytes = 0;
  const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(toArrayBuffer(bytes));
    totalBytes += bytes.byteLength;
  };
  const pushText = (s: string) => pushBytes(enc.encode(s));
  const size = () => totalBytes;

  pushText("%PDF-1.4\n");
  const offsets: number[] = [0];
  offsets.push(size()); pushText(obj1);
  offsets.push(size()); pushText(obj2);
  offsets.push(size()); pushText(obj3);
  offsets.push(size()); pushText(obj4);
  offsets.push(size()); pushText(obj5a); pushBytes(streamBytes); pushText(obj5b);

  const xrefStart = size();
  pushText("xref\n0 6\n");
  pushText("0000000000 65535 f \n");
  for (let i = 1; i <= 5; i += 1) {
    pushText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks, { type: "application/pdf" });
}

async function getSafeFallbackPdfBlob(reportId: string, reportName: string, mode: ReportPdfMode): Promise<Blob> {
  try {
    return await makeFallbackPdfBlob(reportId, reportName, mode);
  } catch {
    return makeUltraSafePdfBlob(reportName);
  }
}

export async function downloadReportPdf(reportId: string, reportName: string, mode: ReportPdfMode = "board"): Promise<Blob> {
  if (isApiMockOnly()) {
    return await getSafeFallbackPdfBlob(reportId, reportName, mode);
  }
  try {
    const res = await apiFetch(`/api/v1/reports/${encodeURIComponent(reportId)}/download?mode=${encodeURIComponent(mode)}`, { method: "GET" });
    if (!res.ok) {
      const body = await res.text();
      throw new ApiError("Не удалось скачать PDF", res.status, body);
    }
    return await res.blob();
  } catch {
    // Always degrade to local PDF in UI flows:
    // backend can be unavailable/auth-protected in demo mode.
    return await getSafeFallbackPdfBlob(reportId, reportName, mode);
  }
}
