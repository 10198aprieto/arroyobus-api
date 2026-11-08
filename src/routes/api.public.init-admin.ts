import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/init-admin")({
  server: {
    handlers: {
      // Retired bootstrap endpoint: public callers must never reset admin credentials.
      GET: async () => new Response("Gone", { status: 410 }),
    },
  },
});
