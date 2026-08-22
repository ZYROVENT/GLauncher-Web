// Configuración centralizada de Supabase para GLauncher
const SUPABASE_URL = 'https://ouqpeojilykkrmatijxp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXBlb2ppbHlra3JtYXRpanhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5OTc3NjgsImV4cCI6MjA4NTU3Mzc2OH0.cI5AV0N-F1B2tqvBUKgOz0T2XCF3i56K23spLb3sHHY';

// Inicializar el cliente (Asegúrate de incluir el script de Supabase en tu HTML)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.glauncherSupabase = supabaseClient;