import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { actioPost } from "@/lib/api";

export const Route = createFileRoute("/tad")({ component: TadPage });

function TadPage() {
  const [body, setBody] = useState(
    JSON.stringify(
      {
        feedId: "arroyo",
        name: "",
        phone: "",
        email: "",
        originStopId: "",
        destinationStopId: "",
        date: new Date().toISOString().slice(0, 10),
        time: "08:00",
        passengers: 1,
        comments: "",
      },
      null,
      2,
    ),
  );
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setStatus(null);
    try {
      const parsed = JSON.parse(body);
      const r = await actioPost("transportation-request/send", parsed);
      setStatus({ ok: true, msg: typeof r === "string" ? r : JSON.stringify(r, null, 2) });
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Petición TAD</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        POST /bff/mobile/transportation-request/send
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Solicitud de Transporte a Demanda. Edita el JSON y envíalo. La estructura exacta
        de campos puede variar; ajusta según necesites.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={16}
        className="mt-4 w-full rounded-md border border-border bg-card p-3 font-mono text-xs"
      />
      <button
        onClick={submit}
        disabled={busy}
        className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Enviando…" : "Enviar petición"}
      </button>
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