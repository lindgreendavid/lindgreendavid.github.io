// Tabs for the workbench pages. Without JavaScript the tab bar stays hidden and every panel is shown one after another.
export function initTabs() {
  const list = document.querySelector<HTMLElement>('[role="tablist"]');
  if (!list) return;
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")!)!);
  const select = (i: number, focus = false) => {
    tabs.forEach((t, k) => {
      t.setAttribute("aria-selected", String(k === i));
      t.tabIndex = k === i ? 0 : -1;
      panels[k].hidden = k !== i;
    });
    if (focus) tabs[i].focus();
    window.dispatchEvent(new Event("resize")); // the 3D view and charts re-measure when their panel appears
  };
  list.hidden = false;
  list.parentElement!.hidden = false;
  select(0);
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(i));
    t.addEventListener("keydown", (e) => {
      const k = e.key;
      const next = k === "ArrowRight" ? (i + 1) % tabs.length : k === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : k === "Home" ? 0 : k === "End" ? tabs.length - 1 : -1;
      if (next < 0) return;
      e.preventDefault();
      select(next, true);
    });
  });
  const wanted = location.hash.replace("#", "").replace("tab-", "");
  const byHash = tabs.findIndex((t) => t.id === `tab-${wanted}`);
  if (byHash > 0) select(byHash);
}
