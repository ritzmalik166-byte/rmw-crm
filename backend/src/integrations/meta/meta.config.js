import { env } from '../../config/env.js';

export const PROVIDER = 'META';

/**
 * Permissions requested at OAuth. Each is needed for one part of the integration:
 *  pages_show_list, pages_read_engagement  list the Pages the user manages
 *  pages_manage_metadata                   subscribe the Page to the app's leadgen webhook
 *  pages_manage_ads, leads_retrieval       read Lead Ads forms and lead data
 *  ads_read                                campaign / ad set / ad names and spend (cost per lead)
 *  business_management                     list Business Manager accounts
 *  instagram_basic                         show the Instagram account linked to the Page
 */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'ads_read',
  'business_management',
  'instagram_basic',
];

/** Without these the integration cannot receive leads at all. */
export const REQUIRED_SCOPES = ['pages_show_list', 'pages_manage_metadata', 'leads_retrieval'];

export function missingConfig() {
  const missing = [];
  if (!env.META_APP_ID) missing.push('META_APP_ID');
  if (!env.META_APP_SECRET) missing.push('META_APP_SECRET');
  if (!env.META_REDIRECT_URI) missing.push('META_REDIRECT_URI');
  return missing;
}

export const isMetaConfigured = () => missingConfig().length === 0;
export const isWebhookConfigured = () => Boolean(env.META_WEBHOOK_VERIFY_TOKEN && env.META_APP_SECRET);

export const graphVersion = () => env.META_API_VERSION;
