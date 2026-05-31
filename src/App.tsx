import React, { useState, useRef, useEffect } from "react";
import { CopyButton } from "./components/CopyButton";
import {
  Send,
  Bot,
  User,
  Menu,
  Plus,
  X,
  Trash2,
  Settings,
  HelpCircle,
  Shield,
  Info,
  Square,
  Sparkles,
  Volume2,
  Pause,
  Phone,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "motion/react";
import { CodeBlockViewer } from "./components/CodeBlockViewer";
import { CallInterface } from "./components/CallInterface";

type Source = {
  uri: string;
  title: string;
};

type Part =
  | { text: string };

type Message = {
  id: string;
  role: "user" | "model";
  parts: Part[];
  text: string; // Used for simple display or fallback
  sources?: Source[];
  reasoning?: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};


export default function App() {
  const [chats, setChats] = useState<ChatSession[]>(() => {
    const savedChats = localStorage.getItem("pixel_ai_chats");
    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {}
    }
    return [
      {
        id: Date.now().toString(),
        title: "New Chat",
        messages: [],
        updatedAt: Date.now(),
      },
    ];
  });
  const [activeChatId, setActiveChatId] = useState<string>(chats[0].id);
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [streamReasoning, setStreamReasoning] = useState("");
  const [streamSources, setStreamSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Web search tuning mode
  const [searchMode, setSearchMode] = useState<"compact" | "standard" | "disabled">(
    () => (localStorage.getItem("pixel_ai_search_mode") as any) || "disabled"
  );
  
  // NVIDIA TTI generator variables
  // Removed TTI functionality

  useEffect(() => {
    localStorage.setItem("pixel_ai_search_mode", searchMode);
  }, [searchMode]);

  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [showSoon, setShowSoon] = useState(false);

  const handleCallClick = () => {
    setShowSoon(true);
    setTimeout(() => setShowSoon(false), 3000);
  };

  const handleEndCall = (durationSec: number) => {
    setIsCallOpen(false);
    if (durationSec < 1) return; // Ignore very short attempts

    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    
    const summaryText = `📞 **Voice Call Session**\n- **Duration:** ${durationStr}\n- **Time:** ${new Date().toLocaleTimeString()}\n- **Status:** Completed`;
    const callSummary: Message = {
      id: `call-${Date.now()}`,
      role: "model",
      parts: [{ text: summaryText }],
      text: summaryText,
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId
          ? {
              ...c,
              messages: [...c.messages, callSummary],
              updatedAt: Date.now(),
            }
          : c
      )
    );
  };

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const messages = activeChat.messages;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, isLoading, streamText, streamReasoning]);

  useEffect(() => {
    localStorage.setItem("pixel_ai_chats", JSON.stringify(chats));
  }, [chats]);

  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isTtsPaused, setIsTtsPaused] = useState(false);

  const speakText = async (text: string, messageId: string) => {
    if (!("speechSynthesis" in window)) {
      alert("TTS not supported in this browser.");
      return;
    }
    const synth = window.speechSynthesis;

    if (playingMessageId === messageId) {
      if (synth.paused) {
        synth.resume();
        setIsTtsPaused(false);
      } else if (synth.speaking) {
        synth.pause();
        setIsTtsPaused(true);
      }
      return;
    }

    setPlayingMessageId(messageId);
    try {
      const cleanText = text
        .replace(/https?:\/\/[^\s]+/g, "")
        .replace(/📞[\s\S]*?(?=\n\n|(?:\r?\n){2}|$)/g, "")
        .replace(/```[\s\S]*?```/g, "")
        .replace(/[*_~`]/g, "") 
        .trim();

      if (!cleanText) {
        setPlayingMessageId(null);
        return;
      }

      // Detect language locally
      const isHindiUrdu = /[\u0900-\u097f\u0600-\u06ff]/.test(cleanText);
      const lang = isHindiUrdu ? "hi-IN" : "en-US";
      const summary = cleanText;

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(summary);
      if (lang) utterance.lang = lang;
      
      const voices = synth.getVoices();
      const matchingVoice = voices.find(v => v.lang.startsWith(lang?.split("-")[0]));
      if (matchingVoice) utterance.voice = matchingVoice;
      
      setIsTtsPaused(false);
      utterance.onend = () => {
        setPlayingMessageId(null);
        setIsTtsPaused(false);
      };
      utterance.onpause = () => setIsTtsPaused(true);
      utterance.onresume = () => setIsTtsPaused(false);
      utterance.onerror = () => setPlayingMessageId(null);
      
      synth.speak(utterance);
    } catch (e) {
      console.error("TTS error", e);
      setPlayingMessageId(null);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let parts: Part[] = [];
    if (input.trim()) {
      parts.push({ text: input.trim() });
    }

    const userText = input.trim();
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      parts,
      text: userText,
    };

    const targetChatId = activeChatId;

    setChats((prev) =>
      prev.map((c) => {
        if (c.id === targetChatId) {
          const isFirstMessage = c.messages.length === 0;
          return {
            ...c,
            messages: [...c.messages, userMsg],
            title: isFirstMessage
              ? userText.slice(0, 20) + (userText.length > 20 ? "..." : "")
              : c.title,
            updatedAt: Date.now(),
          };
        }
        return c;
      }),
    );

    setInput("");
    setIsLoading(true);
    setStreamText("");

    const currentMessages = activeChat.messages;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let aiText = "";
    let aiReasoning = "";
    let aiSources: Source[] = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          parts: userMsg.parts,
          historyContext: currentMessages.map((m) => ({
            role: m.role,
            parts: m.parts,
          })),
          searchMode,
        }),
      });

      if (!response.ok) {
        let errStr = "Failed to fetch response";
        try {
          const err = await response.json();
          errStr = err.error || errStr;
        } catch (e) {}
        throw new Error(errStr);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let chunkAdded = false;
          let reasoningAdded = false;
          let sourcesUpdated = false;
          for (const line of lines) {
            if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.choices) {
                  const delta = data.choices?.[0]?.delta?.content || "";
                  if (delta) {
                    aiText += delta;
                    chunkAdded = true;
                  }
                  const reasoning = data.choices?.[0]?.delta?.reasoning_content || "";
                  if (reasoning) {
                    aiReasoning += reasoning;
                    reasoningAdded = true;
                  }
                }
                if (data.sources) {
                  aiSources = data.sources;
                  sourcesUpdated = true;
                }
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            } else if (line.startsWith('data: {"error"')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.error) throw new Error(data.error);
              } catch (e) {}
            }
          }
          if (chunkAdded) {
            setStreamText(aiText);
          }
          if (reasoningAdded) {
            setStreamReasoning(aiReasoning);
          }
          if (sourcesUpdated) {
            setStreamSources(aiSources);
          }
        }
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        parts: [{ text: aiText }],
        text: aiText,
        sources: aiSources,
        reasoning: aiReasoning || undefined,
      };

      setChats((prev) =>
        prev.map((c) =>
          c.id === targetChatId
            ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() }
            : c,
        ),
      );
    } catch (error: any) {
      if (error.name === "AbortError" || error.message?.includes("aborted")) {
        // Safe check: if we have generated some content, save it as is
        if (aiText || aiReasoning) {
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: "model",
            parts: [{ text: aiText }],
            text: aiText ? aiText + " *[Generation stopped]*" : "*[Generation stopped]*",
            sources: aiSources,
            reasoning: aiReasoning || undefined,
          };
          setChats((prev) =>
            prev.map((c) =>
              c.id === targetChatId
                ? { ...c, messages: [...c.messages, aiMsg], updatedAt: Date.now() }
                : c,
            ),
          );
        }
        return;
      }

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        parts: [{ text: error.message || String(error) }],
        text: error.message || String(error),
      };
      setChats((prev) =>
        prev.map((c) =>
          c.id === targetChatId
            ? {
                ...c,
                messages: [...c.messages, errorMsg],
                updatedAt: Date.now(),
              }
            : c,
        ),
      );
    } finally {
      setIsLoading(false);
      setStreamText("");
      setStreamReasoning("");
      setStreamSources([]);
      abortControllerRef.current = null;
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleNewChat = () => {
    const newChatId = Date.now().toString();
    setChats((prev) => [
      { id: newChatId, title: "New Chat", messages: [], updatedAt: Date.now() },
      ...prev,
    ]);
    setActiveChatId(newChatId);
    setInput("");
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const confirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteChatId(id);
  };

  const deleteChat = (id: string) => {
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const newId = Date.now().toString();
        setActiveChatId(newId);
        return [
          { id: newId, title: "New Chat", messages: [], updatedAt: Date.now() },
        ];
      }
      if (id === activeChatId) {
        setActiveChatId(remaining[0].id);
      }
      return remaining;
    });
    setDeleteChatId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) {
        sendMessage(e as unknown as React.FormEvent);
      }
    }
  };

  return (
    <div className="flex h-screen bg-pixel-sky text-black font-pixel text-[10px] md:text-xs overflow-hidden leading-relaxed">
      {/* Sidebar Overlay on Mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-pixel-pink border-r-[4px] border-black transform transition-transform duration-200 ease-in-out flex flex-col ${
          isSidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:-translate-x-64 md:hidden"
        }`}
      >
        <div className="p-4 border-b-[4px] border-black pb-4 space-y-2">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 p-3 pb-2 text-[10px] uppercase bg-white hover:bg-yellow-50 pixel-border-sm transition-colors text-black active:translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
          <div className="text-[10px] text-white drop-shadow-[2px_2px_0_rgba(0,0,0,1)] px-1 uppercase tracking-widest font-bold border-b-2 border-black/20 pb-2">
            Chat Logs
          </div>
          <div className="space-y-2">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => {
                  setActiveChatId(chat.id);
                  setInput("");
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                className={`text-[10px] flex items-center justify-between border-[2px] border-black p-3 cursor-pointer uppercase transition-colors ${
                  activeChatId === chat.id
                    ? "bg-yellow-200 shadow-[inset_2px_2px_0_rgba(0,0,0,0.1)] font-bold"
                    : "bg-white hover:bg-yellow-50 shadow-[2px_2px_0_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-[0_0_0_rgba(0,0,0,1)]"
                }`}
              >
                <div className="truncate flex-1 pr-2 leading-relaxed">
                  {chat.title}
                </div>
                <button
                  type="button"
                  onClick={(e) => confirmDelete(e, chat.id)}
                  className="text-black/50 hover:text-red-500 p-1 hover:bg-gray-100 border-[2px] border-transparent hover:border-black bg-transparent shrink-0 transition-colors"
                  title="Delete chat"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative max-w-full">
        {/* Header */}
        <header className="flex items-center justify-between p-3 border-b-[4px] border-black bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-yellow-50 pixel-border-sm bg-white text-black transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-pixel text-[12px] md:text-sm pt-1 uppercase tracking-widest font-bold">
              R97 CHAT
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCallClick}
              className="p-2 hover:bg-yellow-50 pixel-border-sm bg-white text-black transition-colors relative"
              title="Start Call"
            >
              <Phone className="w-5 h-5" />
              {showSoon && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full mt-2 right-0 bg-black text-white px-3 py-1.5 uppercase text-[8px] font-pixel whitespace-nowrap z-50 shadow-[4px_4px_0_rgba(255,105,180,1)] border-2 border-white"
                >
                  Coming Soon!
                </motion.div>
              )}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-yellow-50 pixel-border-sm bg-white text-black transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {isCallOpen && <CallInterface onClose={handleEndCall} />}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto bg-sky-100 bg-pixel-grid p-0">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="mb-8 animate-float">
                <Bot className="w-20 h-20 text-pixel-pink drop-shadow-[4px_4px_0_rgba(0,0,0,1)]" />
              </div>
              <h2 className="text-sm md:text-base text-black mb-6 uppercase tracking-widest drop-shadow-[1px_1px_0_rgba(0,255,255,0.8)]">
                SYSTEM ONLINE
              </h2>
              <p className="text-black max-w-md uppercase leading-loose text-[10px] md:text-xs bg-white pixel-border-sm p-4 relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-200 border-2 border-black px-2 py-0.5 text-[8px]">
                  INFO
                </span>
                Chat with R97 or use the call option above for voice communication.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`w-full py-8 px-4 md:px-8 flex justify-center border-b-[4px] border-black ${
                    msg.role === "model" ? "bg-pixel-sky" : "bg-white"
                  }`}
                >
                  <div className="w-full max-w-3xl flex gap-4 md:gap-6">
                    <div className="flex-shrink-0 mt-1">
                      {msg.role === "user" ? (
                        <div className="w-8 h-8 bg-pixel-pink pixel-border-sm flex items-center justify-center text-white">
                          <User className="w-4 h-4 ml-0.5 mt-0.5" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-white pixel-border-sm flex items-center justify-center text-black">
                          <Bot className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 overflow-x-auto min-w-0">
                      <div className="prose prose-slate max-w-none text-black break-words leading-relaxed font-sans text-sm md:text-base">
                        {msg.role === "model" && msg.reasoning && (
                          <div className="mb-4 border-2 border-dashed border-black/30 bg-slate-50/50 p-3 font-mono text-[11px] leading-relaxed text-black/60 rounded-none">
                            <details className="group" open>
                              <summary className="cursor-pointer select-none font-pixel text-[9px] text-black/75 tracking-wider font-bold uppercase flex items-center justify-between outline-none pb-1 border-b border-black/10 font-sans font-bold">
                                <span className="flex items-center gap-1.5 font-sans font-bold">
                                  🧠 COGNITIVE PROCESS LOG
                                </span>
                                <span className="text-black/45 group-open:hidden font-mono text-[8px]">[SHOWLOG]</span>
                                <span className="text-black/45 hidden group-open:inline font-mono text-[8px]">[HIDELOG]</span>
                              </summary>
                              <div className="mt-2 pl-2 border-l-2 border-black/10 pr-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-black/70 font-mono text-[11px]">
                                {msg.reasoning}
                              </div>
                            </details>
                          </div>
                        )}
                        {msg.text && (msg.text.startsWith("nvidia") || msg.text.startsWith("quota_exceeded:")) ? (
                          <div className="bg-red-50 border-[4px] border-red-500 p-4 shadow-[4px_4px_0_rgba(185,28,28,1)] text-black rounded-none my-2 font-sans">
                            <div className="flex items-center gap-3 border-b-2 border-red-500 pb-2 mb-3">
                              <div className="bg-red-500 text-white p-1.5 pixel-border-sm flex-shrink-0">
                                <Shield className="w-4 h-4" />
                              </div>
                              <span className="font-pixel text-[10px] md:text-xs text-red-700 tracking-widest font-black uppercase">
                                ! SYSTEM DIALOGUE ERROR
                              </span>
                            </div>
                            <p className="font-bold text-xs text-red-900 mb-1.5 uppercase font-sans">
                              {msg.text.startsWith("nvidia_missing") 
                                ? "NVIDIA_API_KEY Missing" 
                                : msg.text.startsWith("nvidia_quota_exceeded") 
                                ? "NVIDIA API Quota Exceeded (429)" 
                                : "NVIDIA API Key Error"}
                            </p>
                            <p className="text-xs text-black leading-relaxed">
                              {msg.text.startsWith("nvidia_missing") 
                                ? "An NVIDIA API Key environment variable is required to authenticate. Please consult deployment environment guides to set up NVIDIA_API_KEY." 
                                : msg.text.startsWith("nvidia_quota_exceeded") 
                                ? "Your configured NVIDIA key has exceeded its API tier quota rate. Please check your developer credits on build.nvidia.com." 
                                : "An invalid key or authorization error occurred during communication. Check your credentials in your build environment."}
                            </p>
                          </div>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({
                                node,
                                inline,
                                className,
                                children,
                                ...props
                              }: any) {
                                const match = /language-(\w+)/.exec(
                                  className || "",
                                );
                                return !inline && match ? (
                                  <CodeBlockViewer
                                    code={String(children).replace(/\n$/, "")}
                                    language={match[1]}
                                  />
                                ) : (
                                  <code
                                    className="bg-gray-200 text-pixel-pink px-1.5 py-0.5 border-2 border-black text-xs md:text-sm font-mono rounded-none"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        )}
                        {(msg.text || "").trim().length > 0 && (
                          <div className="mt-2 flex justify-start items-center gap-2">
                            <CopyButton text={msg.text || ""} />
                            {msg.role === 'model' && !(msg.text || "").startsWith("📞") && (
                              <button
                                onClick={() => speakText(msg.text || "", msg.id)}
                                className="p-1.5 bg-white text-black border border-black hover:bg-black hover:text-white transition-all shadow-[1px_1px_0_rgba(0,0,0,1)]"
                                title="Listen to response"
                              >
                                {playingMessageId === msg.id && !isTtsPaused ? (
                                  <Pause className="w-4 h-4" />
                                ) : (
                                  <Volume2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        )}

                        {msg.role === "model" && msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2.5 border border-dashed border-black/25 bg-slate-50/30 p-1.5">
                            <p className="text-[8px] font-pixel uppercase tracking-wider text-black/40 mb-1 font-bold flex items-center gap-1">
                              📌 SOURCES USED
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {msg.sources.map((source, idx) => {
                                let domain = "";
                                try {
                                  domain = new URL(source.uri).hostname.replace("www.", "");
                                } catch (e) {
                                  domain = "source";
                                }
                                return (
                                  <a
                                    key={idx}
                                    href={source.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={source.title || domain}
                                    className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-yellow-50 hover:bg-yellow-100 hover:text-black border border-black text-black text-[9px] font-mono hover:shadow-[1px_1px_0_black] transition-all hover:-translate-y-px font-medium shrink-0"
                                  >
                                    <span className="w-3.5 h-3.5 bg-black text-white text-[7px] flex items-center justify-center font-pixel font-bold shrink-0 leading-none">
                                      {idx + 1}
                                    </span>
                                    <span className="truncate max-w-[85px] text-[9px]">
                                      {domain}
                                    </span>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="w-full py-8 px-4 md:px-8 flex justify-center bg-pixel-sky border-b-[4px] border-black">
                  <div className="w-full max-w-3xl flex gap-4 md:gap-6">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 bg-white pixel-border-sm flex items-center justify-center text-black">
                        <Bot className="w-5 h-5" />
                      </div>
                    </div>
                    {streamText || streamReasoning ? (
                      <div className="flex-1 overflow-x-auto min-w-0">
                        {streamReasoning && (
                          <div className="mb-4 border-2 border-dashed border-red-500/30 bg-red-50/10 p-3 font-mono text-[11px] leading-relaxed text-red-900/60 rounded-none">
                            <div className="font-pixel text-[9px] text-red-700/80 tracking-wider font-bold uppercase flex items-center gap-1.5 mb-1.5 font-sans font-bold animate-pulse">
                              🧠 THINKING PROCESS IN PROGRESS...
                            </div>
                            <div className="pl-2 border-l-2 border-red-500/20 max-h-40 overflow-y-auto whitespace-pre-wrap pr-1 text-red-900/70 font-mono text-[11.5px]">
                              {streamReasoning}
                            </div>
                          </div>
                        )}
                        {streamText ? (
                          <div className="prose prose-slate max-w-none text-black break-words leading-relaxed font-sans text-sm md:text-base">
                            <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({
                                node,
                                inline,
                                className,
                                children,
                                ...props
                              }: any) {
                                const match = /language-(\w+)/.exec(
                                  className || "",
                                );
                                return !inline && match ? (
                                  <CodeBlockViewer
                                    code={String(children).replace(/\n$/, "")}
                                    language={match[1]}
                                  />
                                ) : (
                                  <code
                                    className="bg-gray-200 text-pixel-pink px-1.5 py-0.5 border-2 border-black text-xs md:text-sm font-mono rounded-none"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              },
                            }}
                          >
                            {streamText + "▍"}
                          </ReactMarkdown>

                          {streamSources && streamSources.length > 0 && (
                            <div className="mt-2.5 border border-dashed border-black/25 bg-slate-50/30 p-1.5">
                              <p className="text-[8px] font-pixel uppercase tracking-wider text-black/40 mb-1 font-bold flex items-center gap-1 animate-pulse">
                                📌 EXTRACTED SOURCES
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {streamSources.map((source, idx) => {
                                  let domain = "";
                                  try {
                                    domain = new URL(source.uri).hostname.replace("www.", "");
                                  } catch (e) {
                                    domain = "source";
                                  }
                                  return (
                                    <a
                                      key={idx}
                                      href={source.uri}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={source.title || domain}
                                      className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-yellow-50 hover:bg-yellow-100 hover:text-black border border-black text-black text-[9px] font-mono hover:shadow-[1px_1px_0_black] transition-all hover:-translate-y-px font-medium shrink-0"
                                    >
                                      <span className="w-3.5 h-3.5 bg-black text-white text-[7px] flex items-center justify-center font-pixel font-bold shrink-0 leading-none">
                                        {idx + 1}
                                      </span>
                                      <span className="truncate max-w-[85px] text-[9px]">
                                        {domain}
                                      </span>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                      <div className="flex items-center gap-1.5 h-8">
                        <span className="uppercase text-black text-[10px] md:text-xs tracking-widest font-bold font-sans pl-2">
                          Typing
                        </span>
                        <div className="flex gap-1 ml-1 items-end h-3">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-2 h-2 bg-black"
                              animate={{
                                y: [0, -4, 0],
                              }}
                              transition={{
                                duration: 0.6,
                                repeat: Infinity,
                                repeatType: "loop",
                                delay: i * 0.15,
                                ease: "easeInOut",
                              }}
                              style={{
                                imageRendering: "pixelated",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="w-full bg-sky-100 pt-4 pb-2 px-4 md:px-8 border-t-[4px] border-black z-20 shrink-0">
          <div className="w-full max-w-3xl mx-auto relative">
            {/* Main Input Form */}
            <form
              onSubmit={sendMessage}
              className="relative pixel-border bg-white outline-none focus-within:outline-none focus-within:bg-yellow-50 transition-colors"
            >
              <div className="flex flex-col">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="TYPE MESSAGE..."
                  className="w-full max-h-48 bg-transparent border-0 focus:outline-none focus:ring-0 outline-none resize-none py-4 px-4 scrollbar-thin text-black placeholder-black/30 font-sans text-sm md:text-base leading-relaxed"
                  style={{ minHeight: "56px", height: "auto" }}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height =
                      Math.min(target.scrollHeight, 200) + "px";
                  }}
                />

                <div className="flex justify-between items-center px-3 pb-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchMode(prev => {
                          if (prev === "disabled") return "compact";
                          if (prev === "compact") return "standard";
                          return "disabled";
                        });
                      }}
                      className="text-black bg-yellow-100 font-bold pixel-border-sm hover:bg-yellow-200 px-3 py-1.5 text-[8px] font-pixel active:translate-y-0.5 transition-all ml-1.5 flex items-center gap-1.5 uppercase tracking-wider shadow-[1px_1px_0_rgba(0,0,0,1)] hover:shadow-none"
                      title="Click to cycle Web Search: Compact ⚡ | Full 🎯 | Off ❌"
                    >
                      <Sparkles className="w-3 h-3 text-yellow-600 shrink-0" />
                      Search: {searchMode === "compact" ? "⚡ COMPACT" : searchMode === "standard" ? "🎯 FULL" : "❌ OFF"}
                    </button>
                  </div>

                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStopGeneration}
                      className="bg-pixel-pink text-white pixel-border-sm hover:bg-pixel-pink-hover active:translate-y-0.5 p-2 md:px-4 flex items-center justify-center shrink-0 uppercase transition-transform mr-1"
                    >
                      <Square className="w-3.5 h-3.5 fill-current md:mr-2 ml-0.5 mt-0.5" />
                      <span className="hidden md:inline pt-1 tracking-widest text-[10px]">
                        Stop
                      </span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className="bg-pixel-pink text-white pixel-border-sm hover:bg-pixel-pink-hover active:translate-y-0.5 disabled:opacity-50 disabled:active:translate-y-0 p-2 md:px-4 flex items-center justify-center shrink-0 uppercase transition-transform mr-1 disabled:cursor-not-allowed"
                    >
                      <Send className="w-4 h-4 md:mr-2 ml-0.5 mt-0.5" />
                      <span className="hidden md:inline pt-1 tracking-widest text-[10px]">
                        Send
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-[4px] border-black max-w-lg w-full shadow-[8px_8px_0_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b-[4px] border-black bg-yellow-200">
              <h2 className="font-pixel text-sm uppercase tracking-widest font-bold flex items-center gap-2 text-black">
                <Settings className="w-5 h-5 text-black" />
                Console Setup & Info
              </h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 hover:bg-white border-2 border-transparent hover:border-black transition-colors"
                title="Close Modal"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto font-sans text-sm pb-8 space-y-6 text-black">
              {/* Developer / Creator Info */}
              <div className="bg-sky-50 border-2 border-black p-4 space-y-3 relative shadow-[3px_3px_0_rgba(0,0,0,1)]">
                <div className="absolute -top-3 left-4 bg-sky-200 border-2 border-black px-2 uppercase text-[10px] font-bold font-pixel tracking-widest text-black">
                  System Creator
                </div>
                <div className="flex items-start gap-4 pt-2">
                  <div className="w-12 h-12 bg-pixel-pink flex flex-shrink-0 items-center justify-center border-2 border-black text-white shadow-[2px_2px_0_black]">
                    <User className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-lg leading-none uppercase tracking-wider text-black">
                      Nayan Patil
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">
                      Lead Developer & Architect
                    </p>
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <a
                        href="https://www.linkedin.com/in/rehan-ahmad-863386382?utm_source=share_via&utm_content=profile&utm_medium=member_android"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-bold hover:underline"
                      >
                        LinkedIn Profile
                      </a>
                      <span className="text-gray-300">|</span>
                      <a
                        href="https://github.com/nayanpatil"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-slate-800 hover:text-black font-bold hover:underline"
                      >
                        GitHub: nayanpatil
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Web Search Mode Options */}
              <div className="bg-yellow-50 border-2 border-black p-4 space-y-3 relative shadow-[3px_3px_0_rgba(0,0,0,1)]">
                <div className="absolute -top-3 left-4 bg-yellow-200 border-2 border-black px-2 uppercase text-[10px] font-bold font-pixel tracking-widest text-black">
                  Search Engine Opt
                </div>
                <p className="text-[11px] text-gray-700 leading-relaxed pt-2">
                  Fine-tune the web integration bounds. Premium <strong className="text-black">Compact Mode</strong> extracts exact page summaries to save latency and preserve query precision.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1 font-pixel text-[9px]">
                  <button
                    type="button"
                    onClick={() => setSearchMode("disabled")}
                    className={`p-2 border-2 border-black transition-all font-bold ${
                      searchMode === "disabled"
                        ? "bg-black text-white"
                        : "bg-white text-black hover:bg-gray-100"
                    }`}
                  >
                    NO SEARCH
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("compact")}
                    className={`p-2 border-2 border-black transition-all font-bold ${
                      searchMode === "compact"
                        ? "bg-black text-white"
                        : "bg-white text-black hover:bg-gray-100"
                    }`}
                  >
                    COMPACT
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("standard")}
                    className={`p-2 border-2 border-black transition-all font-bold ${
                      searchMode === "standard"
                        ? "bg-black text-white"
                        : "bg-white text-black hover:bg-gray-100"
                    }`}
                  >
                    STANDARD
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteChatId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-[4px] border-black max-w-sm w-full shadow-[8px_8px_0_rgba(0,0,0,1)] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b-[4px] border-black bg-red-200">
              <h2 className="font-pixel text-sm uppercase tracking-widest font-bold flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Confirm Deletion
              </h2>
              <button
                onClick={() => setDeleteChatId(null)}
                className="p-1 hover:bg-white border-2 border-transparent hover:border-black transition-colors"
                title="Close Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 font-sans text-sm pb-8 space-y-6">
              <p className="text-black text-center font-bold">
                Are you sure you want to delete this chat log?
              </p>

              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setDeleteChatId(null)}
                  className="px-6 py-2 border-2 border-black font-bold uppercase text-xs hover:bg-gray-200 active:translate-y-0.5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteChat(deleteChatId)}
                  className="px-6 py-2 bg-red-500 text-white font-bold uppercase text-xs border-2 border-black hover:bg-red-600 shadow-[4px_4px_0_black] active:translate-y-0.5 active:shadow-[0_0_0_black]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
