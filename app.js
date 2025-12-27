/***********************
 * Money Tracker — App.js
 * Integration: Google Apps Script Web App
 ***********************/

// UPDATED URL
const API_URL = "https://script.google.com/macros/s/AKfycbxfPN5n9Tc38uS9GnQxFh5LMYpmNfEYMHs0VzfHtc28iteEcLZIFnbNtHGrU4Byen5G/exec";

// STATE
const state = {
    userId: null,
    user: null,
    initData: null, // Raw Telegram initData
    access: null,   // null = checking, true = allowed, false = denied

    // Form
    type: "in",
    date: new Date().toISOString().slice(0, 10),
    account: "",       // Normal Mode Account
    category: "",      // Normal Mode Category
    fromAccount: "",   // FX Mode From Account
    toAccount: "",     // FX Mode To Account
    amount: "",
    currency: "",
    toCurrency: "",    // FX Mode target currency
    fxRate: "",
    fxCurrency: "USD",
    comment: "",
    photos: [], // Array of { file, base64, name }

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
    currencyDisplay: document.getElementById("currencyDisplay"),
    amountLabel: document.getElementById("amountLabel"),
    accountInput: document.getElementById("accountInput"),
    categoryInput: document.getElementById("categoryInput"),
    fromAccountInput: document.getElementById("fromAccountInput"),
    toAccountInput: document.getElementById("toAccountInput"),
    normalFields: document.getElementById("normalFields"),
    fxFields: document.getElementById("fxFields"),
    fxResultTip: document.getElementById("fxResultTip"),
    fxBlock: document.getElementById("fxBlock"), // Still referenced for theme colors but UI logic changed
    fxRateInput: document.getElementById("fxRateInput"),
    fxCurrencyInput: document.getElementById("fxCurrencyInput"),
    fxTotalDisplay: document.getElementById("fxTotalDisplay"),
    counterpartyInput: document.getElementById("counterpartyInput"),
    commentInput: document.getElementById("commentInput"),
    photoLabel: document.getElementById("photoLabel"),
    photoInput: document.getElementById("photoInput"),
    photoList: document.getElementById("photoList"),
    saveBtn: document.getElementById("saveBtn"),
    saveBtnText: document.getElementById("saveBtnText"),
    historyCount: document.getElementById("historyCount"),
    historyList: document.getElementById("historyList"),
    statusPill: document.getElementById("statusPill"),
    counterpartySuggestions: document.getElementById("counterpartySuggestions"),
    commentSuggestions: document.getElementById("commentSuggestions"),
    textMeasure: document.getElementById("textMeasure"),
    amountError: document.getElementById("amountError"),
    dateError: document.getElementById("dateError"),
    accountError: document.getElementById("accountError"),
    categoryError: document.getElementById("categoryError"),
    fromAccountError: document.getElementById("fromAccountError"),
    toAccountError: document.getElementById("toAccountError"),
    fxRateError: document.getElementById("fxRateError"),
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
    validateForm();
}

function validateForm() {
    let isValid = true;
    if (!state.date) isValid = false;

    if (state.type === 'fx') {
        if (!els.fromAccountInput.value) isValid = false;
        if (!els.toAccountInput.value) isValid = false;
        const rate = parseNumber(state.fxRate);
        if (!rate || rate === 0) isValid = false;
    } else {
        if (!els.accountInput.value) isValid = false;
        if (!els.categoryInput.value) isValid = false;
    }

    if (!state.amount || parseNumber(state.amount) === 0) isValid = false;
    if (!els.counterpartyInput.value.trim()) isValid = false;
    if (!els.commentInput.value.trim()) isValid = false;

    if (els.saveBtn.disabled && els.saveBtnText.textContent.includes("...")) return;

    if (isValid) {
        els.saveBtnText.textContent = "Сохранить";
        els.saveBtn.classList.remove('opacity-50');
    } else {
        els.saveBtnText.textContent = "Заполните все поля";
        // els.saveBtn.classList.add('opacity-50');
    }
}

function getFrequencyMap(field) {
    const map = {};
    if (!state.history) return map;

    state.history.forEach(item => {
        // Source data comes from getTransactions_ in core.gs
        // desc mapping to cnt (item.desc), comment mapping to comm (item.comment)
        const val = field === 'desc' ? item.desc : item.comment;
        if (!val || typeof val !== 'string') return;
        const normalized = val.trim();
        if (!normalized) return;
        map[normalized] = (map[normalized] || 0) + 1;
    });
    return map;
}

