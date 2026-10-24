/* 可见指针的垂钓输入会话：只接管庄园内点击，旧动画不能释放新会话。 */
const FishingInput = (() => {
  function create(doc) {
    let active = null;
    function stop(token = active) {
      if (!token || active !== token) return;
      active = null;
      token.target?.classList?.remove("fishing-session");
      doc.removeEventListener("click", token.click, true);
      doc.removeEventListener("keydown", token.key, true);
      doc.removeEventListener("visibilitychange", token.visibility);
      doc.defaultView?.removeEventListener("blur", token.blur);
    }
    function start({ target, canReel, onReel }) {
      stop();
      const token = { target, reeled: false };
      active = token;
      const inside = element => element === target || !!target?.contains?.(element);
      const reel = () => {
        if (!token.reeled && canReel()) { token.reeled = true; onReel(); }
      };
      token.click = e => {
        if (!inside(e.target)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        reel();
      };
      token.key = e => {
        if (e.key === "Escape") { stop(token); return; }
        if (e.key !== " " && e.code !== "Space") return;
        if (doc.activeElement && doc.activeElement !== doc.body && !inside(doc.activeElement)) return;
        e.preventDefault();e.stopImmediatePropagation();
        if (!e.repeat) reel();
      };
      token.visibility = () => { if (doc.hidden) stop(token); };
      token.blur = () => stop(token);
      target?.classList?.add("fishing-session");
      doc.addEventListener("click", token.click, true);
      doc.addEventListener("keydown", token.key, true);
      doc.addEventListener("visibilitychange", token.visibility);
      doc.defaultView?.addEventListener("blur", token.blur);
      return token;
    }
    return { start, stop };
  }
  return typeof document === "undefined" ? { create } : { ...create(document), create };
})();
if (typeof module !== "undefined") module.exports = FishingInput;
