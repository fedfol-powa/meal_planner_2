/** Leaves the app for the agent's URL (its local callback); replaced in tests, where jsdom cannot navigate. */
export const leavePage = {
  to(url: string): void {
    window.location.assign(url);
  }
};
