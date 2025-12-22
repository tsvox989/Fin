/***************
  CONFIG
****************/
// URL веб-приложения Google Apps Script (вставьте свой)
const API_URL = ""; // пример: "https://script.google.com/macros/s/AKfycbxXXXX/exec"

/*
Ожидаемый контракт (рекомендуемый):
POST API_URL с JSON: { action: "get_transactions", initData: "<telegram initData>" }
Ответ: { ok: true, items: [ ... ] }

items[] пример:
{
  type: "in"|"out"|"fx",
  date: "2025-12-22" или "22.12.2025",
  amount_main: "+ 200,00 UZS",
  amount_sub: "+ 0,16 USD" (для fx, опционально),
  counterparty: "...",
  comment: "...",
}
*/

const state = {
  type: "fx",           // in | out | fx
  curMain: "UZS",
  curFx: "USD",         // валюта второй стороны в обмене (если curMain=UZS)
  photoFile: null,
  initData: "",
};

const els = {
  date: document.getElementById("date"),
  amount: document.getElementById("amount"),
  amountLabel: document.getElementById("amountLabel"),
  curMain: document.getElementById("curMain"),
  fxBlock: document.getElementById("fxBlock"),
  fxRate: document.getElementById("fxRate"),
  curFx: document.getElementById("curFx"),
  fxHint: document.getElementById("fxHint"),
  fxTotalLine: document.getElementById("fxTotalLine"),
  counterpartyBlock: document.getElementById("counterpartyBlock"),
  counterparty: document.getElementById("counterparty"),
  comment: document.getElementById("comment"),
  photo: document.getElementById("photo"),
  photoMeta: document.getElementById("photoMeta"),
  btnSave: document.getElementById("btnSave"),
  list: document.getElementById("list"),
  pager: document.getElementById("pager"),
  toast: document.getElementById("toast"),
  toastText: document.getElementById("toastText"),
};

/***************
  Telegram init
****************/
(function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try { tg.ready(); } catch {}
    state.initData = tg.initData || "";
  }
})();

/***************
  Helpers: money formatting with comma and 2 decimals
  - allows comma input
  - always 2 digits after comma
****************/
function pad2(n){ return String(n).padStart(2, "0"); }

function setDefaultDate(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth()+1);
  const dd = pad2(d.getDate());
  els.date.value = `${yyyy}-${mm}-${dd}`; // for <input type="date">
}

function stripSign(s){
  s = String(s || "").trim();
  if (s.startsWith("+") || s.startsWith("-")) s = s.slice(1).trim();
  return s;
}

function normalizeMoneyCore(raw){
  // keep digits and comma only
  let s = String(raw || "").replace(/[^\d,]/g, "");
  // only first comma
  const idx = s.indexOf(",");
  if (idx !== -1) {
    s = s.slice(0, idx + 1) + s.slice(idx + 1).replace(/,/g, "");
  }
  let [intPart, fracPart] = s.split(",");
  intPart = (intPart || "").replace(/^0+(?=\d)/, ""); // trim leading zeros
  fracPart = (fracPart || "").replace(/[^\d]/g, "").slice(0, 2);

  // group thousands with spaces
  const grouped = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  // force 2 decimals ALWAYS
  const frac2 = (fracPart + "00").slice(0, 2);
  return `${grouped},${frac2}`;
}

function signedValue(raw){
  const sign = (state.type === "in") ? "+" : "-";
  const core = normalizeMoneyCore(stripSign(raw));
  return `${sign} ${core}`;
}

function setAmountColor(){
  els.amount.classList.remove("money-in", "money-out", "money-fx");
  if (state.type === "in") els.amount.classList.add("money-in");
  if (state.type === "out") els.amount.classList.add("money-out");
  if (state.type === "fx") els.amount.classList.add("money-fx");
}

function setSaveColor(){
  els.btnSave.classList.remove("btn-save--green", "btn-save--red", "btn-save--blue");
  if (state.type === "in") els.btnSave.classList.add("btn-save--green");
  if (state.type === "out") els.btnSave.classList.add("btn-save--red");
  if (state.type === "fx") els.btnSave.classList.add("btn-save--blue");
}

