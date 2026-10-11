/** The device's view of the network; the fake client and the offline banner both read it. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function subscribeConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
