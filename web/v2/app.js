document.querySelectorAll(".pane-tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    document.querySelectorAll(".pane-tabs button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== tab);
    });
  });
});

document.querySelectorAll(".comment-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".comment-card").forEach((item) => {
      item.classList.toggle("active", item === card);
    });
  });
});

document.querySelector(".agent-card")?.addEventListener("click", () => {
  document.querySelector(".toggle")?.classList.toggle("on");
});
