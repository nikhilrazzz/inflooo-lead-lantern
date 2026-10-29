import { createFileRoute } from '@tanstack/react-router';

/** Public landing page only relays a one-time code. No credentials or private reads. */
export const Route = createFileRoute('/api/public/oauth/google-calendar/return')({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const success = url.searchParams.get('success') === 'true';
    const code = url.searchParams.get('code');
    const result = {
      type: success ? 'appUserConnectorOAuthComplete' : 'appUserConnectorOAuthFailed',
      connectorId: url.searchParams.get('connector_id'),
      code: success ? code : null,
    };
    const json = JSON.stringify(result).replace(/</g, '\\u003c');
    return new Response(`<!doctype html><html><head><title>Google Calendar — SaleUp</title><meta name="referrer" content="no-referrer"></head><body><p>${success ? 'Finishing Google Calendar connection…' : 'Google Calendar connection failed. Please try again.'}</p><script>if(window.opener){window.opener.postMessage(${json},window.location.origin);window.close();}</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } } },
});