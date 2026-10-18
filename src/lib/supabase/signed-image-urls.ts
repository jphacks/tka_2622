export interface SignedImageUrlResult {
  path: string | null;
  signedUrl: string | null;
  error: string | null;
}

export type SignedImageUrlMapResult =
  | { success: true; urlsByPath: Map<string, string> }
  | { success: false; reason: string };

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
