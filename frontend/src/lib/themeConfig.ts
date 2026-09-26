// Plain module (no "use client") so the server layout can read these as real values.

export const THEME_KEY = "gfg-theme";

/** Runs in <head> before first paint so a saved light theme never flashes dark. */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;
