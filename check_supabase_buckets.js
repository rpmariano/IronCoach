const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://roxfzsiciizkevopgpnl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJveGZ6c2ljaWl6a2V2b3BncG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjg0NDksImV4cCI6MjA5ODg0NDQ0OX0.bS7FyzDIqj4Aov18OXw6SsJrx1hT1DxYQfzmeHHH7bw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkBuckets() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  console.log('Buckets:', buckets, 'Error:', error);
}

checkBuckets();
