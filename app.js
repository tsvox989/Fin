/***********************
 * Money Tracker — app.js
 * Frontend for Telegram Mini App
 *
 * Background tasks:
 * - gets Telegram user_id immediately (if inside Telegram)
 * - starts history loading and access check in background (does not block input)
 ***********************/

const API_URL = "PASTE_YOUR_GAS_WEBAPP_URL_HERE"; // например: https://script.google.com/macros/s/XXXXX/exec
const HISTORY_LIMIT = 50;

const els = {
  dateBtn: document.getElementById("dateBtn"),
  dateText: document.getElementById("dateText"),
  dateInput: document.getElementById("dateInput"),

  typeInBtn: document.getElementById("typeInBtn"),
  typeOutBtn: document.getElementById("typeOutBtn"),
  typeFxBtn: document.getElementById("typeFxBtn"),
  typeThumb: document.getElementById("typeThumb"),

  amountInput: document.getElementById("amountInput"),
  currencyInput: document.getElementById("currencyInput"),

  fxBlock: document.getElementById("fxBlock"),
  fxHint: document.getElementById("fxHint"),
  fxRateInput: document.getElementById("fxRateInput"),
  fxAmountInput: document.getElementById("fxAmountInput"),
  fxCurBadge: document.getElementById("fxCurBadge"),

  counterpartyInput: document.getElementById("counterpartyInput"),
  commentInput: document.getElementById("commentInput"),

  photoInput: document.getElementById("photoInput"),
  photoName: document.getElementById("photoName"),
  removePhotoBtn: document.getElementById("removePhotoBtn"),

  saveBtn: document.getElementById("saveBtn"),
  statusPill: document.getElementById("statusPill"),

  historyList: document.getElementById("historyList"),
  historyCount: document.getElementById("historyCount"),
};

const state = {
  tg: null,
  userId: "",
  type: "in", // in|out|fx
  amountRaw: "",
  isSaving: false,
  history: null, // null => not connected
};

/***************
 * TELEGRAM
 ***************/
function initTelegram_() {
  if (window.Telegram && Telegram.WebApp) {
    state.tg = Telegram.WebApp;
    try { state.tg.ready(); } catch {}

    const u = state.tg.initDataUnsafe && state.tg.initDataUnsafe.user ? state.tg.initDataUnsafe.user : null;
    if (u && u.id) state.userId = String(u.id);
  }
}

