/***********************
 * Money Tracker — App.js
 * Integration: Google Apps Script Web App
 ***********************/

// UPDATED URL
const API_URL = "https://script.google.com/macros/s/AKfycbxjVGERFEhHHe6gTCoq8VgbCJJar2zwdvPUJ6I78ANBwvdEkWP6qsHf3x_jE10TErCY/exec";

// STATE
const state = {
    userId: null,
    user: null,
    initData: null, // Raw Telegram initData
    access: null,   // null = checking, true = allowed, false = denied

    // Form
    type: "in",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "UZS",
    fxRate: "",
    fxCurrency: "USD",
    comment: "",
    photo: null,

    history: [],
    loading: false
};

// DOM Elements
const els = {
    formSection: document.querySelector('section:first-of-type'),
    historySection: document.querySelector('section:last-of-type'),
    dateDisplay: document.getElementById("dateDisplay"),
    dateInput: document.getElementById("dateInput"),
    typeGlider: document.getElementById("typeGlider"),
    typeInputs: document.querySelectorAll('input[name="txnType"]'),
    typeLabels: {
        in: document.querySelector('label[for="typeIn"]'),
        out: document.querySelector('label[for="typeOut"]'),
        fx: document.querySelector('label[for="typeFx"]'),
    },
    amountSign: document.getElementById("amountSign"),
    amountInput: document.getElementById("amountInput"),
    currencyInput: document.getElementById("currencyInput"),
    amountLabel: document.getElementById("amountLabel"), // Added label ref
    fxBlock: document.getElementById("fxBlock"),
    fxRateInput: document.getElementById("fxRateInput"),
    fxCurrencyInput: document.getElementById("fxCurrencyInput"),
    fxTotalDisplay: document.getElementById("fxTotalDisplay"),
    counterpartyInput: document.getElementById("counterpartyInput"),
    commentInput: document.getElementById("commentInput"),
    photoLabel: document.getElementById("photoLabel"),
    photoInput: document.getElementById("photoInput"),
    photoPreviewWrap: document.getElementById("photoPreviewWrap"),
    photoPreviewImg: document.getElementById("photoPreviewImg"),
    photoRemoveBtn: document.getElementById("photoRemoveBtn"),
    saveBtn: document.getElementById("saveBtn"),
    saveBtnText: document.getElementById("saveBtnText"),
    historyCount: document.getElementById("historyCount"),
    historyList: document.getElementById("historyList"),
    statusPill: document.getElementById("statusPill"),
    amountError: document.getElementById("amountError"),
    counterpartyError: document.getElementById("counterpartyError"),
    commentError: document.getElementById("commentError"),
};

/****************
 * API HELPERS
 ****************/
async function apiPost(payload) {
    // SECURITY: Always attach initData if available
    if (state.initData) {
        payload.initData = state.initData;
    }
    // Legacy support or local testing fallback
    if (state.userId && !payload.user_id) payload.user_id = state.userId;
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
        });
        const text = await res.text();
        return JSON.parse(text);
    } catch (e) {
        console.error("API Error:", e);
        // Return actual error detail for debugging
        return { ok: false, error: "network_error", details: e.toString() };
    }
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

/****************
 * UTILS
 ****************/
const formatNumberString = (raw) => {
    let clean = raw.replace(/[^\d,]/g, '');
    const parts = clean.split(',');
    if (parts.length > 2) clean = parts[0] + ',' + parts.slice(1).join('');
    const [int, dec] = clean.split(',');
    const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    if (dec !== undefined) return `${intFormatted},${dec.slice(0, 2)}`;
    if (raw.endsWith(',')) return `${intFormatted},`;
    return intFormatted;
};