function renderType(){
  document.querySelectorAll(".seg-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.type === state.type);
  });

  setSaveColor();
  setAmountColor();

  // FX UI rules
  if (state.type === "fx") {
    els.amountLabel.textContent = "Сумма (Отдаю)";
    els.fxBlock.classList.remove("hidden");
    els.counterpartyBlock.classList.add("hidden");

    // Exchange always relative to UZS:
    // If main=UZS -> receive is foreign (select curFx)
    // If main=foreign -> receive is UZS (curFx fixed/hidden)
    if (state.curMain === "UZS") {
      els.curFx.parentElement.classList.remove("hidden");
      els.fxHint.textContent = "Курс UZS на 1 ед. валюты";
    } else {
      // receive only UZS
      els.curFx.value = "USD"; // value unused, but keep stable
      els.curFx.parentElement.classList.add("hidden");
      els.fxHint.textContent = `Курс UZS на 1 ${state.curMain}`;
    }
  } else {
    els.amountLabel.textContent = "Сумма";
    els.fxBlock.classList.add("hidden");
    els.counterpartyBlock.classList.remove("hidden");
  }

  // enforce sign and 2 decimals
  els.amount.value = signedValue(els.amount.value || "");
  formatFxTotal();
}

function parseNumberCoreSigned(v){
  // v like "+ 12 200,00"
  const s = stripSign(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseNumberCore(v){
  const s = String(v||"").replace(/\s/g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/***************
  FX calculation (always relative to UZS)
  - If curMain=UZS: отдаю UZS, получаю curFx = UZS / rate
  - If curMain=foreign: отдаю foreign, получаю UZS = foreign * rate
****************/
function formatFxTotal(){
  if (state.type !== "fx") return;

  const rate = parseNumberCore(els.fxRate.value);
  const amountAbs = parseNumberCoreSigned(els.amount.value);

  if (!rate || rate <= 0 || !amountAbs || amountAbs <= 0) {
    els.fxTotalLine.innerHTML = `<span class="fx-total">Итого: + 0,00</span>`;
    return;
  }

  let res = 0;
  let resCur = "";

  if (state.curMain === "UZS") {
    // receive foreign
    res = amountAbs / rate;
    resCur = els.curFx.value;
  } else {
    // receive UZS
    res = amountAbs * rate;
    resCur = "UZS";
  }

  const res2 = (Math.round(res * 100) / 100).toFixed(2).replace(".", ",");
  els.fxTotalLine.innerHTML = `<span class="fx-total">Итого: + ${res2} ${resCur}</span>`;
}

/***************
  Inputs
****************/
els.amount.addEventListener("input", () => {
  els.amount.value = signedValue(els.amount.value);
  formatFxTotal();
});

els.fxRate.addEventListener("input", () => {
  // rate also with comma and 2 decimals
  els.fxRate.value = normalizeMoneyCore(els.fxRate.value);
  formatFxTotal();
});

els.curMain.addEventListener("change", () => {
  state.curMain = els.curMain.value;
  // For non-fx: nothing special
  // For fx: enforce exchange rule relative to UZS
  renderType();
});

els.curFx.addEventListener("change", () => {
  state.curFx = els.curFx.value;
  formatFxTotal();
});

/***************
  Type switch
****************/
document.querySelectorAll(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.type = btn.dataset.type;
    renderType();
  });
});

/***************
  Photo
****************/
els.photo.addEventListener("change", () => {
  const f = els.photo.files?.[0] || null;
  state.photoFile = f;
  if (f) {
    els.photoMeta.classList.remove("hidden");
    els.photoMeta.textContent = `Файл: ${f.name} (${Math.round(f.size / 1024)} КБ)`;
  } else {
    els.photoMeta.classList.add("hidden");
    els.photoMeta.textContent = "";
  }
});

/***************
  Toast
****************/
function showToast(text, ms = 1500){
  els.toastText.textContent = text;
  els.toast.classList.remove("hidden");
  setTimeout(() => els.toast.classList.add("hidden"), ms);
}

window.addEventListener("offline", () => showToast("Нет связи", 2000));

/***************
  API helper
****************/
async function apiPost(payload){
  if (!API_URL) throw new Error("API_URL not set");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // чтобы уменьшить шанс CORS preflight
    body: JSON.stringify(payload),
  });
  const txt = await res.text();
  let data = null;
  try { data = JSON.parse(txt); } catch { data = { ok:false, raw: txt }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data;
}

