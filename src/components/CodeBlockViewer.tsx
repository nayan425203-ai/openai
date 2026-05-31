import React, { useState, useEffect } from "react";
import { Copy, Check, Play, Square, Code } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockViewerProps {
  code: string;
  language: string;
}

export const CodeBlockViewer: React.FC<CodeBlockViewerProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);

  const cleanLanguage = (language || "txt").toLowerCase();
  const isPreviewable = ["html", "svg", "css", "javascript", "js", "xml"].includes(cleanLanguage);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code to clipboard:", err);
    }
  };

  // Create a combined HTML model if we want to run a preview of the HTML/CSS/JS code
  const getSrcDoc = () => {
    if (cleanLanguage === "svg") {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                margin: 0;
                padding: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background-color: #f8fafc;
                font-family: system-ui, sans-serif;
              }
              svg {
                max-width: 100%;
                height: auto;
              }
            </style>
          </head>
          <body>
            ${code}
          </body>
        </html>
      `;
    }

    if (cleanLanguage === "html") {
      return code;
    }

    // JS-only raw sandboxed run
    if (["javascript", "js"].includes(cleanLanguage)) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                margin: 16px;
                background-color: #0f172a;
                color: #38bdf8;
                font-family: monospace;
                padding: 8px;
                border-radius: 4px;
              }
            </style>
          </head>
          <body>
            <h4>⚙️ CONSOLE LOG OUTPUT</h4>
            <div id="output"></div>
            <script>
              const outputDiv = document.getElementById("output");
              window.console.log = (...args) => {
                const p = document.createElement("p");
                p.textContent = "> " + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(" ");
                outputDiv.appendChild(p);
              };
              try {
                ${code}
              } catch(err) {
                const p = document.createElement("p");
                p.style.color = "#ef4444";
                p.textContent = "Error: " + err.message;
                outputDiv.appendChild(p);
              }
            </script>
          </body>
        </html>
      `;
    }

    // CSS-only preview
    if (cleanLanguage === "css") {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              ${code}
            </style>
          </head>
          <body style="padding: 24px; font-family: system-ui, sans-serif;">
            <h3>CSS Preview Applied Style</h3>
            <div class="preview-box">
              This element is rendered to showcase your CSS instructions. Customize selectors to see effect.
            </div>
          </body>
        </html>
      `;
    }

    return "";
  };

  return (
    <div className="my-4 border-2 border-black bg-slate-900 rounded-none shadow-[4px_4px_0_rgba(0,0,0,1)] text-black overflow-hidden relative">
      {/* Code block Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b-2 border-black font-pixel text-[9px] uppercase font-bold text-white tracking-wider shrink-0 select-none">
        <span className="flex items-center gap-1.5 font-sans font-black tracking-widest text-[10px] text-yellow-300">
          <Code className="w-3.5 h-3.5" />
          {cleanLanguage}
        </span>
        <div className="flex items-center gap-2">
          {isPreviewable && (
            <button
              type="button"
              onClick={() => setPreviewActive(!previewActive)}
              className={`px-2 py-1 flex items-center gap-1 border border-black shadow-[1px_1px_0_rgba(0,0,0,1)] active:translate-y-px active:shadow-none cursor-pointer transition-all ${
                previewActive 
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white font-bold" 
                  : "bg-yellow-200 hover:bg-yellow-300 text-black font-bold"
              }`}
            >
              {previewActive ? (
                <>
                  <Square className="w-3 h-3 text-white fill-white shrink-0" />
                  Close Live
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-black fill-black shrink-0 animate-pulse" />
                  Live Preview
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-1 bg-white hover:bg-gray-100 text-black border border-black shadow-[1px_1px_0_rgba(0,0,0,1)] active:translate-y-px active:shadow-none flex items-center gap-1 font-bold cursor-pointer transition-all"
            title="Copy entire code to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-black" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Text Viewport */}
      {!previewActive && (
        <div className="font-mono text-xs overflow-auto max-h-[50vh]">
          <SyntaxHighlighter
            style={vscDarkPlus as any}
            language={cleanLanguage}
            PreTag="div"
            className="!m-0 !bg-[#1E1E1E] !text-xs md:!text-sm font-mono leading-relaxed"
          >
            {code.trim()}
          </SyntaxHighlighter>
        </div>
      )}

      {/* Live Preview Viewport */}
      {previewActive && isPreviewable && (
        <div className="bg-white border-t-2 border-black flex flex-col h-[400px]">
          <div className="bg-yellow-100 px-3 py-1 text-[8px] font-pixel border-b border-black flex items-center justify-between text-black select-none font-bold">
            <span>✨ ACTIVE PROJECTIONS SCREEN ENGINE</span>
            <span className="text-emerald-700 animate-pulse">● RUNNING</span>
          </div>
          <iframe
            srcDoc={getSrcDoc()}
            title="Real-time Code Projections Frame"
            className="w-full flex-1 border-none bg-white p-0 m-0"
            sandbox="allow-scripts"
          />
        </div>
      )}
    </div>
  );
};
