// IronHealth · assistant-read Edge Function — a lógica e o porquê estão em
// handler.ts; aqui só se liga o cliente da service role.
// verify_jwt = false em supabase/config.toml: a autenticação é o token ih_….

import { createClient } from "jsr:@supabase/supabase-js@2";
import { handler } from "./handler.ts";

Deno.serve((req) =>
  handler(req, {
    db: () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
    now: () => new Date(),
  })
);
