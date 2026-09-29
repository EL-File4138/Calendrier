export function parsePublicLink(hash: string): { publicId: string; token: string } | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('public');
  const match = value?.match(/^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/);
  return match ? { publicId: match[1], token: match[2] } : null;
}

export function publicLinkUrl(publicId: string, token: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  // Fragments are not sent to the static host or included in HTTP referrers.
  url.hash = `public=${publicId}.${token}`;
  return url.href;
}