function showSuggestions(inputEl, containerEl, field) {
    const val = inputEl.value;
    const query = val.trim().toLowerCase();
    containerEl.innerHTML = "";

    if (query.length < 2) return;

    // MEASURE POSITION
    els.textMeasure.textContent = val;
    const textWidth = els.textMeasure.offsetWidth;

    // Constraint: Max allowable left position so list doesn't overflow right
    // Width of a chip is roughly 100-150px.
    const containerWidth = 140;
    const maxMove = inputEl.offsetWidth - containerWidth;
    const moveX = Math.min(textWidth + 12, maxMove);

    containerEl.style.left = `${moveX}px`;
    // If it's a textarea, suggestions appear below the current text line
    if (inputEl.tagName === 'TEXTAREA') {
        containerEl.style.top = `${inputEl.offsetHeight}px`;
    }

    const freqMap = getFrequencyMap(field);
    const matches = Object.keys(freqMap)
        .filter(key => key.toLowerCase().includes(query) && freqMap[key] >= 2)
        .sort((a, b) => freqMap[b] - freqMap[a]);

    matches.slice(0, 4).forEach(text => {
        const btn = document.createElement('button');
        btn.type = "button";
        btn.className = "px-3 py-1.5 bg-blue-500 rounded-lg text-[11px] text-white whitespace-nowrap active:scale-95 transition-all shadow-md font-medium pointer-events-auto text-left w-full border border-white/10";
        btn.innerHTML = `${text} <span class="opacity-60 text-[9px] float-right ml-2">${freqMap[text]}</span>`;
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputEl.value = text;
            containerEl.innerHTML = "";
            if (inputEl.tagName === 'TEXTAREA') {
                inputEl.style.height = 'auto';
                inputEl.style.height = inputEl.scrollHeight + 'px';
            }
            validateForm();
        };
        containerEl.appendChild(btn);
    });
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
        // Glider - use exact width matching the labels (inner width minus padding / 3)
        els.typeGlider.className = `absolute top-1 bottom-1 w-[calc((100%-8px)/3)] rounded-lg shadow-sm transition-all duration-300 ease-out ${bgCls}`;

        els.amountInput.className = `w-full bg-tg-secondaryBg p-3 rounded-xl border border-[hsla(0,0%,50%,0.1)] focus:outline-none transition-colors text-[16px] pl-6 ${cls}`;
        els.fxRateInput.className = `w-full bg-tg-secondaryBg p-3 rounded-xl border border-[hsla(0,0%,50%,0.1)] focus:outline-none transition-colors text-[16px] ${cls}`;
        els.saveBtn.className = `w-full py-3 rounded-xl text-[16px] text-white shadow-lg active:scale-95 transition-all mt-2 font-medium ${bgCls}`;
        els.photoLabel.className = `flex items-center gap-3 p-3 rounded-xl border border-dashed border-[hsla(0,0%,50%,0.1)] cursor-pointer transition-colors bg-tg-secondaryBg text-tg-hint hover:text-tg-text hover:border-${cls.split('-')[1]}-400`;
    };

    if (t === 'in') {
        els.amountSign.textContent = "+";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-green-500";
        els.amountLabel.textContent = "Сумма";
        els.fxFields.classList.add("hidden");
        els.normalFields.classList.remove("hidden");
        els.fxResultTip.classList.add("hidden");
        setColors('text-green-500', 'bg-green-500');
    } else if (t === 'out') {
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-red-500";
        els.amountLabel.textContent = "Сумма";
        els.fxFields.classList.add("hidden");
        els.normalFields.classList.remove("hidden");
        els.fxResultTip.classList.add("hidden");
        setColors('text-red-500', 'bg-red-500');
    } else { // fx
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-red-500";
        els.amountLabel.textContent = "Сумма (Отдаю)";
        els.normalFields.classList.add("hidden");
        els.fxFields.classList.remove("hidden");
        // Digits are RED (Giving money), but Button/Theme remains BLUE (Exchange action)
        setColors('text-red-500', 'bg-blue-500');
    }
    validateForm();
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
        populateDropdowns();
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

