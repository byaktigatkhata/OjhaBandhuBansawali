// SupabaseConfig.js
const SUPABASE_URL = 'https://icchczijubhzxkjpebps.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljY2hjemlqdWJoenhranBlYnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDI1MjEsImV4cCI6MjEwMDQ3ODUyMX0.8Q-610HCGfdeIH-I18ZyJthTF5fYq2YBFD-d5-F39ZA';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.SupabaseConfig = {supabase: supabaseClient, SUPABASE_URL: SUPABASE_URL, SUPABASE_ANON_KEY: SUPABASE_ANON_KEY};
