"use client";

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';

export type MascotState = "idle" | "working" | "loading" | "success" | "error" | "sleeping";

interface MascotContextType {
  mascotState: MascotState;
  setMascotState: (state: MascotState) => void;
  say: (message: string, duration?: number) => void;
}

export const MascotContext = createContext<MascotContextType>({
  mascotState: "idle",
  setMascotState: () => {},
  say: () => {}
});

export const useMascot = () => useContext(MascotContext);

export const MascotProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<MascotState>("idle");
  const [message, setMessage] = useState<string>("");
  const messageTimeout = useRef<any>(null);

  const say = (msg: string, duration = 4000) => {
    setMessage(msg);
    if (messageTimeout.current) clearTimeout(messageTimeout.current);
    messageTimeout.current = setTimeout(() => {
      setMessage("");
    }, duration);
  };

  // Trạng thái ngủ gật nếu không có tương tác
  useEffect(() => {
    let idleTimer: any;
    const resetIdle = () => {
      if (state === "sleeping") setState("idle");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setState(prev => (prev === "idle" || prev === "sleeping" ? "sleeping" : prev));
      }, 45000); // Ngủ sau 45s không làm gì
    };

    window.addEventListener("mousemove", resetIdle);
    window.addEventListener("keypress", resetIdle);
    resetIdle();
    
    return () => {
      window.removeEventListener("mousemove", resetIdle);
      window.removeEventListener("keypress", resetIdle);
      clearTimeout(idleTimer);
    };
  }, [state]);

  return (
    <MascotContext.Provider value={{ mascotState: state, setMascotState: setState, say }}>
      {children}
      <Mascot state={state} message={message} say={say} setMascotState={setState} />
    </MascotContext.Provider>
  );
};

const Mascot = ({ state, message, say, setMascotState }: any) => {
  // Logic kéo thả (Drag & Drop)
  const [position, setPosition] = useState<{x: number, y: number} | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    
    // Nếu chưa từng kéo, tính toán tọa độ ban đầu từ offsetLeft/offsetTop của DOM element
    let currentX = position?.x;
    let currentY = position?.y;
    if (currentX === undefined || currentY === undefined) {
      const el = e.currentTarget as HTMLElement;
      currentX = el.getBoundingClientRect().left;
      currentY = el.getBoundingClientRect().top;
      setPosition({ x: currentX, y: currentY });
    }

    dragRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: currentX,
      initialY: currentY
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const dx = clientX - dragRef.current.startX;
      const dy = clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 80, dragRef.current.initialX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 80, dragRef.current.initialY + dy))
      });
    };
    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, position]);


  const getEmojiAndAnimation = () => {
    switch (state) {
      case "loading": return { emoji: "⏳", animation: "mascot-bounce" };
      case "success": return { emoji: "🎉", animation: "scale-125 mascot-wiggle" };
      case "error": return { emoji: "😿", animation: "mascot-wiggle" };
      case "working": return { emoji: "📝", animation: "mascot-float" };
      case "sleeping": return { emoji: "💤", animation: "mascot-float opacity-80" };
      case "idle": 
      default: return { emoji: "🐱", animation: "mascot-float hover:-translate-y-2 transition-transform" };
    }
  };

  const { emoji, animation } = getEmojiAndAnimation();

  // Các câu thoại ngẫu nhiên khi click
  const randomQuotes = [
    "Meow! Sếp gọi em à? Trả lương thêm hạt nhé!",
    "Chốt đơn chưa sếp ơi?",
    "Em đang canh kho hàng nè!",
    "Đừng chọc em nữa, lo duyệt PO đi!",
    "Sếp vất vả rồi, cố lên nha!"
  ];

  return (
    <div 
      className={`fixed z-[9999] cursor-grab active:cursor-grabbing flex flex-col items-center select-none ${isDragging ? "transition-none" : "transition-all duration-300"}`}
      style={position ? { left: position.x, top: position.y, touchAction: "none" } : { bottom: "40px", right: "40px", touchAction: "none" }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleMouseDown}
      onClick={() => {
        if (!isDragging) {
           const randomQuote = randomQuotes[Math.floor(Math.random() * randomQuotes.length)];
           say(randomQuote);
           setMascotState("success");
           setTimeout(() => setMascotState("idle"), 2000);
        }
      }}
    >
      {message && (
        <div className="bg-white text-gray-800 px-4 py-2 rounded-2xl shadow-lg border-2 border-orange-200 mb-2 relative max-w-[200px] text-center text-sm font-bold animate-fade-in-up">
          {message}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-orange-200"></div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-white"></div>
        </div>
      )}
      <div 
        className={`text-6xl drop-shadow-xl ${animation}`}
        style={{ filter: "drop-shadow(0 10px 8px rgb(0 0 0 / 0.15))" }}
      >
        {emoji}
      </div>
    </div>
  );
};
