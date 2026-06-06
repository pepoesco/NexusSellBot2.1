const states = [
  {
    active: 0,
    revenue: "R$ 8.420",
    conversion: "68%",
    orders: "137"
  },
  {
    active: 1,
    revenue: "R$ 9.180",
    conversion: "71%",
    orders: "149"
  },
  {
    active: 2,
    revenue: "R$ 10.640",
    conversion: "76%",
    orders: "164"
  }
];

let stateIndex = 0;

function renderState() {
  const state = states[stateIndex];
  document.querySelectorAll(".pipeline-step").forEach((step, index) => {
    step.classList.toggle("active", index === state.active);
  });
  document.querySelector("#metric-revenue").textContent = state.revenue;
  document.querySelector("#metric-conversion").textContent = state.conversion;
  document.querySelector("#metric-orders").textContent = state.orders;
}

document.querySelector("#cycle-state")?.addEventListener("click", () => {
  stateIndex = (stateIndex + 1) % states.length;
  renderState();
});

window.lucide?.createIcons();
renderState();
