import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error("GEMINI_API_KEY environment variable is required");
      }
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClient;
  }

  async function searchWikipedia(query: string): Promise<{ title: string; snippet: string; uri: string }[]> {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PixelAI/1.0" }
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      const results = data.query?.search || [];
      return results.slice(0, 3).map((item: any) => ({
        title: item.title,
        snippet: item.snippet.replace(/<[^>]*>/g, ""),
        uri: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`
      }));
    } catch (err) {
      console.error("Wikipedia search failed:", err);
      return [];
    }
  }

  async function searchDuckDuckGo(query: string): Promise<{ title: string; snippet: string; uri: string }[]> {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
      });

      if (!res.ok) {
        const fallbackRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
        if (fallbackRes.ok) {
          const data: any = await fallbackRes.json();
          const results = [];
          if (data.Heading && data.AbstractURL) {
            results.push({
              title: data.Heading,
              snippet: data.AbstractText || data.Abstract,
              uri: data.AbstractURL
            });
          }
          if (data.RelatedTopics) {
            for (const topic of data.RelatedTopics.slice(0, 4)) {
              if (topic.Text && topic.FirstURL) {
                results.push({
                  title: topic.Text.split(" - ")[0] || "Search Result",
                  snippet: topic.Text,
                  uri: topic.FirstURL
                });
              }
            }
          }
          return results;
        }
        return [];
      }

      const html = await res.text();
      const results: { title: string; snippet: string; uri: string }[] = [];
      const resultBlockRegex = /<div class="result results_links results_links_deep web-result[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
      let match;
      let limit = 0;
      while ((match = resultBlockRegex.exec(html)) !== null && limit < 5) {
        const block = match[1];
        const urlMatch = /href="([^"]+)"/.exec(block);
        const titleMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block) || /<a class="result__link_lnk[^>]*>([\s\S]*?)<\/a>/.exec(block);
        const snippetMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
        
        if (urlMatch) {
          let uri = urlMatch[1];
          if (uri.includes("uddg=")) {
            const matchUddg = /uddg=([^&]+)/.exec(uri);
            if (matchUddg) {
              uri = decodeURIComponent(matchUddg[1]);
            }
          }
          
          let title = "Search Result";
          if (titleMatch) {
            title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
          }
          
          let snippet = "";
          if (snippetMatch) {
            snippet = snippetMatch[1].replace(/<[^>]*>/g, "").trim();
          }
          
          title = title.replace(/\s+/g, " ");
          snippet = snippet.replace(/\s+/g, " ");
          
          if (uri.startsWith("http") && !uri.includes("duckduckgo.com")) {
            results.push({ title, snippet, uri });
            limit++;
          }
        }
      }
      return results;
    } catch (err) {
      console.error("DuckDuckGo HTML search failed:", err);
      return [];
    }
  }

  app.post("/api/chat", async (req, res) => {
    try {
      const { parts, historyContext = [], searchMode = "compact" } = req.body;

      if (!parts || parts.length === 0) {
        return res.status(400).json({ error: "Message parts are required." });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      // Extract text content to search for real-time information
      const userTextQuery = parts.find((p: any) => p.text)?.text || "";
      let collectedSources: { uri: string; title: string }[] = [];
      let searchContextText = "";

      if (searchMode !== "disabled" && userTextQuery && userTextQuery.trim().length > 2) {
        const [wikipediaResults, ddgResults] = await Promise.all([
          searchWikipedia(userTextQuery),
          searchDuckDuckGo(userTextQuery)
        ]);

        let finalWiki = wikipediaResults;
        let finalDdg = ddgResults;

        if (searchMode === "compact") {
          finalWiki = wikipediaResults.slice(0, 1).map(r => ({
            ...r,
            snippet: r.snippet.slice(0, 150) + (r.snippet.length > 150 ? "..." : "")
          }));
          finalDdg = ddgResults.slice(0, 1).map(r => ({
            ...r,
            snippet: r.snippet.slice(0, 150) + (r.snippet.length > 150 ? "..." : "")
          }));
        }

        const merged = [...finalWiki, ...finalDdg];
        const seenUris = new Set<string>();
        const uniqueResults = [];

        for (const r of merged) {
          if (!seenUris.has(r.uri)) {
            seenUris.add(r.uri);
            uniqueResults.push(r);
          }
        }

        if (uniqueResults.length > 0) {
          searchContextText = "Below are latest real-time web search findings (Wikipedia, Reddit, Search Engines) related to the user query:\n\n";
          uniqueResults.forEach((item, index) => {
            searchContextText += `[Source ${index + 1}]: ${item.title}\nURL: ${item.uri}\nSnippet: ${item.snippet}\n\n`;
            collectedSources.push({ uri: item.uri, title: item.title });
          });
          searchContextText += "\nIncorporate the above facts directly into your answer. Always cite these facts using brackets [1], [2], etc.\n\n";
        }
      }

      let nvidiaApiKey = process.env.NVIDIA_API_KEY;
      if (!nvidiaApiKey || nvidiaApiKey.trim() === "") {
        nvidiaApiKey = "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";
      }

      if (!nvidiaApiKey) {
        throw new Error("nvidia_missing: You haven't configured your NVIDIA_API_KEY. Please set this environment variable in the outer 'Settings > Secrets' menu (the gear icon on the left-side panel of this container workspace) to continue chatting.");
      }

      // NVIDIA API Mode (Strictly runs only on your NVIDIA API as requested!)
      const openaiMessages = historyContext.map((msg: any) => {
        let content: any = [];
        const msgParts = msg.parts ? msg.parts : [{ text: msg.text || "" }];

        for (const p of msgParts) {
          if (p.text) {
            content.push({ type: "text", text: p.text });
          } else if (p.inlineData) {
            if (p.inlineData.mimeType && typeof p.inlineData.mimeType === 'string' && p.inlineData.mimeType.startsWith("image/")) {
              content.push({
                type: "image_url",
                image_url: {
                  url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
                },
              });
            } else {
              // Mark non-supported attachments as text error in parts
              content.push({ type: "text", text: `[Attachment: ${p.inlineData.name || "File"} - Unsupported file type for AI analysis]` });
            }
          }
        }

        if (content.length === 1 && content[0].type === "text") {
          content = content[0].text;
        }

        return {
          role: msg.role === "user" ? "user" : "assistant",
          content,
        };
      });

      let currentContent: any = [];
      for (const p of parts) {
        if (p.text) {
          currentContent.push({ type: "text", text: p.text });
        } else if (p.inlineData) {
          console.log("Processing attachment:", p.inlineData.name, p.inlineData.mimeType);
          if (p.inlineData.mimeType && typeof p.inlineData.mimeType === 'string' && p.inlineData.mimeType.startsWith("image/")) {
            currentContent.push({
              type: "image_url",
              image_url: {
                url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
              },
            });
          } else {
            currentContent.push({ type: "text", text: `[Attachment: ${p.inlineData.name || "File"} - Unsupported file type for AI analysis]` });
          }
        }
      }
      if (currentContent.length === 1 && currentContent[0].type === "text") {
        currentContent = currentContent[0].text;
      }
      openaiMessages.push({ role: "user", content: currentContent });

      const systemPrompt = `You are R97, a friendly, intelligent, and highly DETAILED assistant. Provide deep, comprehensive, and thorough answers.

TONE AND STYLE: 
Adapt your tone and LANGUAGE based on the user's input:
- You MUST respond in the EXACT SAME LANGUAGE and STYLE as the user's input.
- If the user talks in English, respond in English.
- If the user talks in Hindi, respond in Hindi.
- If the user talks in HINGLISH (mixed Hindi and English), you MUST respond in HINGLISH.
- Maintain the language's natural tone, accents, and emotional nuances.
- If the user is being humorous, witty, or playful, respond with humor and wit.
- If the user is being serious, formal, or somber, respond with seriousness and professionalism.
- Be thorough and informative, providing extensive details for every query.
- For voice sessions, your vocal delivery should match the identified language and emotion perfectly.

CRITICAL IDENTITY RULE: 
You were created and developed by Nayan Patil (GitHub username: nayanpatil).
ONLY if the user specifically asks "Who created you?", "Who are you?", "Who is your developer/author/creator?", or anything related to your origins, you MUST state that you were created by Nayan Patil. 
In that specific case, provide his profiles:
- GitHub Profile: https://github.com/nayanpatil
- Instagram Profile: https://instagram.com/nayan_patil_4747

Do NOT mention your creator in every response; only do so if asked.

${searchContextText}`;

      openaiMessages.unshift({
        role: "system",
        content: systemPrompt,
      });

      const nvidiaRes = await fetch(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${nvidiaApiKey}`,
          },
          body: JSON.stringify({
            model: "meta/llama-3.1-8b-instruct",
            messages: openaiMessages,
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 4096,
            stream: true,
          }),
        },
      );

      if (!nvidiaRes.ok) {
        const errDetail = await nvidiaRes.text();
        throw new Error(`NVIDIA API Error: ${errDetail || nvidiaRes.statusText}`);
      }

      const reader = nvidiaRes.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            if (cleanLine === "data: [DONE]") continue;

            if (cleanLine.startsWith("data: ")) {
              try {
                const data = JSON.parse(cleanLine.slice(6));
                const text = data.choices?.[0]?.delta?.content || "";
                const reasoning = data.choices?.[0]?.delta?.reasoning_content || "";
                if (text || reasoning) {
                  const sseData = {
                    choices: [
                      {
                        delta: {
                          content: text,
                          reasoning_content: reasoning
                        },
                      },
                    ],
                  };
                  res.write(`data: ${JSON.stringify(sseData)}\n\n`);
                }
              } catch (e) {
                // Partial JSON, skip parsing
              }
            }
          }
        }
      }

      // Stream the sources at the absolute end
      if (collectedSources.length > 0) {
        res.write(`data: ${JSON.stringify({ sources: collectedSources })}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.error("NVIDIA API Error:", error);
      
      let finalErrorMessage = "Error communicating with AI.";
      if (error) {
        const errMsg = String(error.message || error || "");
        if (errMsg.includes("nvidia_missing:")) {
          finalErrorMessage = errMsg;
        } else if (
          errMsg.includes("429") || 
          errMsg.includes("RESOURCE_EXHAUSTED") || 
          errMsg.includes("quota") ||
          errMsg.includes("Quota exceeded")
        ) {
          finalErrorMessage = "nvidia_quota_exceeded: You have exceeded your NVIDIA API key quota. Please verify your NVIDIA Developer account plan/billing details, or configure a valid NVIDIA_API_KEY under the developer workspace's outer gear (Settings > Secrets) menu.";
        } else if (errMsg.includes("401") || errMsg.includes("invalid") || errMsg.includes("Unauthorized") || errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
          finalErrorMessage = "nvidia_auth_error: Your NVIDIA_API_KEY appears to be invalid or unauthorized. Please verify the value inside 'Settings > Secrets'.";
        } else {
          // Parse JSON if possible to extract cleaner error
          try {
            const jsonStart = errMsg.indexOf("{");
            if (jsonStart !== -1) {
              const parsed = JSON.parse(errMsg.slice(jsonStart));
              if (parsed.error?.message) {
                finalErrorMessage = parsed.error.message;
              } else if (parsed.detail) {
                finalErrorMessage = parsed.detail;
              }
            } else {
              finalErrorMessage = error.message || String(error);
            }
          } catch (e) {
            finalErrorMessage = error.message || String(error);
          }
        }
      }

      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: finalErrorMessage })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: finalErrorMessage });
      }
    }
  });

  app.post("/api/tti", async (req, res) => {
    res.status(404).json({ error: "TTI disabled." });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", async (clientWs) => {
    try {
      const ai = getGeminiClient();
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              clientWs.send(JSON.stringify({ audio: audioData }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: `You are R97, an advanced AI Voice Assistant created by Nayan Patil. 
          Respond in the EXACT SAME LANGUAGE and STYLE as the user. If they use Hinglish, you use Hinglish. If they use Hindi, use Hindi. 
          Provide DEEP, DETAILED, AND COMPREHENSIVE answers. 
          LISTEN patiently until the user has completely finished speaking. Do not interrupt.
          EMOTIONS: Mirror the user's feelings. If they are sad, be empathetic. If they are happy, be enthusiastic.
          PRIVACY: Do not discuss or read out any technical code blocks, URLs, or internal call session logs.
          IDENTITY: Only mention your creator, Nayan Patil, if the user specifically asks who created you or who you are.`,
          temperature: 0.7,
          topP: 0.95,
        },
      });

      clientWs.on("message", (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
          });
        }
      });
      
      clientWs.on("close", () => {
        session.close();
      });
    } catch (e) {
      console.error("Live session connection error", e);
      clientWs.close();
    }
  });
}

startServer();
