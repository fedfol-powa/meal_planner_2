/** Browser languages, read before sign-in (jsdom says en-US by default). */
export function setBrowserLanguages(languages: string[]): void {
  Object.defineProperty(window.navigator, 'languages', { configurable: true, get: () => languages });
}
