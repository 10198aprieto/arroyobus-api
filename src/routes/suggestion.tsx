import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { actioPost } from "@/lib/api";

export const Route = createFileRoute("/suggestion")({ component: SuggestionPage });

function SuggestionPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const r = await actioPost("v1.1/send-suggestion", {
        feedId: "arroyo",
        name,
        email,
        subject,
        message,
      });
      setStatus({ ok: true, msg: typeof r === "string" ? r : JSON.stringify(r, null, 2) });
    } catch (err) {
      setStatus({ ok: false, msg: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Sugerencias</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        POST /bff/mobile/v1.1/send-suggestion
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Asunto"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mensaje"
          rows={6}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Enviar sugerencia"}
        </button>
      </form>
      {status && (
        <pre
          className={`mt-4 overflow-auto rounded-lg border p-4 text-xs ${
            status.ok ? "border-border bg-card" : "border-destructive bg-destructive/10"
          }`}
        >
          {status.msg}
        </pre>
      )}
    </div>
  );
}