import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://roxfzsiciizkevopgpnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveGZ6c2ljaWl6a2V2b3BncG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjg0NDksImV4cCI6MjA5ODg0NDQ0OX0.bS7FyzDIqj4Aov18OXw6SsJrx1hT1DxYQfzmeHHH7bw';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: users, error: err } = await supabase.from('profiles').select('id, email').eq('email', 'rpmariano@gmail.com');
  if (err || !users || users.length === 0) { console.error('User not found', err); return; }
  const userId = users[0].id;

  const { data: msgs, error: msgErr } = await supabase
    .from('coach_messages')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', '2026-08-20T00:00:00Z')
    .lt('created_at', '2026-08-21T00:00:00Z')
    .order('created_at', { ascending: true });
    
  if (msgErr) { console.error('Error fetching msgs:', msgErr); return; }
  
  for (const msg of msgs) {
    console.log('[' + msg.created_at + '] ' + msg.role + ':');
    console.log(msg.content);
    console.log('-----');
  }
}
run();

