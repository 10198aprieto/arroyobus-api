import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { actiosaeUnlocked?: boolean };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "actiosae-gate",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function matches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const getActiosaeGateStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useSession<GateSession>(sessionConfig());
    return { unlocked: session.data.actiosaeUnlocked === true };
  },
);

export const unlockActiosae = createServerFn({ method: "POST" })
  .inputValidator((data: { user: string; password: string }) => data)
  .handler(async ({ data }) => {
    const expectedUser = process.env["ACTIOSAE_GATE_USER"];
    const expectedPassword = process.env["ACTIOSAE_GATE_PASSWORD"];
    if (!expectedUser || !expectedPassword) {
      throw new Error("Gate credentials are not configured");
    }
    if (
      !matches(data.user, expectedUser) ||
      !matches(data.password, expectedPassword)
    ) {
      return { ok: false as const };
    }
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ actiosaeUnlocked: true });
    return { ok: true as const };
  });

export const lockActiosae = createServerFn({ method: "POST" }).handler(
  async () => {
    const session = await useSession<GateSession>(sessionConfig());
    await session.clear();
    return { ok: true as const };
  },
);