import routeAliasesRaw from '../data/route-aliases.json';

const routeAliases = routeAliasesRaw as Record<string, string>;
const routeAliasMap = new Map<string, string>(Object.entries(routeAliases));

type NormalizeRoutePathOptions = {
  canonicalize?: boolean;
};

export const routeAliasEntries = Object.entries(routeAliases) as [string, string][];

export function canonicalizeAliasPath(route: string): string {
  return routeAliasMap.get(route) ?? route;
}

export function normalizeRoutePath(
  inputPath: string,
  options: NormalizeRoutePathOptions = {}
): string {
  const { canonicalize = true } = options;
  const raw = String(inputPath || '')
    .replace(/https?:\/\/blog\.hichee\.com/i, '')
    .replace(/%ef%bf%bc/gi, '')
    .replace(/\uFFFC/g, '')
    .trim();

  if (!raw) return '/';

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const normalized = withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
  return canonicalize ? canonicalizeAliasPath(normalized) : normalized;
}
