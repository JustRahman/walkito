/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly FUNNEL_SUPABASE_URL?: string;
  readonly FUNNEL_SUPABASE_ANON_KEY?: string;
  readonly FUNNEL_POSTHOG_KEY?: string;
  readonly FUNNEL_POSTHOG_HOST?: string;
  readonly FUNNEL_RC_KEY?: string;
  readonly FUNNEL_PIXEL_ID?: string;
  readonly FUNNEL_GOOGLE_CLIENT_ID?: string;
  readonly FUNNEL_SUPPORT_EMAIL?: string;
  readonly FUNNEL_POSTAL_ADDRESS?: string;
  /** "1" builds a preview with Rahim's placeholder texts. Never set for walkito.site/go. */
  readonly FUNNEL_PREVIEW?: string;
}