/***************
  History rendering
****************/
function iconFor(t){
  if (t === "in") return "↙";
  if (t === "out") return "↗";
  return "⇄";
}
function clsFor(t){
  if (t === "in") return "tx-in";
  if (t === "out") return "tx-out";
  return "tx-fx";
}

function renderNotConnected(){
  els.list.innerHTML = `
    <div class="tx-card">
      <div class="tx-left">
        <div class="tx-icon">!</div>
        <div>
          <div class="tx-title">Не подключен</div>
          <div class="tx-date">История не загружена</div>
        </div>
      </div>
    </div>
  `;
  els.pager.textContent = `0 / 0`;
}

function renderList(items){
  els.list.innerHTML = "";
  const total = Array.isArray(items) ? items.length : 0;
  els.pager.textContent = `${Math.min(total, 50)} / ${total}`;

  if (!total) {
    renderNotConnected();
    return;
  }

  items.slice(0, 50).forEach((x) => {
    const type = x.type || "out";
    const title = (type === "in") ? "Получил" : (type === "out" ? "Отдал" : "Обмен");
    const date = (x.date || "").toString();

    const card = document.createElement("div");
    card.className = "tx-card";

    const left = document.createElement("div");
    left.className = "tx-left";

    const ic = document.createElement("div");
    ic.className = "tx-icon " + clsFor(type);
    ic.textContent = iconFor(type);

    const meta = document.createElement("div");
    meta.innerHTML = `
      <div class="tx-title">${title}</div>
      <div class="tx-date">${date}</div>
    `;

    left.appendChild(ic);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "tx-amount " + clsFor(type);
    right.innerHTML = `
      <div>${x.amount_main || ""}</div>
      ${x.amount_sub ? `<span class="sub">${x.amount_sub}</span>` : ""}
    `;

    card.appendChild(left);
    card.appendChild(right);
    els.list.appendChild(card);
  });
}

async function loadHistory(){
  try {
    const data = await apiPost({ action: "get_transactions", initData: state.initData });
    if (!data || data.ok !== true || !Array.isArray(data.items)) {
      renderNotConnected();
      return;
    }
    renderList(data.items);
  } catch (e) {
    renderNotConnected();
  }
}

/***************
  Save (без демо, только вызов API)
****************/
els.btnSave.addEventListener("click", async () => {
  try {
    if (!API_URL) {
      showToast("Не подключен");
      return;
    }

    const payload = {
      action: "save_transaction",
      initData: state.initData,
      type: state.type,
      date: els.date.value,                 // YYYY-MM-DD
      currency: els.curMain.value,
      amount: els.amount.value,             // "+ 1 234,00" / "- 1 234,00"
      counterparty: (state.type === "fx") ? "" : (els.counterparty.value || ""),
      comment: (els.comment.value || ""),
      // fx:
      fx_rate: (state.type === "fx") ? els.fxRate.value : "",
      fx_currency: (state.type === "fx" && state.curMain === "UZS") ? els.curFx.value : "UZS",
      // photo:
      // photo передавать лучше отдельным action upload_photo (base64), здесь оставлено место
    };

    const res = await apiPost(payload);
    if (res?.ok) {
      showToast("Сохранено");
      await loadHistory();
    } else {
      showToast("Ошибка");
    }
  } catch {
    showToast("Не подключен");
  }
});

/***************
  Init
****************/
setDefaultDate();
els.amount.value = signedValue("");
els.fxRate.value = normalizeMoneyCore("");
state.curMain = els.curMain.value;
state.curFx = els.curFx.value;
renderType();
loadHistory();
