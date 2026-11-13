// The browser's own fetch, captured before client.js wraps window.fetch. Import this (not window.fetch) for calls that
// must NOT go through the wrapper, such as loading /api/config or talking to our own plan endpoints.
export const nativeFetch = window.fetch.bind(window);
