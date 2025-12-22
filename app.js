/* ==========
  UI state
========== */
const state = {
  type: "fx", // "in" | "out" | "fx"
  curMain: "UZS",
  curFx: "USD",
  photoFile: null,
  last: [
    { type: "in", title: "Получил", date: "23.12.2025", amountMain: "+ 200 UZS" },
    { type: "fx", title: "Обмен", date: "22.12.2025", amountMain: "- 2 000 UZS", amountSub: "+ 0,16 USD" },
  ],
};

const els = {
  date: document.getElementById("date"),
  amount: document.getElementById("amount"),
  amountLabel: document.getElementById("amountLabel"),
  amountHint: document.getElementById("amountHint"),
  counterpartyBlock: document.getElementById("counterpartyBlock"),
  counterparty: document.getElementById("counterparty"),
  comment: document.getElementById("comment"),
  curMain: document.getElementById("curMain"),
  curFx: document.getElementById("curFx"),
  fxBlock: document.getElementById("fxBlock"),
  fxRate: document.getElementById("fxRate"),
  fxTotalLine: document.getElementById("fxTotalLine"),
  btnSave: document.getElementById("btnSave"),
  list: document.getElementById("list"),
  pager: document.getElementById("pager"),
  toast: document.getElementById("toast"),
  photo: document.getElementById("photo"),
  photoMeta: document.getElementById("photoMeta"),
  btnClose: document.getElementById("btnClose"),
  btnMenu: document.getElementById("btnMenu"),
};

/* ==========
  Telegram init
========== */
(function initTelegram() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    try { tg.ready(); } catch {}
    els.btnClose.addEventListener("click", () => { try { tg.close(); } catch {} });
  } else {
    els.btnClose.addEventListener("click", () => history.back());
  }
})();

/* ==========
  Helpers: date + number formatting
========== */
function pad2(n) { return String(n).padStart(2, "0"); }

function todayDDMMYYYY() {
  const d = new Date();
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function normalizeMoneyInput(raw) {
  // Разрешаем цифры, пробелы, запятую. Оставляем одну запятую и 2 знака после неё.
  let s = String(raw || "")
    .replace(/[^\d,\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // одна запятая
  const parts = s.split(",");
  const intPart = (parts[0] || "").replace(/\s/g, "");
  const fracPart = (parts[1] || "").replace(/[^\d]/g, "").slice(0, 2);

  // группировка пробелами по 3
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fracPart.length > 0 ? `${grouped},${fracPart}` : grouped;
}

function setSignedPlaceholder() {
  if (state.type === "out") {
    els.amount.placeholder = "0 000,00";
  } else {
    els.amount.placeholder = "0 000,00";
  }
}

function formatFxTotal() {
  // Здесь просто визуальная имитация. Реальный расчёт подключите к Вашей логике.
  const rate = (els.fxRate.value || "").replace(/\s/g, "").replace(",", ".");
  const main = (els.amount.value || "").replace(/\s/g, "").replace(",", ".");
  const r = Number(rate);
  const m = Number(main);
  if (!Number.isFinite(r) || !Number.isFinite(m) || r <= 0) {
    els.fxTotalLine.innerHTML = `<span class="text-brand-green font-medium">Итого: + 0,00 ${state.curFx}</span>`;
    return;
  }
  // Предположим: при "Обменял" вводится UZS (отдаю), получаю curFx = UZS / rate
  const got = m / r;
  const got2 = (Math.round(got * 100) / 100).toFixed(2).replace(".", ",");
  els.fxTotalLine.innerHTML = `<span class="text-brand-green font-medium">Итого: + ${got2} ${state.curFx}</span>`;
}

/* ==========
  Type switch
========== */
document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.type = btn.dataset.type;
    renderType();
  });
});

function renderType() {
  document.querySelectorAll(".seg-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.type === state.type);
  });

  // Цвет кнопки сохранения
  els.btnSave.classList.remove("btn-save--green", "btn-save--red", "btn-save--blue");
  if (state.type === "in") els.btnSave.classList.add("btn-save--green");
  if (state.type === "out") els.btnSave.classList.add("btn-save--red");
  if (state.type === "fx") els.btnSave.classList.add("btn-save--blue");

  // Лейбл суммы
  if (state.type === "fx") {
    els.amountLabel.textContent = "Сумма (Отдаю)";
    els.fxBlock.classList.remove("hidden");
    // контрагент в обмене обычно не обязателен (как на Вашем скрине)
    els.counterpartyBlock.classList.add("hidden");
  } else {
    els.amountLabel.textContent = "Сумма";
    els.fxBlock.classList.add("hidden");
    els.counterpartyBlock.classList.remove("hidden");
  }

  setSignedPlaceholder();
  formatFxTotal();
}

