import { supabase } from "@/integrations/supabase/client";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/actio`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function actioGet<T = unknown>(path: string, extra?: Record<string, string>): Promise<T> {
  const u = new URL(BASE);
  u.searchParams.set("path", path);
  if (extra) for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export async function actioPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const u = new URL(BASE);
  u.searchParams.set("path", path);
  const r = await fetch(u.toString(), {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!r.ok) throw new Error(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
  return parsed as T;
}

// avoid unused import warning if tree-shaking misbehaves
export const _s = supabase;