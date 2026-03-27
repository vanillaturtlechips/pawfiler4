import jsPDF from "jspdf";
import type { UnifiedReport } from "@/lib/types";

const verdictLabel: Record<string, string> = {
  FAKE: "AI Generated (Fake)",
  REAL: "Real Video",
  UNCERTAIN: "Uncertain",
};

export function generateAnalysisPdf(report: UnifiedReport) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  doc.text("PawFiler Analysis Report", w / 2, y, { align: "center" });
  y += 12;

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Task ID: ${report.taskId}`, w / 2, y, { align: "center" });
  y += 6;
  doc.text(`Generated: ${new Date().toLocaleString("ko-KR")}`, w / 2, y, { align: "center" });
  y += 15;

  // Verdict box
  const verdictColor: Record<string, [number, number, number]> = {
    FAKE: [220, 38, 38],
    REAL: [34, 197, 94],
    UNCERTAIN: [234, 179, 8],
  };
  const vc = verdictColor[report.finalVerdict] || [100, 100, 100];

  doc.setDrawColor(vc[0], vc[1], vc[2]);
  doc.setLineWidth(1.5);
  doc.roundedRect(20, y, w - 40, 35, 5, 5, "S");

  doc.setFontSize(16);
  doc.setTextColor(vc[0], vc[1], vc[2]);
  doc.text(verdictLabel[report.finalVerdict] || report.finalVerdict, w / 2, y + 15, { align: "center" });

  doc.setFontSize(24);
  doc.text(`${(report.confidence * 100).toFixed(1)}%`, w / 2, y + 28, { align: "center" });
  y += 45;

  // Visual Analysis
  if (report.visual) {
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text("Visual Analysis", 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Verdict: ${report.visual.verdict}`, 25, y); y += 6;
    doc.text(`Confidence: ${(report.visual.confidence * 100).toFixed(1)}%`, 25, y); y += 6;
    doc.text(`Frames Analyzed: ${report.visual.framesAnalyzed}`, 25, y); y += 6;
    if (report.visual.aiModel) {
      doc.text(`AI Model Detected: ${report.visual.aiModel.modelName} (${(report.visual.aiModel.confidence * 100).toFixed(0)}%)`, 25, y);
      y += 6;
    }
    y += 8;
  }

  // Audio Analysis
  if (report.audio) {
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text("Audio Analysis", 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(`Synthetic: ${report.audio.isSynthetic ? "Yes" : "No"}`, 25, y); y += 6;
    doc.text(`Confidence: ${(report.audio.confidence * 100).toFixed(1)}%`, 25, y); y += 6;
    doc.text(`Method: ${report.audio.method}`, 25, y); y += 6;
    y += 8;
  }

  // AI Explanation
  if (report.explanation) {
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text("AI Analysis Summary", 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(report.explanation, w - 50);
    doc.text(lines, 25, y);
    y += lines.length * 5 + 8;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(`Processing Time: ${(report.totalProcessingTimeMs / 1000).toFixed(1)}s`, 20, 280);
  doc.text("Powered by PawFiler AI", w - 20, 280, { align: "right" });

  doc.save(`pawfiler-report-${report.taskId}.pdf`);
}
