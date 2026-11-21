(function (root) {
  const STORAGE_KEY = "orbit-display-mode-v1";
  const VALID_MODES = ["dark", "light"];

  function getInitialMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID_MODES.indexOf(saved) !== -1 ? saved : "dark";
    } catch (error) {
      console.error("Could not restore the display mode.", error);
      return "dark";
    }
  }

  function save(mode) {
    if (VALID_MODES.indexOf(mode) === -1) return false;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
      return true;
    } catch (error) {
      console.error("Could not save the display mode.", error);
      return false;
    }
  }

  function apply(mode) {
    if (VALID_MODES.indexOf(mode) === -1 || typeof document === "undefined") return false;
    document.documentElement.dataset.mode = mode;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", mode === "light" ? "#f4f6fb" : "#080914");
    return true;
  }

  const api = { getInitialMode: getInitialMode, save: save, apply: apply };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OrbitThemeMode = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