/* ==========
  Inputs behavior
========== */
els.date.value = todayDDMMYYYY();
els.amount.addEventListener("input", () => {
  const prev = els.amount.value;
  els.amount.value = normalizeMoneyInput(prev);
  formatFxTotal();
});

els.fxRate.addEventListener("input", () => {
  els.fxRate.value = normalizeMoneyInput(els.fxRate.value);
  formatFxTotal();
});

/* ==========
  Currency selectors (простое переключение)
========== */
const mainCurrencies = ["UZS", "USD", "EUR", "RUB", "KZT"];
const fxCurrencies = ["USD", "EUR", "RUB", "KZT", "UZS"];

function cycle(btnEl, list, key) {
  btnEl.addEventListener("click", () => {
    const i = list.indexOf(state[key]);
    const next = list[(i + 1) % list.length];
    state[key] = next;
    btnEl.textContent = next;
    formatFxTotal();
  });
}

cycle(els.curMain, mainCurrencies, "curMain");
cycle(els.curFx, fxCurrencies, "curFx");

/* ==========
  Photo
========== */
els.photo.addEventListener("change", () => {
  const f = els.photo.files && els.photo.files[0];
  state.photoFile = f || null;
  if (f) {
    els.photoMeta.classList.remove("hidden");
    els.photoMeta.textContent = `Файл: ${f.name} (${Math.round(f.size / 1024)} КБ)`;
  } else {
    els.photoMeta.classList.add("hidden");
  }
});

/* ==========
  List rendering
========== */
function iconFor(t) {
  if (t === "in") return "↙";
  if (t === "out") return "↗";
  return "⇄";
}
function clsFor(t) {
  if (t === "in") return "tx-in";
  if (t === "out") return "tx-out";
  return "tx-fx";
}

function renderList() {
  els.list.innerHTML = "";
  const items = state.last.slice(0, 3);
  els.pager.textContent = `${Math.min(items.length, 3)} / 3`;

  items.forEach((x) => {
    const card = document.createElement("div");
    card.className = "tx-card";

    const left = document.createElement("div");
    left.className = "tx-left";

    const ic = document.createElement("div");
    ic.className = "tx-icon " + clsFor(x.type);
    ic.textContent = iconFor(x.type);

    const meta = document.createElement("div");
    meta.innerHTML = `
      <div class="tx-title">${x.title}</div>
      <div class="tx-date">${x.date}</div>
    `;

    left.appendChild(ic);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "tx-amount " + clsFor(x.type);
    right.innerHTML = `
      <div>${x.amountMain || ""}</div>
      ${x.amountSub ? `<span class="sub">${x.amountSub}</span>` : ""}
    `;

    card.appendChild(left);
    card.appendChild(right);
    els.list.appendChild(card);
  });
}

/* ==========
  Offline toast
========== */
function setToast(on) {
  els.toast.classList.toggle("hidden", !on);
}
window.addEventListener("offline", () => setToast(true));
window.addEventListener("online", () => setToast(false));

/* ==========
  Save handler (API заглушка)
========== */
els.btnSave.addEventListener("click", async () => {
  // Валидация (минимальная)
  const date = els.date.value.trim();
  const amount = els.amount.value.trim();
  if (!date || !amount) {
    showTempToast("Заполните дату и сумму");
    return;
  }

  // Здесь позже подключите Apps Script:
  // 1) check-access по initData Telegram
  // 2) upload-photo (если есть)
  // 3) save-transaction

  // Пока — просто добавляем запись в список, чтобы UI выглядел “живым”.
  const sign = state.type === "out" ? "-" : "+";
  const title = state.type === "in" ? "Получил" : (state.type === "out" ? "Отдал" : "Обмен");
  const main = `${sign} ${amount} ${state.curMain}`;

  const rec = { type: state.type, title, date, amountMain: main };

  if (state.type === "fx") {
    // Суб-строка “получил в валюте”
    const rate = (els.fxRate.value || "").replace(/\s/g, "").replace(",", ".");
    const mainNum = (amount || "").replace(/\s/g, "").replace(",", ".");
    const r = Number(rate);
    const m = Number(mainNum);
    if (Number.isFinite(r) && Number.isFinite(m) && r > 0) {
      const got = (Math.round((m / r) * 100) / 100).toFixed(2).replace(".", ",");
      rec.amountSub = `+ ${got} ${state.curFx}`;
    }
  }

  state.last.unshift(rec);
  renderList();

  showTempToast("Сохранено");
});

function showTempToast(text) {
  const el = els.toast;
  el.querySelector(".toast-inner span:last-child").textContent = text;
  setToast(true);
  setTimeout(() => {
    // если реально оффлайн — не скрываем
    if (navigator.onLine) setToast(false);
    // возвращаем стандартный текст
    el.querySelector(".toast-inner span:last-child").textContent = "Нет связи";
  }, 1200);
}

/* ==========
  Init
========== */
renderType();
renderList();
if (!navigator.onLine) setToast(true);
