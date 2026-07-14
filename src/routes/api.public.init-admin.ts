import { createFileRoute } from "@tanstack/react-router";

const EMAIL = "hola@arroyobus.net";
const PASSWORD = "its._.mateito11";

export const Route = createFileRoute("/api/public/init-admin")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const existing = list?.users?.find((u) => u.email === EMAIL);
        if (existing) {
          await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password: PASSWORD,
            email_confirm: true,
          });
          return Response.json({ ok: true, updated: true, id: existing.id });
        }
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: EMAIL,
          password: PASSWORD,
          email_confirm: true,
        });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true, created: true, id: data.user?.id });
      },
    },
  },
});
