import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  // Check if the key is a service role key (starts with 'service_role')
  // This is a common mistake that causes the 'Forbidden use of secret API key in browser' error.
  if (supabaseAnonKey.startsWith('service_role')) {
    console.error('ERRO CRÍTICO: Você está usando a "service_role key" no navegador. Isso é proibido por segurança.');
    console.error('Por favor, vá em Settings e substitua NEXT_PUBLIC_SUPABASE_ANON_KEY pela sua "anon public key".');
    return null;
  }

  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    return null;
  }
};

// For backward compatibility, we use a Proxy to ensure 'supabase' is never null 
// but throws a helpful error only when accessed if config is missing.
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop) => {
    const instance = getSupabase();
    if (!instance) {
      console.warn('Supabase instance is not initialized. Check your environment variables.');
      // Return a dummy object to prevent immediate crashes on property access
      return ({} as any)[prop];
    }
    return (instance as any)[prop];
  }
});
