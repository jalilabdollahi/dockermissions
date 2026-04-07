import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

export function Terminal({ wsUrl, mode }: { wsUrl: string; mode?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerminal({
      cursorBlink: true,
      cursorStyle: "bar",
      theme: {
        background:  "#010409",
        foreground:  "#e6edf3",
        cursor:      "#3fb950",
        cursorAccent:"#010409",
        selectionBackground: "rgba(63,185,80,0.25)",
        black:       "#484f58",
        red:         "#f85149",
        green:       "#3fb950",
        yellow:      "#d29922",
        blue:        "#58a6ff",
        magenta:     "#bc8cff",
        cyan:        "#39c5cf",
        white:       "#b1bac4",
        brightBlack: "#6e7681",
        brightRed:   "#ff7b72",
        brightGreen: "#56d364",
        brightYellow:"#e3b341",
        brightBlue:  "#79c0ff",
        brightMagenta:"#d2a8ff",
        brightCyan:  "#56d4dd",
        brightWhite: "#f0f6fc",
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      letterSpacing: 0.3,
      scrollback: 2000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);
    fitAddon.fit();

    const wheelHandler = (event: WheelEvent) => {
      if (!container.contains(event.target as Node)) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY === 0 ? 0 : event.deltaY > 0 ? 3 : -3;
      term.scrollLines(delta);
    };
    container.addEventListener("wheel", wheelHandler, { passive: false });

    const { cols, rows } = term;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}${wsUrl}&cols=${cols}&rows=${rows}`);

    socket.onmessage = (event) => term.write(event.data as string);
    socket.onopen = () => term.focus();
    socket.onclose = () => term.write("\r\n\x1b[31m[session closed]\x1b[0m\r\n");

    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });

    term.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("wheel", wheelHandler);
      resizeObserver.disconnect();
      socket.close();
      term.dispose();
    };
  }, [wsUrl]);

  return (
    <div className="terminal-panel">
      <div className="terminal-topbar">
        <div className="terminal-topbar-left">
          <div className="terminal-dots">
            <div className="terminal-dot red" />
            <div className="terminal-dot yellow" />
            <div className="terminal-dot green" />
          </div>
          <span className="terminal-title">bash — dockermissions sandbox</span>
        </div>
        <div className="terminal-status">
          <div className="status-dot" />
          {mode === "docker-host" ? "Docker ready" : "Shell mode"}
        </div>
      </div>
      <div className="terminal-shell" ref={containerRef} />
    </div>
  );
}
