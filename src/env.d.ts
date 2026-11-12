// Build-time settings from .env.local (see .env.example). Both are public by
// design: Supabase's row-level security, not secrecy, protects the data.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}