function populateDropdowns() {
    if (!state.user) return;

    const accStr = state.user.txn_acc || "";
    const accounts = accStr.split(',').map(s => s.trim()).filter(s => s);

    const populate = (el, placeholder) => {
        el.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
        accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc;
            opt.textContent = acc;
            el.appendChild(opt);
        });
    };

    populate(els.accountInput, "Выберите счет");
    populate(els.fromAccountInput, "Откуда снимаем");
    populate(els.toAccountInput, "Куда зачисляем");

    const catStr = state.user.txn_cat || "";
    const categories = catStr.split(',').map(s => s.trim()).filter(s => s);

    els.categoryInput.innerHTML = '<option value="" disabled selected>Выберите категорию</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        els.categoryInput.appendChild(opt);
    });
}

function renderHistoryError(msg) {
    els.historyList.innerHTML = `<div class="history-error">${msg}</div>`;
}

/****************
 * THEME & FORM LOGIC
 ****************/
// Duplicate updateTheme removed

const checkFxCurrencyLogic = () => {
    // Currency derives from From/To accounts in FX, or primary Account in Normal
    calculateFx();
};

const calculateFx = () => {
    if (state.type !== 'fx') {
        els.fxResultTip.classList.add("hidden");
        return;
    }
    const amt = parseNumber(state.amount);
    const rate = parseNumber(state.fxRate);

    if (!amt || !rate) {
        els.fxResultTip.classList.add("hidden");
        return;
    }

    let res = 0;
    // Simple logic: FromAmt / Rate = ToAmt (if UZS) or FromAmt * Rate = ToAmt (if USD)
    // We follow common rule: Result = Amount * Rate (if common pair) or Amount / Rate
    // However, user said: "снизу зеленным будет напсиано сколько попадет на счет"
    // Let's assume Rate is multiplier for FromCurrency to get ToCurrency 
    // OR if From is UZS, Rate is division.
    if (state.currency === 'UZS') {
        res = amt / rate;
    } else {
        res = amt * rate;
    }

    els.fxResultTip.classList.remove("hidden");
    els.fxResultTip.textContent = `На счет попадет: + ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.abs(res))} ${state.toCurrency || '---'}`;
};

// Events
els.dateInput.addEventListener('change', () => {
    const [y, m, d] = els.dateInput.value.split('-');
    els.dateDisplay.textContent = `${d}.${m}.${y}`;
    state.date = els.dateInput.value;
});

els.typeInputs.forEach(inp => inp.addEventListener('change', () => {
    state.type = inp.value;
    updateTheme();
    calculateFx();
    validateForm();
}));

els.accountInput.addEventListener('change', () => {
    state.account = els.accountInput.value;
    const match = state.account.match(/\{([^}]+)\}/);
    state.currency = match ? match[1].toUpperCase() : "";
    els.currencyDisplay.value = state.currency || "---";
    validateForm();
});

els.fromAccountInput.addEventListener('change', () => {
    state.fromAccount = els.fromAccountInput.value;
    const match = state.fromAccount.match(/\{([^}]+)\}/);
    state.currency = match ? match[1].toUpperCase() : "";
    els.currencyDisplay.value = state.currency || "---";
    calculateFx();
    validateForm();
});

els.toAccountInput.addEventListener('change', () => {
    state.toAccount = els.toAccountInput.value;
    const match = state.toAccount.match(/\{([^}]+)\}/);
    state.toCurrency = match ? match[1].toUpperCase() : "";
    calculateFx();
    validateForm();
});

els.categoryInput.addEventListener('change', () => {
    state.category = els.categoryInput.value;
    validateForm();
});

els.amountInput.addEventListener('input', (e) => handleInputWithFormat(e, (val) => {
    state.amount = val;
    calculateFx();
    validateForm();
}));

els.fxRateInput.addEventListener('input', (e) => handleInputWithFormat(e, (val) => {
    state.fxRate = val;
    calculateFx();
    validateForm();
}));
els.counterpartyInput.addEventListener('input', () => {
    validateForm();
    showSuggestions(els.counterpartyInput, els.counterpartySuggestions, 'desc');
});

els.commentInput.addEventListener('input', () => {
    // Auto-expand logic
    els.commentInput.style.height = 'auto';
    els.commentInput.style.height = els.commentInput.scrollHeight + 'px';

    showSuggestions(els.commentInput, els.commentSuggestions, 'comm');
    validateForm();
});

