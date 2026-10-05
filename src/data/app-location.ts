export function appDirectoryUrl(currentHref: string): string {
  return new URL(".", currentHref).href;
}

export function appDirectoryPath(currentHref: string): string {
  return new URL(".", currentHref).pathname;
}