const handleInputWithFormat = (e, callback) => {
    const input = e.target;
    const cursor = input.selectionStart;
    const oldVal = input.value;
    const digitsBefore = oldVal.slice(0, cursor).replace(/[^\d,]/g, '').length;
    const newVal = formatNumberString(oldVal);
    input.value = newVal;
    if (callback) callback(newVal);
    let newCursor = 0;
    let digitsSeen = 0;
    for (let i = 0; i < newVal.length; i++) {
        if (digitsSeen >= digitsBefore) break;
        const char = newVal[i];
        if (/[0-9,]/.test(char)) digitsSeen++;
        newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
};

const parseNumber = (val) => {
    if (!val) return 0;
    return parseFloat(val.replace(/\s/g, '').replace(',', '.'));
};

const showStatus = (msg, isError = false) => {
    if (!els.statusPill) return;
    els.statusPill.innerHTML = `<span>${msg}</span>`;
    els.statusPill.className = `flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${isError ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'}`;
};

// Helper for Date Display
function updateDateDisplay() {
    if (!els.dateInput.value) return;
    const [y, m, d] = els.dateInput.value.split('-');
    els.dateDisplay.textContent = `${d}.${m}.${y}`;
    state.date = els.dateInput.value;
}

/****************
 * INIT logic
 ****************/
function initApp() {
    // 1. Setup default UI immediately (Non-blocking)
    els.dateInput.value = new Date().toISOString().slice(0, 10);
    updateDateDisplay();
    updateTheme();

    // 2. Resolve User ID
    if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();
        // Capture raw initData for Auth
        state.initData = tg.initData;

        if (tg.initDataUnsafe?.user?.id) {
            state.userId = String(tg.initDataUnsafe.user.id);
        }
        const p = tg.themeParams;
        if (p?.bg_color) {
            document.documentElement.style.setProperty('--tg-theme-bg-color', p.bg_color);
        }
    }

    // 3. Background Load
    if (state.userId) {
        showStatus("Загрузка...", false);
        loadHistory();
    } else {
        showStatus("Не подключен", true);
        state.access = false;
        renderHistoryError("Не подключен. Откройте через Telegram.");
    }
}

// ... loadHistory ...

/****************
 * THEME & FORM LOGIC
 ****************/
const updateTheme = () => {
    const t = state.type;
    const idx = ['in', 'out', 'fx'].indexOf(t);
    els.typeGlider.style.transform = `translateX(${idx * 100}%)`;

    ['in', 'out', 'fx'].forEach(k => {
        const lbl = els.typeLabels[k];
        if (k === t) {
            lbl.className = "flex-1 h-full flex items-center justify-center cursor-pointer z-10 transition-colors duration-200 text-white font-semibold";
        } else {
            lbl.className = "flex-1 h-full flex items-center justify-center cursor-pointer z-10 transition-colors duration-200 text-tg-hint hover:text-tg-text";
        }
    });

    // Colors
    const setColors = (cls, bgCls) => {
        // Glider
        els.typeGlider.className = `absolute top-1 bottom-1 w-1/3 rounded-xl shadow-sm transition-all duration-300 ease-out ${bgCls}`;

        els.amountInput.className = `w-full bg-tg-secondaryBg p-3 rounded-xl border border-transparent focus:outline-none transition-colors text-[16px] pl-6 ${cls}`;
        els.saveBtn.className = `w-full py-3 rounded-xl text-[16px] text-white shadow-lg active:scale-95 transition-all mt-2 font-medium ${bgCls}`;
        els.photoLabel.className = `flex items-center gap-3 p-3 rounded-xl border border-dashed border-tg-hint/30 cursor-pointer transition-colors bg-tg-secondaryBg text-tg-hint hover:text-tg-text hover:border-${cls.split('-')[1]}-400`;
    };

    if (t === 'in') {
        els.amountSign.textContent = "+";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-green-500";
        els.amountLabel.textContent = "Сумма";
        els.fxBlock.classList.add("hidden");
        setColors('text-green-500', 'bg-green-500');
    } else if (t === 'out') {
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-red-500";
        els.amountLabel.textContent = "Сумма";
        els.fxBlock.classList.add("hidden");
        setColors('text-red-500', 'bg-red-500');
    } else { // fx
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-blue-500";
        els.amountLabel.textContent = "Сумма (Отдаю)";
        els.fxBlock.classList.remove("hidden");
        setColors('text-blue-500', 'bg-blue-500');
    }
};

async function loadHistory() {
    state.loading = true;

    // We don't block UI. User can type.
    const res = await apiPost({ action: "get_transactions" });
    state.loading = false;

    if (res.ok) {
        state.access = true;
        state.history = res.items || [];
        state.user = res.user;
        renderHistory();
        showStatus("Онлайн", false);
    } else {
        state.access = false;

        let msg = "Нет доступа";
        if (res.error === "network_error") msg = "Не подключен";
        else if (res.error === "setup_required") msg = "Обратитесь к администратору, регистрация не завершена";
        else if (res.error === "disabled" || res.error === "access_denied") msg = "Ошибка доступа";

        showStatus(msg, true);
        renderHistoryError(msg);
    }
}

