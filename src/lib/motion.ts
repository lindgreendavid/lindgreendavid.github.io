// Site-wide motion built on GSAP: headline word reveals, number count-ups and the footer name rising into place.
// Everything is an enhancement: with reduced motion or without JavaScript the page is complete and static.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export { gsap, ScrollTrigger };
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
gsap.registerPlugin(ScrollTrigger);

// Links to a place on the same page scroll with the browser's own smooth scrolling (set in CSS) and still move focus, so skip links keep working.
document.addEventListener("click", (e) => {
  const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href*="#"]');
  if (!a || a.origin !== location.origin || a.pathname !== location.pathname || a.hash.length < 2) return;
  const target = document.querySelector<HTMLElement>(a.hash);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", a.hash);
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
});

/** Splits a plain-text heading into masked words, so each can rise into place. The full text stays available to screen readers. */
function words(el: HTMLElement): HTMLElement[] {
  if (el.children.length || el.dataset.split || !el.textContent?.trim()) return [];
  const text = el.textContent.trim();
  el.dataset.split = "1";
  el.setAttribute("aria-label", text);
  el.textContent = "";
  return text.split(/\s+/).map((w) => {
    const mask = document.createElement("span");
    mask.className = "sw";
    mask.setAttribute("aria-hidden", "true");
    const inner = document.createElement("span");
    inner.textContent = w;
    mask.append(inner);
    el.append(mask, " ");
    return inner;
  });
}

function setup() {
  if (reduced) return;

  document.querySelectorAll<HTMLElement>(".section-head h2, .proj-hero h1, #contact-h").forEach((h) => {
    const parts = words(h);
    if (!parts.length) return;
    gsap.from(parts, { yPercent: 118, duration: 1, ease: "power4.out", stagger: 0.07, scrollTrigger: { trigger: h, start: "top 90%", toggleActions: "play complete none none" } });
  });

  // Numbers that arrive as a count, so a result reads as something being computed.
  document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const m = el.textContent?.trim().match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const target = parseFloat(m[1]);
    const dec = (m[1].split(".")[1] ?? "").length;
    const suffix = m[2];
    const final = el.textContent!.trim();
    const o = { v: 0 };
    el.setAttribute("aria-label", final);
    el.textContent = `${(0).toFixed(dec)}${suffix}`;
    gsap.to(o, {
      v: target,
      duration: 1.5,
      ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 92%", toggleActions: "play complete none none" }, // a jump past it (an anchor link) still lands on the final value
      onUpdate: () => (el.textContent = `${o.v.toFixed(dec)}${suffix}`),
      onComplete: () => (el.textContent = final),
    });
  });

  // The footer name rises into place as the end of the page arrives.
  const wm = document.querySelector<HTMLElement>(".wordmark");
  if (wm) gsap.fromTo(wm, { yPercent: 45, opacity: 0 }, { yPercent: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: wm, start: "top 108%", end: "top 62%", scrub: true } });

  // Chart entrances play once; after that, redrawing a chart (a changed input) must not replay them.
  const settle = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      settle.unobserve(e.target);
      window.setTimeout(() => e.target.setAttribute("data-settled", ""), 2400);
    }
  });
  document.querySelectorAll(".pane").forEach((p) => settle.observe(p));

  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
else setup();
