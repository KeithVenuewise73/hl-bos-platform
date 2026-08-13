/* Venuewise Website Preview — safeguard script.
   No production connections. Conversion CTAs are inert and say so plainly;
   navigation links move within the preview only. */
(function () {
  "use strict";

  var toast;
  function showToast(msg) {
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.innerHTML = msg;
    toast.classList.add("show");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2600);
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-preview-action]") : null;
    if (!el) return;
    e.preventDefault();
    showToast(
      "<b>Preview — action not active.</b> This is a design preview, not the live site.",
    );
  });
})();