function renderHistoryError(msg) {
    els.historyList.innerHTML = `<div class="history-error">${msg}</div>`;
}

/****************
 * THEME & FORM LOGIC
 ****************/
// Duplicate updateTheme removed

const checkFxCurrencyLogic = () => {
    if (els.currencyInput.value !== 'UZS') {
        if (!els.fxCurrencyInput.querySelector('option[value="UZS"]')) {
            const opt = document.createElement('option');
            opt.value = "UZS";
            opt.textContent = "UZS";
            els.fxCurrencyInput.add(opt, 0);
        }
        els.fxCurrencyInput.value = 'UZS';
        els.fxCurrencyInput.disabled = true;
    } else {
        els.fxCurrencyInput.disabled = false;
    }
    calculateFx();
};

const calculateFx = () => {
    if (state.type !== 'fx') return;
    const amt = parseNumber(state.amount);
    const rate = parseNumber(state.fxRate);
    if (!amt || !rate) {
        els.fxTotalDisplay.textContent = `Итого: + 0,00 ${els.fxCurrencyInput.value}`;
        return;
    }
    let res = 0;
    if (els.currencyInput.value !== 'UZS' && els.fxCurrencyInput.value === 'UZS') {
        res = amt * rate;
    } else if (els.currencyInput.value === 'UZS' && els.fxCurrencyInput.value !== 'UZS') {
        res = amt / rate;
    } else {
        res = amt * rate;
    }
    els.fxTotalDisplay.textContent = `Итого: + ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(res)} ${els.fxCurrencyInput.value}`;
};

// Events
els.dateInput.addEventListener('change', () => {
    const [y, m, d] = els.dateInput.value.split('-');
    els.dateDisplay.textContent = `${d}.${m}.${y}`;
    state.date = els.dateInput.value;
});
els.typeInputs.forEach(inp => inp.addEventListener('change', () => { state.type = inp.value; updateTheme(); calculateFx(); }));
els.amountInput.addEventListener('input', (e) => handleInputWithFormat(e, (val) => { state.amount = val; calculateFx(); }));
els.currencyInput.addEventListener('change', () => { state.currency = els.currencyInput.value; checkFxCurrencyLogic(); });
els.fxRateInput.addEventListener('input', (e) => handleInputWithFormat(e, (val) => { state.fxRate = val; calculateFx(); }));
els.fxCurrencyInput.addEventListener('change', () => { state.fxCurrency = els.fxCurrencyInput.value; calculateFx(); });
els.photoInput.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) {
        state.photo = f;
        const reader = new FileReader();
        reader.onload = (ev) => {
            els.photoPreviewImg.src = ev.target.result;
            els.photoPreviewWrap.classList.remove('hidden');
            els.photoLabel.classList.add('hidden');
        };
        reader.readAsDataURL(f);
    }
});
els.photoRemoveBtn.addEventListener('click', () => {
    state.photo = null;
    els.photoInput.value = "";
    els.photoPreviewWrap.classList.add('hidden');
    els.photoLabel.classList.remove('hidden');
});

/****************
 * SAVE (Optimistic)
 ****************/
