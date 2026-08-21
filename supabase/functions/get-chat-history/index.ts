import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === 'rpmariano@gmail.com');
  if (!user) return new Response('User not found', { status: 404 });

  const { data: messages } = await supabase
    .from('coach_messages')
    .select('*')
    .eq('user_id', user.id)
    .gte('created_at', '2026-08-20T00:00:00Z')
    .lt('created_at', '2026-08-21T00:00:00Z')
    .order('created_at', { ascending: true });

  return new Response(JSON.stringify(messages), {
    headers: { 'Content-Type': 'application/json' }
  });
});
