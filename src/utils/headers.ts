/**
 * Typed header parsing and content negotiation utilities.
 */

export interface ParsedContentType {
  type: string;
  subtype: string;
  parameters: Record<string, string>;
  full: string;
}

export interface ParsedAccept {
  type: string;
  subtype: string;
  quality: number;
  parameters: Record<string, string>;
}

/** Parse a Content-Type header into its components. */
export function parseContentType(header: string): ParsedContentType {
  const [mediaType, ...paramParts] = header.split(';').map((s) => s.trim());
  const [type, subtype] = mediaType.split('/');

  const parameters: Record<string, string> = {};
  for (const param of paramParts) {
    const [key, value] = param.split('=').map((s) => s.trim());
    if (key && value) {
      parameters[key.toLowerCase()] = value.replace(/^"|"$/g, '');
    }
  }

  return { type: type ?? '', subtype: subtype ?? '', parameters, full: mediaType };
}

/** Parse an Accept header into a sorted list of preferences. */
export function parseAccept(header: string): ParsedAccept[] {
  if (!header) return [];

  return header
    .split(',')
    .map((part) => {
      const [mediaType, ...paramParts] = part.trim().split(';').map((s) => s.trim());
      const [type, subtype] = mediaType.split('/');

      let quality = 1.0;
      const parameters: Record<string, string> = {};

      for (const param of paramParts) {
        const [key, value] = param.split('=').map((s) => s.trim());
        if (key === 'q') {
          quality = parseFloat(value) || 1.0;
        } else if (key && value) {
          parameters[key] = value;
        }
      }

      return { type: type ?? '*', subtype: subtype ?? '*', quality, parameters };
    })
    .sort((a, b) => {
      if (b.quality !== a.quality) return b.quality - a.quality;
      // more specific types win over wildcards
      const aSpecificity = (a.type === '*' ? 0 : 1) + (a.subtype === '*' ? 0 : 1);
      const bSpecificity = (b.type === '*' ? 0 : 1) + (b.subtype === '*' ? 0 : 1);
      return bSpecificity - aSpecificity;
    });
}

/**
 * Content negotiation: given an Accept header and a list of
 * available content types, return the best match.
 */
export function negotiate(acceptHeader: string, available: string[]): string | null {
  const preferences = parseAccept(acceptHeader);
  if (preferences.length === 0) return available[0] ?? null;

  for (const pref of preferences) {
    for (const contentType of available) {
      const [type, subtype] = contentType.split('/');
      const typeMatch = pref.type === '*' || pref.type === type;
      const subtypeMatch = pref.subtype === '*' || pref.subtype === subtype;
      if (typeMatch && subtypeMatch) return contentType;
    }
  }

  return null;
}

/** Build a standard set of response headers. */
export function buildResponseHeaders(options?: {
  contentType?: string;
  cacheControl?: string;
  cors?: Record<string, string>;
}): Record<string, string> {
  const headers: Record<string, string> = {};

  headers['Content-Type'] = options?.contentType ?? 'application/json; charset=utf-8';

  if (options?.cacheControl) {
    headers['Cache-Control'] = options.cacheControl;
  } else {
    headers['Cache-Control'] = 'no-store';
  }

  headers['X-Content-Type-Options'] = 'nosniff';

  if (options?.cors) {
    for (const [key, value] of Object.entries(options.cors)) {
      headers[key] = value;
    }
  }

  return headers;
}

/** Extract the charset from a Content-Type header, defaulting to utf-8. */
export function getCharset(contentTypeHeader: string): string {
  const parsed = parseContentType(contentTypeHeader);
  return parsed.parameters['charset'] ?? 'utf-8';
}

/** Check if a Content-Type is JSON-like. */
export function isJsonContentType(contentType: string): boolean {
  const parsed = parseContentType(contentType);
  return (
    parsed.full === 'application/json' ||
    parsed.subtype === 'json' ||
    parsed.subtype.endsWith('+json')
  );
}
