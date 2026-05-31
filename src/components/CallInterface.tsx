import React, { useState, useEffect, useRef } from "react";
import { Phone, X, Mic, MicOff } from "lucide-react";

export const CallInterface = ({ onClose }: { onClose: (durationSec: number) => void }) => {
  const [status, setStatus] = useState("Connecting...");
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const nextStartTimeRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s.toString().padStart(2, "0")}`;
  };

  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const startCall = async () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        wsRef.current = new WebSocket(`${protocol}//${location.host}`);
        
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        if (audioCtxRef.current.state === "suspended") {
          await audioCtxRef.current.resume();
        }
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const source = audioCtxRef.current.createMediaStreamSource(streamRef.current);
        const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
        
        source.connect(processor);
        processor.connect(audioCtxRef.current.destination);
        
        processor.onaudioprocess = (e) => {
          if (!isMutedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            const buffer = e.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(buffer.length);
            for (let i = 0; i < buffer.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, buffer[i])) * 0x7FFF;
            }
            wsRef.current.send(JSON.stringify({ audio: btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer))) }));
          }
        };

        wsRef.current.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.audio) {
                const audioData = Uint8Array.from(atob(msg.audio), c => c.charCodeAt(0));
                const float32 = new Float32Array(audioData.length / 2);
                const dataView = new DataView(audioData.buffer);
                for (let i = 0; i < float32.length; i++) {
                    float32[i] = dataView.getInt16(i * 2, true) / 32768;
                }
                
                const buffer = audioCtxRef.current!.createBuffer(1, float32.length, 16000);
                buffer.copyToChannel(float32, 0);
                const source = audioCtxRef.current!.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtxRef.current!.destination);
                
                const startTime = Math.max(audioCtxRef.current!.currentTime, nextStartTimeRef.current);
                source.start(startTime);
                nextStartTimeRef.current = startTime + buffer.duration;
            }
            if (msg.interrupted) { 
                setStatus("Interrupted");
                nextStartTimeRef.current = audioCtxRef.current!.currentTime;
            }
        };

        wsRef.current.onopen = () => setStatus("Connected");
        wsRef.current.onclose = () => setStatus("Disconnected");
        wsRef.current.onerror = (err) => setStatus("WS Error");

      } catch (e) {
        console.error(e);
        setStatus("Error: " + e);
      }
    };
    
    startCall();
    
    return () => {
      wsRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const handleEndCall = () => {
    const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    onClose(finalDuration);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-pixel-sky pixel-border-sm p-6 flex flex-col items-center gap-4 text-center">
        <h2 className="text-xl font-bold font-pixel uppercase">{status}</h2>
        <div className="text-sm font-mono bg-white/20 px-3 py-1 rounded">
          TIME: {formatDuration(duration)}
        </div>
        <div className="flex gap-4">
            <button onClick={() => setIsMuted(!isMuted)} className="p-4 bg-white border-2 border-black shadow-[2px_2px_0_black] active:translate-y-0.5 active:shadow-none transition-all">
                {isMuted ? <MicOff /> : <Mic />}
            </button>
            <button onClick={handleEndCall} className="p-4 bg-pixel-pink text-white border-2 border-black shadow-[2px_2px_0_black] active:translate-y-0.5 active:shadow-none transition-all">
                <X />
            </button>
        </div>
      </div>
    </div>
  );
};
