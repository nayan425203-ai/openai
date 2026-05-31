import React, { useState } from "react";
import { Download, FileText, File, Calendar, Share2, Clipboard, Printer } from "lucide-react";

interface DocumentExporterProps {
  messageId: string;
  markdownText: string;
}

export const DocumentExporter: React.FC<DocumentExporterProps> = ({ messageId, markdownText }) => {
  const [activeMenu, setActiveMenu] = useState(false);

  // Helper to trigger file downloads
  const downloadFile = (content: string, mimeType: string, filename: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 1. Download as Plain Text / MD
  const handleDownloadTxt = () => {
    downloadFile(markdownText, "text/plain;charset=utf-8", `document-${messageId}.txt`);
  };

  // Convert clean markdown titles to basic HTML for formatted documents (Docx/HTML)
  const markdownToHtml = (md: string) => {
    let html = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Replace headers
    html = html.replace(/^### (.*$)/gim, '<h3 style="font-family: Arial, sans-serif; color: #1e293b; margin-top: 16px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="font-family: Arial, sans-serif; color: #0f172a; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #cbd5e1; padding-bottom: 6px;">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="font-family: Arial, sans-serif; color: #020617; font-size: 28px; margin-top: 24px; margin-bottom: 16px; text-transform: uppercase;">$1</h1>');

    // Replace bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Replace bullet lists
    html = html.replace(/^\s*\-\s+(.*$)/gim, '<li style="margin-left: 20px; margin-bottom: 6px;">$1</li>');
    html = html.replace(/^\s*\*\s+(.*$)/gim, '<li style="margin-left: 20px; margin-bottom: 6px;">$1</li>');

    // Replace paragraphs (skipping headers/lists)
    const lines = html.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith("<h") && !line.startsWith("<li") && !line.startsWith("<pre") && !line.startsWith("<div")) {
        lines[i] = `<p style="line-height: 1.6; margin-bottom: 12px; color: #334155;">${line}</p>`;
      }
    }
    return lines.join("\n");
  };

  // 2. Download as HTML web document
  const handleDownloadHtml = () => {
    const formattedHtml = markdownToHtml(markdownText);
    const docLayout = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Document Export ${messageId}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #1e293b;
              line-height: 1.6;
              max-width: 800px;
              margin: 40px auto;
              padding: 0 24px;
              background-color: #f8fafc;
            }
            .document-card {
              background: #ffffff;
              border: 1px solid #e2e8f0;
              padding: 48px;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
              border-radius: 8px;
            }
            p { margin-bottom: 16px; }
            li { margin-bottom: 8px; }
          </style>
        </head>
        <body>
          <div class="document-card">
            ${formattedHtml}
          </div>
        </body>
      </html>
    `;
    downloadFile(docLayout, "text/html;charset=utf-8", `document-${messageId}.html`);
  };

  // 3. Download as Microsoft Word .DOCX Document
  const handleDownloadDocx = () => {
    const formattedHtml = markdownToHtml(markdownText);
    
    // Microsoft word special Office metadata declarations
    const msoHeader = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <title>Document Report</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; margin: 1in; }
            h1 { font-size: 20pt; font-weight: bold; margin-bottom: 12pt; color: #1e3a8a; }
            h2 { font-size: 15pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; color: #1e40af; border-bottom: 1px solid #e5e7eb; }
            h3 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; color: #1d4ed8; }
            p { margin-bottom: 10pt; color: #334155; }
            li { margin-bottom: 4pt; }
          </style>
        </head>
        <body>
          ${formattedHtml}
        </body>
      </html>
    `;
    
    downloadFile(msoHeader, "application/msword;charset=utf-8", `document-${messageId}.docx`);
  };

  // 4. Save as PDF via Focused Browser Print (Bypasses sandboxed iframe popup blocks)
  const handleDownloadPdf = () => {
    // 1. Tag the container of this message as the "print focus target"
    const targetElement = document.getElementById(`msg-container-${messageId}`);
    if (targetElement) {
      // Add custom class to isolate the printed element
      document.body.classList.add("print-active-running");
      targetElement.classList.add("print-focus-subject");

      // Small CSS Injector specifically targeting printing
      const style = document.createElement("style");
      style.id = "print-style-injector";
      style.textContent = `
        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-focus-subject, .print-focus-subject * {
            visibility: visible !important;
          }
          .print-focus-subject {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 20px !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            color: black !important;
          }
          /* Hide non-printable print element controls */
          .print-exclude {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `;
      document.head.appendChild(style);

      // Trigger standard print
      setTimeout(() => {
        window.print();
        
        // Cleanup class definitions after window.print finishes
        document.body.classList.remove("print-active-running");
        targetElement.classList.remove("print-focus-subject");
        const styleNode = document.getElementById("print-style-injector");
        if (styleNode) styleNode.remove();
      }, 150);
    } else {
      // Fallback: simple copy or prompt
      alert("Print preparation failed. This browser environment might be confined.");
    }
  };

  return (
    <div className="mt-4 pt-3.5 border-t border-black/10 flex flex-wrap items-center justify-between gap-3 text-black font-sans print-exclude">
      <div className="flex items-center gap-1.5">
        <span className="font-pixel text-[8px] text-gray-500 font-bold uppercase tracking-wider select-none">
          Document Tools:
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleDownloadTxt}
          className="px-2.5 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-black border-2 border-black font-pixel text-[8px] uppercase font-bold flex items-center gap-1.5 shadow-[1px_1px_0_black] active:translate-y-px active:shadow-none transition-all cursor-pointer"
          title="Save as Text File (.txt)"
        >
          <FileText className="w-3.5 h-3.5 text-blue-600" />
          TXT File
        </button>

        <button
          type="button"
          onClick={handleDownloadDocx}
          className="px-2.5 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-black border-2 border-black font-pixel text-[8px] uppercase font-bold flex items-center gap-1.5 shadow-[1px_1px_0_black] active:translate-y-px active:shadow-none transition-all cursor-pointer"
          title="Save as Word Document (.docx)"
        >
          <File className="w-3.5 h-3.5 text-blue-800" />
          DOCX Word
        </button>

        <button
          type="button"
          onClick={handleDownloadHtml}
          className="px-2.5 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-black border-2 border-black font-pixel text-[8px] uppercase font-bold flex items-center gap-1.5 shadow-[1px_1px_0_black] active:translate-y-px active:shadow-none transition-all cursor-pointer"
          title="Save as HTML document (.html)"
        >
          <Share2 className="w-3.5 h-3.5 text-emerald-600" />
          HTML Web
        </button>

        <button
          type="button"
          onClick={handleDownloadPdf}
          className="px-2.5 py-1.5 bg-yellow-200 hover:bg-yellow-300 text-black border-2 border-black font-pixel text-[8px] uppercase font-heavy flex items-center gap-1.5 shadow-[2px_2px_0_black] active:translate-y-px active:shadow-none transition-all cursor-pointer"
          title="Download beautifully styled PDF file"
        >
          <Printer className="w-3.5 h-3.5 text-red-600" />
          SAVE PDF
        </button>
      </div>
    </div>
  );
};
