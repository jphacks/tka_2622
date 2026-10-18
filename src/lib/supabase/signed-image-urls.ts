export interface SignedImageUrlResult {
  path: string | null;
  signedUrl: string | null;
  error: string | null;
}

export type SignedImageUrlMapResult =
  | { success: true; urlsByPath: Map<string, string> }
  | { success: false; reason: string };

export interface AvailableSignedImageUrlMap {
  urlsByPath: Map<string, string>;
  unavailableCount: number;
  invalidResultCount: number;
}

export function mapSignedImageUrls(
  requestedPaths: string[],
  results: SignedImageUrlResult[],
): SignedImageUrlMapResult {
  if (requestedPaths.length === 0) {
    return results.length === 0
      ? { success: true, urlsByPath: new Map() }
      : { success: false, reason: "UNEXPECTED_SIGNED_URLS" };
  }

  const requestedPathSet = new Set(requestedPaths);
  if (requestedPathSet.size !== requestedPaths.length) {
    return { success: false, reason: "DUPLICATE_REQUESTED_PATHS" };
  }

  const urlsByPath = new Map<string, string>();
  for (const result of results) {
    if (
      !result.path ||
      !requestedPathSet.has(result.path) ||
      !result.signedUrl ||
      result.error ||
      urlsByPath.has(result.path)
    ) {
      return {
        success: false,
        reason: result.error ?? "INVALID_SIGNED_URL_RESULT",
      };
    }
    urlsByPath.set(result.path, result.signedUrl);
  }

  if (requestedPaths.some((path) => !urlsByPath.has(path))) {
    return { success: false, reason: "SIGNED_URL_MISSING" };
  }

  return { success: true, urlsByPath };
}

export function mapAvailableSignedImageUrls(
  requestedPaths: string[],
  results: SignedImageUrlResult[],
): AvailableSignedImageUrlMap | null {
  const requestedPathSet = new Set(requestedPaths);
  if (requestedPathSet.size !== requestedPaths.length) return null;

  const urlsByPath = new Map<string, string>();
  const seenPaths = new Set<string>();
  const duplicatePaths = new Set<string>();
  let invalidResultCount = 0;

  for (const result of results) {
    if (!result.path || !requestedPathSet.has(result.path)) {
      invalidResultCount += 1;
      continue;
    }
    if (seenPaths.has(result.path)) {
      duplicatePaths.add(result.path);
      urlsByPath.delete(result.path);
      invalidResultCount += 1;
      continue;
    }

    seenPaths.add(result.path);
    if (result.signedUrl && !result.error) {
      urlsByPath.set(result.path, result.signedUrl);
    } else {
      invalidResultCount += 1;
    }
  }

  for (const path of duplicatePaths) {
    urlsByPath.delete(path);
  }

  return {
    urlsByPath,
    unavailableCount: requestedPaths.length - urlsByPath.size,
    invalidResultCount,
  };
}