els.saveBtn.addEventListener('click', async () => {
    if (!state.userId) return;

    // Reset Errors
    els.amountError.classList.add('hidden');
    els.counterpartyError.classList.add('hidden');
    els.commentError.classList.add('hidden');

    // Check Access
    if (state.access === false) {
        showStatus("Нет доступа к сохранению", true);
        return;
    }
    if (state.access === null) {
        showStatus("Подождите загрузки доступа...", true);
        return;
    }

    let hasError = false;
    if (!state.amount || parseNumber(state.amount) === 0) {
        els.amountError.classList.remove('hidden');
        hasError = true;
    }
    if (!els.counterpartyInput.value.trim()) {
        els.counterpartyError.classList.remove('hidden');
        hasError = true;
    }
    if (!els.commentInput.value.trim()) {
        els.commentError.classList.remove('hidden');
        hasError = true;
    }

    if (hasError) return;

    // 1. Prepare Payload
    const [y, m, d] = state.date.split('-');
    const dateFormatted = `${d}.${m}.${y}`;
    const payload = {
        action: "save_transaction",
        user_id: state.userId,
        type: state.type,
        date: dateFormatted,
        currency: els.currencyInput.value,
        amount_raw: state.amount.replace(/\s/g, ''),
        counterparty: els.counterpartyInput.value.trim(),
        comment: els.commentInput.value.trim()
    };
    if (state.type === 'fx') {
        payload.fx_rate_raw = state.fxRate.replace(/\s/g, '');
        payload.fx_currency = els.fxCurrencyInput.value;
    }
    let photoBase64 = null;
    if (state.photo) {
        try {
            const base64Full = await fileToBase64(state.photo);
            photoBase64 = base64Full.split(',')[1];
            payload.photo_base64 = photoBase64;
            payload.photo_filename = state.photo.name;
        } catch (e) { console.error(e); }
    }

    // 2. OPTIMISTIC UI
    const tempId = "temp_" + Date.now();
    const tempItem = {
        date: dateFormatted,
        type: state.type,
        amount_main: formatCurrency(parseNumber(state.amount), els.currencyInput.value),
        amount_sub: "",
        desc: payload.counterparty,
        comment: payload.comment,
        temp: true
    };

    state.history.unshift(tempItem);
    renderHistory();

    // UI Cleanup
    state.amount = "";
    els.amountInput.value = "";
    state.fxRate = "";
    els.fxRateInput.value = "";
    els.commentInput.value = "";
    els.counterpartyInput.value = "";
    state.photo = null;
    els.photoRemoveBtn.click();

    els.saveBtnText.textContent = "Сохраняется...";
    els.saveBtn.disabled = true;

    // 3. Send Request
    const res = await apiPost(payload);

    // 4. Handle Result
    if (res.ok) {
        els.saveBtnText.textContent = "Сохранено!";
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        await loadHistory();
    } else {
        els.saveBtnText.textContent = "Ошибка";
        if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        showStatus("Ошибка: " + (res.error || "unknown"), true);
        state.history = state.history.filter(x => x !== tempItem);
        renderHistory();
    }

    setTimeout(() => {
        els.saveBtnText.textContent = "Сохранить";
        els.saveBtn.disabled = false;
    }, 1500);
});

function renderHistory() {
    if (!state.history) return;
    els.historyCount.textContent = `${state.history.length}`;
    els.historyList.innerHTML = "";

    state.history.forEach(item => {
        const div = document.createElement('div');
        div.className = "bg-tg-secondaryBg p-3 rounded-2xl flex gap-3 items-center transition-all duration-300 relative overflow-hidden";

        if (item.temp) {
            div.classList.add("opacity-50", "animate-pulse");
        }

        let iconColor = 'text-gray-500';
        let iconBg = 'bg-gray-100';
        let arrow = '';

        const typeRaw = (item.type || "").toLowerCase();

        // 3. CORRECTED ARROWS: 
        // IN (Получил) -> DOWN arrow
        // OUT (Отдал) -> UP arrow
        if (typeRaw.includes('in') || typeRaw.includes('получил')) {
            iconColor = 'text-green-500';
            iconBg = 'bg-green-500/10';
            arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`;
        } else if (typeRaw.includes('out') || typeRaw.includes('отдал')) {
            iconColor = 'text-red-500';
            iconBg = 'bg-red-500/10';
            arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;
        } else { // FX
            iconColor = 'text-blue-500';
            iconBg = 'bg-blue-500/10';
            arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`;
        }

        const dateStr = item.date;
        const amountStr = item.amount_main;

        // 2. Row 1: Counterparty | Row 2: Comment
        const row1 = item.desc || "";
        const row2 = item.comment || "";

        div.innerHTML = `
            <div class="w-10 h-10 rounded-full ${iconBg} ${iconColor} flex items-center justify-center shrink-0">
                ${arrow}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center">
                    <span class="text-tg-text font-medium truncate pr-2">${row1 || "..."}</span>
                    <span class="text-tg-text font-semibold shrink-0 ${iconColor}">${amountStr}</span>
                </div>
                <div class="flex justify-between items-center mt-0.5">
                    <span class="text-[13px] text-tg-hint truncate w-[70%]">${row2}</span>
                    <span class="text-[11px] text-tg-hint shrink-0">${item.temp ? "..." : dateStr}</span>
                </div>
            </div>
        `;
        els.historyList.appendChild(div);
    });
}

function formatCurrency(val, cur) {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(val) + " " + cur;
}

// Init
initApp();
