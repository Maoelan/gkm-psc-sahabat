// Mobile keyboards can resize the viewport without firing another focus event.
export function keepComposerVisible(
  getElement: () => HTMLTextAreaElement | undefined,
) {
  let frame = 0;
  function reveal() {
    const element = getElement();
    if (
      !element ||
      document.activeElement !== element ||
      window.innerWidth > 900
    )
      return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() =>
      element.scrollIntoView({ block: "nearest" }),
    );
  }
  window.addEventListener("resize", reveal);
  window.visualViewport?.addEventListener("resize", reveal);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", reveal);
    window.visualViewport?.removeEventListener("resize", reveal);
  };
}
