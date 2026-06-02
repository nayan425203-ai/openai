# R97 Voice AI Assistant

![R97 Voice AI](https://img.shields.io/badge/Status-Live-success?style=for-the-badge)
![NVIDIA Llama 3.1](https://img.shields.io/badge/AI-NVIDIA%20Llama%203.1-blue?style=for-the-badge)
![Gemini Live](https://img.shields.io/badge/Voice-Gemini%20Flash%20Live-orange?style=for-the-badge)

**R97 Voice AI** is a cutting-edge, full-stack AI assistant designed to provide deep, detailed, and emotionally resonant interactions. Built with a focus on natural communication, it seamlessly handles text and voice across multiple languages, including English, Hindi, and Hinglish.

---

## 🚀 Key Features

### 🧠 Dual-LLM Architecture
- **Text/Chat**: Powered by **NVIDIA's Llama 3.1 (8B/70B/405B)** API for highly detailed and comprehensive answers.
- **Voice Interaction**: Leverages **Gemini 1.5 Flash Live** for real-time, low-latency emotional voice communication.

### 🗣️ Native Multilingual Support
- **Full Continuity**: The AI detects and responds in the **exact same language and style** used by the user.
- **Hinglish Excellence**: Specifically optimized to recognize and reply in "Hinglish" (mixed Hindi/English), maintaining a natural conversational flow.
- **TTS (Text-to-Speech)**: Integrated browser-level TTS that automatically adapts its voice and speed based on the detected language.

### 🎭 Emotional Intelligence
- **Mirroring**: The assistant mirrors user emotions — empathetic when you're sad, enthusiastic when you're happy.
- **Tone Control**: Adapts its style from witty and humorous to formal and professional based on the conversation's context.

### 🛡️ Privacy & Professionalism
- **Smart Filtering**: In voice/TTS modes, the AI automatically skips reading URLs, technical code blocks, and system session logs to preserve conversational dignity.
- **Detailed Responses**: Strictly obeys the "Deep Detail" rule, providing thorough explanations for every query.

---

## 🛠️ Tech Stack

- **Frontend**: React 18+, Vite, Tailwind CSS, Framer Motion (animations).
- **Backend**: Node.js (Express), CommonJS bundling with ⚡ esbuild.
- **Voice Engine**: Gemini Multimodal Live API.
- **Language Models**: NVIDIA NIM (Meta Llama 3.1).
- **Icons**: Lucide React.
- **Styling**: Custom Pixel-art / Minimalist UI components.

---

## 👨‍💻 Creator

**R97** was developed by **Nayan Patil**.
- **GitHub**: [nayanpatil](https://github.com/nayanpatil)
- **Instagram**: [nayan_patil_4747](https://instagram.com/nayan_patil_4747)

---

## ⚙️ Configuration & Deployment

### Environment Variables
To run this project locally or in production, you must set the following keys:
```env
NVIDIA_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
```

### Vercel Deployment
The project is optimized for Vercel with a `vercel.json` configuration that handles the Express backend and React frontend routing.

---

## 📝 Roadmap
- [ ] **Voice Calls**: Currently under development ("Coming Soon").
- [ ] **Enhanced Memory**: Persistent long-term memory for user preferences.
- [ ] **Multi-character Personas**: Switch between different AI personality modes.

---

Copyright © 2026 Nayan Patil. All Rights Reserved.
