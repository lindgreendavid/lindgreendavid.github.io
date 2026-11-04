// A horizontal rail: on wide screens the section pins and the cards slide sideways as you scroll down. On phones, with reduced motion or
// without JavaScript the cards stay in their normal grid.
import { gsap, ScrollTrigger } from "./motion";

document.querySelectorAll<HTMLElement>("[data-rail]").forEach((rail) => {
  const track = rail.querySelector<HTMLElement>(".rail-track");
  const stage = rail.querySelector<HTMLElement>(".rail-stage");
  if (!track || !stage) return;
  const wide = matchMedia("(min-width: 900px)");
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  if (!wide.matches || calm.matches) return;

  rail.classList.add("rail-live");
  const dist = () => Math.max(0, track.scrollWidth - stage.clientWidth);
  const size = () => (rail.style.height = `${dist() + innerHeight}px`);
  size();
  gsap.to(track, {
    x: () => -dist(),
    ease: "none",
    scrollTrigger: { trigger: rail, start: "top top", end: "bottom bottom", scrub: true, invalidateOnRefresh: true, onRefresh: size },
  });
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
});