els.photoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (state.photos.length + files.length > 6) {
        showStatus("Максимум 6 фото", true);
        return;
    }

    let currentTotalSize = state.photos.reduce((sum, p) => sum + p.file.size, 0);
    const incomingSize = files.reduce((sum, f) => sum + f.size, 0);

    if ((currentTotalSize + incomingSize) > 24 * 1024 * 1024) {
        showStatus("Лимит 24МБ превышен", true);
        return;
    }

    for (const f of files) {
        try {
            const base64Full = await fileToBase64(f);
            state.photos.push({
                file: f,
                name: f.name,
                base64: base64Full.split(',')[1],
                preview: base64Full
            });
        } catch (err) { console.error(err); }
    }

    els.photoInput.value = ""; // Clear for next selection
    renderPhotos();
});

function renderPhotos() {
    els.photoList.innerHTML = "";
    state.photos.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = "relative aspect-square rounded-xl overflow-hidden border border-black/10 group";
        div.innerHTML = `
            <img src="${p.preview}" class="w-full h-full object-cover" />
            <button type="button" class="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded-lg backdrop-blur-sm active:scale-90 transition-transform z-10" onclick="removePhoto(${idx})">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        `;
        els.photoList.appendChild(div);
    });

    if (state.photos.length >= 6) {
        els.photoLabel.classList.add('hidden');
    } else {
        els.photoLabel.classList.remove('hidden');
    }
}

window.removePhoto = (idx) => {
    state.photos.splice(idx, 1);
    renderPhotos();
};

/****************
 * SAVE (Optimistic)
 ****************/
els.saveBtn.addEventListener('click', async () => {
    if (!state.userId) return;

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
    if (!state.date) {
        els.dateError.classList.remove('hidden');
        hasError = true;
    } else {
        els.dateError.classList.add('hidden');
    }

    if (state.type === 'fx') {
        if (!els.fromAccountInput.value) {
            els.fromAccountError.classList.remove('hidden');
            hasError = true;
        } else {
            els.fromAccountError.classList.add('hidden');
        }
        if (!els.toAccountInput.value) {
            els.toAccountError.classList.remove('hidden');
            hasError = true;
        } else {
            els.toAccountError.classList.add('hidden');
        }
        if (!state.fxRate || parseNumber(state.fxRate) === 0) {
            els.fxRateError.classList.remove('hidden');
            hasError = true;
        } else {
            els.fxRateError.classList.add('hidden');
        }
    } else {
        if (!els.accountInput.value) {
            els.accountError.classList.remove('hidden');
            hasError = true;
        } else {
            els.accountError.classList.add('hidden');
        }
        if (!els.categoryInput.value) {
            els.categoryError.classList.remove('hidden');
            hasError = true;
        } else {
            els.categoryError.classList.add('hidden');
        }
    }

    if (!state.amount || parseNumber(state.amount) === 0) {
        els.amountError.classList.remove('hidden');
        hasError = true;
    } else {
        els.amountError.classList.add('hidden');
    }

    if (!els.counterpartyInput.value.trim()) {
        els.counterpartyError.classList.remove('hidden');
        hasError = true;
    } else {
        els.counterpartyError.classList.add('hidden');
    }

    if (!els.commentInput.value.trim()) {
        els.commentError.classList.remove('hidden');
        hasError = true;
    } else {
        els.commentError.classList.add('hidden');
    }

    if (hasError) return;

    // 1. Prepare Payload
    const [y, m, d] = state.date.split('-');
    const dateFormatted = `${d}.${m}.${y}`;
    const sign = (state.type === 'out' || state.type === 'fx') ? '-' : '';
    const payload = {
        action: "save_transaction",
        user_id: state.userId,
        type: state.type,
        date: dateFormatted,
        account: state.type === 'fx' ? state.fromAccount : state.account,
        account_to: state.type === 'fx' ? state.toAccount : "",
        category: state.type === 'fx' ? "" : state.category,
        currency: state.currency,
        amount_raw: sign + state.amount.replace(/\s/g, ''),
        counterparty: els.counterpartyInput.value.trim(),
        comment: els.commentInput.value.trim()
    };
    if (state.type === 'fx') {
        payload.fx_rate_raw = state.fxRate.replace(/\s/g, '');
        payload.fx_currency = state.toCurrency;
    }
    if (state.type === 'fx') {
        payload.fx_rate_raw = state.fxRate.replace(/\s/g, '');
        payload.fx_currency = els.fxCurrencyInput.value;
    }

    if (state.photos.length > 0) {
        payload.photos = state.photos.map(p => ({
            base64: p.base64,
            filename: p.name
        }));
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
    state.photos = [];
    renderPhotos();

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
    // Show positive value in UI as the sign is handled by the icon/color
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(val)) + " " + cur;
}

// Init
initApp();
