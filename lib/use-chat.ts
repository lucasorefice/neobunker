"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/schema";

type Status = "connecting" | "open" | "offline" | "closed";

export function useChat(name: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>("connecting");
  const [nickname, setNickname] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setNickname(localStorage.getItem("nb:nick") ?? "");
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/chat?name=${encodeURIComponent(name)}`);
    wsRef.current = ws;
    setStatus("connecting");
    ws.onopen = () => setStatus("open");
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "offline") setStatus("offline");
      else if (data.type === "msg") setMessages((prev) => [...prev, data.message]);
    };
    return () => ws.close();
  }, [name]);

  const setNick = useCallback((n: string) => {
    setNickname(n);
    localStorage.setItem("nb:nick", n);
  }, []);

  const send = useCallback(
    (body: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== ws.OPEN || !nickname.trim() || !body.trim()) return;
      ws.send(JSON.stringify({ body, displayName: nickname }));
    },
    [nickname],
  );

  return { messages, status, send, nickname, setNickname: setNick };
}