function isDark_() {
  try {
    if (state.tg && state.tg.colorScheme) return state.tg.colorScheme === "dark";
  } catch {}
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/***************
 * DATE
 ***************/
function pad2_(n){ return String(n).padStart(2,"0"); }

function isoToDMY_(iso){
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "--.--.----";
  const [y,m,d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function setToday_(){
  const now = new Date();
  const iso = `${now.getFullYear()}-${pad2_(now.getMonth()+1)}-${pad2_(now.getDate())}`;
  els.dateInput.value = iso;
  els.dateText.textContent = isoToDMY_(iso);
}

function bindDate_(){
  els.dateBtn.addEventListener("click", () => els.dateInput.showPicker ? els.dateInput.showPicker() : els.dateInput.click());
  els.dateInput.addEventListener("change", () => {
    els.dateText.textContent = isoToDMY_(els.dateInput.value);
  });
}

/***************
 * AMOUNT formatting (display with spaces; store raw without spaces)
 ***************/
function normalizeAmountRaw_(s){
  s = String(s||"").replace(/\s+/g,"").replace(/[^\d,]/g,"");
  const i = s.indexOf(",");
  if (i !== -1) {
    const ip = s.slice(0,i);
    const fp = s.slice(i+1).replace(/,/g,"").slice(0,2);
    return fp.length ? `${ip},${fp}` : `${ip},`;
  }
  return s;
}

function formatForDisplay_(raw){
  raw = String(raw||"");
  const parts = raw.split(",");
  const intp = parts[0] || "";
  const frac = parts.length > 1 ? parts[1] : null;
  const grouped = intp.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (frac === null) return grouped;
  return `${grouped},${frac}`;
}

function toNumber_(raw){
  const n = Number(String(raw||"").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function fixed2Comma_(num){
  const n = Number(num);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function setInputWithCaret_(input, newValue, caretFromRight){
  input.value = newValue;
  const pos = Math.max(0, newValue.length - caretFromRight);
  input.setSelectionRange(pos, pos);
}

function bindAmount_(){
  els.amountInput.addEventListener("input", (e) => {
    const input = e.target;
    const before = input.value;
    const caret = input.selectionStart || 0;
    const caretFromRight = before.length - caret;

    const raw = normalizeAmountRaw_(before);
    state.amountRaw = raw;

    const display = formatForDisplay_(raw);
    setInputWithCaret_(input, display, caretFromRight);

    paintAmountByType_();
    if (state.type === "fx") updateFxComputed_();
  });

  els.amountInput.addEventListener("blur", () => {
    const raw = normalizeAmountRaw_(state.amountRaw || "");
    state.amountRaw = raw.endsWith(",") ? raw.slice(0,-1) : raw;
    els.amountInput.value = formatForDisplay_(state.amountRaw);
    paintAmountByType_();
    if (state.type === "fx") updateFxComputed_();
  });
}

function paintAmountByType_(){
  els.amountInput.classList.remove("txt-green","txt-red","txt-blue");
  if (state.type === "in") els.amountInput.classList.add("txt-green");
  else if (state.type === "out") els.amountInput.classList.add("txt-red");
  else els.amountInput.classList.add("txt-blue");
}

/***************
 * TYPE switch
 ***************/
function setType_(t){
  state.type = t;

  // buttons
  const btns = [els.typeInBtn, els.typeOutBtn, els.typeFxBtn];
  btns.forEach(b => b.classList.remove("is-active"));
  btns.forEach(b => b.setAttribute("aria-selected","false"));

  let idx = 0;
  if (t === "in") { els.typeInBtn.classList.add("is-active"); els.typeInBtn.setAttribute("aria-selected","true"); idx = 0; }
  if (t === "out") { els.typeOutBtn.classList.add("is-active"); els.typeOutBtn.setAttribute("aria-selected","true"); idx = 1; }
  if (t === "fx") { els.typeFxBtn.classList.add("is-active"); els.typeFxBtn.setAttribute("aria-selected","true"); idx = 2; }

  // thumb position
  els.typeThumb.style.transform = `translateX(${idx * 100}%)`;

  // fx block toggle
  if (t === "fx") {
    els.fxBlock.classList.remove("is-hidden");
    updateFxUi_();
  } else {
    els.fxBlock.classList.add("is-hidden");
  }

  // save button color
  els.saveBtn.classList.remove("btn-in","btn-out","btn-fx");
  if (t === "in") els.saveBtn.style.background = "var(--green)";
  else if (t === "out") els.saveBtn.style.background = "var(--red)";
  else els.saveBtn.style.background = "var(--blue)";

  paintAmountByType_();
}

function bindType_(){
  els.typeInBtn.addEventListener("click", () => setType_("in"));
  els.typeOutBtn.addEventListener("click", () => setType_("out"));
  els.typeFxBtn.addEventListener("click", () => setType_("fx"));
}

/***************
 * FX logic (relative to UZS)
 * - if main currency is UZS => receive foreign (badge shows selected foreign; default USD)
 * - if main currency is foreign => receive only UZS (badge shows UZS)
 ***************/
function computeFxCurrency_(mainCur){
  if (mainCur === "UZS") return "USD";
  return "UZS";
}

function updateFxUi_(){
  const mainCur = String(els.currencyInput.value || "UZS");
  const fxCur = computeFxCurrency_(mainCur);

  els.fxCurBadge.textContent = fxCur;

  if (mainCur === "UZS") {
    els.fxHint.textContent = "Отдаёт UZS → получает валюту";
  } else {
    els.fxHint.textContent = "Отдаёт валюту → получает UZS";
  }

  updateFxComputed_();
}

function updateFxComputed_(){
  const mainCur = String(els.currencyInput.value || "UZS");
  const fxRateRaw = normalizeAmountRaw_(els.fxRateInput.value || "");
  const amountNum = toNumber_(state.amountRaw || "");
  const rateNum = toNumber_(fxRateRaw);

  // визуально форматируем курс аккуратно, но без “прыжков”
  els.fxRateInput.value = formatForDisplay_(fxRateRaw);

  if (!Number.isFinite(amountNum) || amountNum <= 0 || !Number.isFinite(rateNum) || rateNum <= 0) {
    els.fxAmountInput.value = "";
    return;
  }

  const computed = mainCur === "UZS" ? amountNum / rateNum : amountNum * rateNum;
  els.fxAmountInput.value = formatForDisplay_(fixed2Comma_(computed));
}

function bindFx_(){
  els.currencyInput.addEventListener("change", () => {
    if (state.type === "fx") updateFxUi_();
  });

  els.fxRateInput.addEventListener("input", () => {
    updateFxComputed_();
  });

  els.fxRateInput.addEventListener("blur", () => {
    const raw = normalizeAmountRaw_(els.fxRateInput.value || "");
    els.fxRateInput.value = formatForDisplay_(raw.endsWith(",") ? raw.slice(0,-1) : raw);
    updateFxComputed_();
  });
}

/***************
 * PHOTO
 ***************/
function bindPhoto_(){
  els.photoInput.addEventListener("change", () => {
    const f = els.photoInput.files && els.photoInput.files[0] ? els.photoInput.files[0] : null;
    els.photoName.textContent = f ? (f.name || "photo") : "Не выбрано";
  });
  els.removePhotoBtn.addEventListener("click", () => {
    els.photoInput.value = "";
    els.photoName.textContent = "Не выбрано";
  });
}

function fileToBase64_(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/***************
 * API
 ***************/
async function apiPost_(payload){
  if (!API_URL || API_URL.includes("PASTE_YOUR")) throw new Error("API_URL not set");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return data;
}

function setStatus_(t){ els.statusPill.textContent = t; }

function renderNotConnected_(){
  setStatus_("Не подключен");
  els.historyCount.textContent = "";
  els.historyList.innerHTML = `<div class="history-empty">Не подключен</div>`;
}

function renderHistory_(items){
  const list = (items || []).slice(0, HISTORY_LIMIT);
  els.historyCount.textContent = list.length ? `${list.length}` : "";

  if (!list.length) {
    els.historyList.innerHTML = `<div class="history-empty">Пока нет данных</div>`;
    return;
  }

  els.historyList.innerHTML = "";
  for (const it of list) {
    const type = String(it.type || "");
    const isIn = type === "Получил";
    const isOut = type === "Отдал";
    const isFx = type === "Обменял";

    const signClass = isIn ? "txt-green" : isOut ? "txt-red" : "txt-blue";
    const ic = isIn ? "+" : isOut ? "−" : "⇄";

    const div = document.createElement("div");
    div.className = `h-item ${isFx ? "is-fx" : ""} ${it.__optimistic ? "optimistic" : ""} ${it.__failed ? "failed" : ""}`;

    div.innerHTML = `
      <div class="h-ic ${signClass}">${ic}</div>
      <div class="h-body">
        <div class="h-top">
          <div>
            <div class="h-title">${escapeHtml_(type)}</div>
            <div class="h-date">${escapeHtml_(it.date || "")}${it.__optimistic && !it.__failed ? " · Сохраняется…" : it.__failed ? " · Не удалось" : ""}</div>
          </div>
          <div>
            <div class="h-amt ${signClass}">${escapeHtml_(it.amount_main || "")}</div>
            ${it.amount_sub ? `<div class="h-sub">${escapeHtml_(it.amount_sub)}</div>` : ""}
          </div>
        </div>
      </div>
    `;

    els.historyList.appendChild(div);
  }
}

function escapeHtml_(s){
  return String(s||"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

/***************
 * Background: load history without blocking input
 ***************/
async function backgroundLoadHistory_(){
  if (!state.userId) {
    renderNotConnected_();
    return;
  }

  try {
    const data = await apiPost_({ action: "get_transactions", user_id: state.userId });
    if (!data || data.ok !== true || !Array.isArray(data.items)) {
      renderNotConnected_();
      return;
    }
    setStatus_("Подключен");
    state.history = data.items;
    renderHistory_(state.history);
  } catch {
    renderNotConnected_();
  }
}

/***************
 * Save with optimistic item
 ***************/
function buildOptimisticItem_(){
  const date = isoToDMY_(els.dateInput.value);
  const cur = String(els.currencyInput.value || "").trim();
  const amount = normalizeAmountRaw_(state.amountRaw || "");
  const typeKey = state.type;

  const type = typeKey === "in" ? "Получил" : typeKey === "out" ? "Отдал" : "Обменял";
  const sign = typeKey === "in" ? "+" : "-";
  const amount_main = `${sign} ${amount} ${cur}`.trim();

  let amount_sub = "";
  if (typeKey === "fx") {
    const fxRateRaw = normalizeAmountRaw_(els.fxRateInput.value || "");
    const amountNum = toNumber_(amount);
    const rateNum = toNumber_(fxRateRaw);
    if (Number.isFinite(amountNum) && amountNum > 0 && Number.isFinite(rateNum) && rateNum > 0) {
      const fxCur = computeFxCurrency_(cur);
      const computed = cur === "UZS" ? amountNum / rateNum : amountNum * rateNum;
      amount_sub = `+ ${fixed2Comma_(computed)} ${fxCur}`.trim();
    }
  }

  return {
    __id: "tmp_" + Math.random().toString(16).slice(2),
    __optimistic: true,
    date,
    type,
    amount_main,
    amount_sub
  };
}

function markOptimisticFailed_(id){
  if (!Array.isArray(state.history)) return;
  state.history = state.history.map(x => x.__id === id ? { ...x, __failed: true } : x);
  renderHistory_(state.history);
}

async function onSave_(){
  if (state.isSaving) return;

  if (!state.userId) {
    setStatus_("Не подключен");
    return;
  }

  // validation: all required except photo
  const dateDMY = isoToDMY_(els.dateInput.value);
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateDMY)) { setStatus_("Ошибка даты"); return; }

  const amountRaw = normalizeAmountRaw_(state.amountRaw || "");
  if (!amountRaw || !(toNumber_(amountRaw) > 0)) { setStatus_("Ошибка суммы"); return; }

  const currency = String(els.currencyInput.value || "").trim();
  if (!currency) { setStatus_("Ошибка валюты"); return; }

  const counterparty = String(els.counterpartyInput.value || "").trim();
  if (!counterparty) { setStatus_("Заполните контрагента"); return; }

  const comment = String(els.commentInput.value || "").trim();
  if (!comment) { setStatus_("Заполните комментарий"); return; }

  // FX fields
  let fx_rate_raw = "";
  let fx_currency = "";
  if (state.type === "fx") {
    fx_rate_raw = normalizeAmountRaw_(els.fxRateInput.value || "");
    if (!fx_rate_raw || !(toNumber_(fx_rate_raw) > 0)) { setStatus_("Ошибка курса"); return; }
    fx_currency = computeFxCurrency_(currency);
  }

  // optimistic UI
  if (!Array.isArray(state.history)) state.history = [];
  const optimistic = buildOptimisticItem_();
  state.history = [optimistic, ...state.history];
  renderHistory_(state.history);

  // build payload
  let photo_base64 = "";
  let photo_filename = "";
  let photo_mime = "";

  const file = els.photoInput.files && els.photoInput.files[0] ? els.photoInput.files[0] : null;
  if (file) {
    photo_filename = file.name || "photo.jpg";
    photo_mime = file.type || "image/jpeg";
    const b64 = await fileToBase64_(file);
    photo_base64 = String(b64).split(",").pop(); // remove data: prefix
  }

  const payload = {
    action: "save_transaction",
    user_id: state.userId,
    type: state.type,
    date: dateDMY,
    currency,
    amount_raw: amountRaw,
    counterparty,
    comment
  };

  if (state.type === "fx") {
    payload.fx_rate_raw = fx_rate_raw;
    payload.fx_currency = fx_currency;
  }

  if (photo_base64) {
    payload.photo_base64 = photo_base64;
    payload.photo_filename = photo_filename;
    payload.photo_mime = photo_mime;
  }

  state.isSaving = true;
  els.saveBtn.setAttribute("disabled","disabled");
  setStatus_("Сохраняется…");

  try {
    const res = await apiPost_(payload);
    if (!res || res.ok !== true) {
      markOptimisticFailed_(optimistic.__id);
      setStatus_("Не получилось сохранить");
      return;
    }

    setStatus_("Сохранено");

    // background refresh
    await backgroundLoadHistory_();

    // reset form (keep date)
    state.amountRaw = "";
    els.amountInput.value = "";
    els.counterpartyInput.value = "";
    els.commentInput.value = "";
    els.photoInput.value = "";
    els.photoName.textContent = "Не выбрано";
    els.fxRateInput.value = "";
    els.fxAmountInput.value = "";
    if (state.type === "fx") updateFxUi_();
  } catch {
    markOptimisticFailed_(optimistic.__id);
    setStatus_("Не получилось сохранить");
  } finally {
    state.isSaving = false;
    els.saveBtn.removeAttribute("disabled");
  }
}

/***************
 * INIT
 ***************/
function init_(){
  initTelegram_();

  setToday_();
  bindDate_();
  bindType_();
  bindAmount_();
  bindFx_();
  bindPhoto_();

  // initial
  setType_("in");
  paintAmountByType_();

  // do not block: run in background
  setStatus_("Проверка…");
  backgroundLoadHistory_();

  els.saveBtn.addEventListener("click", onSave_);

  // if Telegram theme changes (rare): just re-render history (for fx dark fill in dark theme)
  try {
    if (state.tg && state.tg.onEvent) {
      state.tg.onEvent("themeChanged", () => renderHistory_(state.history || []));
    }
  } catch {}
}

document.addEventListener("DOMContentLoaded", init_);
