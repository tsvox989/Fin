/***********************
 * Money Tracker — App.js
 * Integration: Google Apps Script Web App
 ***********************/

const API_URL = "https://script.google.com/macros/s/AKfycbxjVGERFEhHHe6gTCoq8VgbCJJar2zwdvPUJ6I78ANBwvdEkWP6qsHf3x_jE10TErCY/exec";

// STATE
const state = {
    // Auth
    userId: null,   // Telegram ID
    user: null,     // User info from server
    access: false,  // True if enabled

    // Form
    type: "in",     // "in" | "out" | "fx"
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "UZS",
    fxRate: "",
    fxCurrency: "USD",
    comment: "",
    photo: null,    // File object

    // Data
    history: [],
    loading: false
};

// DOM Elements
const els = {
    // Sections
    formSection: document.querySelector('section:first-of-type'),
    historySection: document.querySelector('section:last-of-type'),

    // Inputs
    dateDisplay: document.getElementById("dateDisplay"),
    dateInput: document.getElementById("dateInput"),

    // Type Switcher
    typeSeg: document.getElementById("typeSeg"),
    typeGlider: document.getElementById("typeGlider"),
    typeInputs: document.querySelectorAll('input[name="txnType"]'),
    typeLabels: {
        in: document.querySelector('label[for="typeIn"]'),
        out: document.querySelector('label[for="typeOut"]'),
        fx: document.querySelector('label[for="typeFx"]'),
    },

    amountLabel: document.getElementById("amountLabel"),
    amountSign: document.getElementById("amountSign"),
    amountInput: document.getElementById("amountInput"),
    currencyInput: document.getElementById("currencyInput"),

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
};

/****************
 * API HELPERS
 ****************/
async function apiPost(payload) {
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
        return { ok: false, error: "network_error" };
    }
}

// Convert File to Base64
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

    // Grouping
    const [int, dec] = clean.split(',');
    const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

    if (dec !== undefined) return `${intFormatted},${dec.slice(0, 2)}`;
    if (raw.endsWith(',')) return `${intFormatted},`;
    return intFormatted;
};

// Cursor Preservation Wrapper
const handleInputWithFormat = (e, callback) => {
    const input = e.target;
    // 1. Current cursor pos
    const cursor = input.selectionStart;
    const oldVal = input.value;

    // 2. Count digits before cursor
    const digitsBefore = oldVal.slice(0, cursor).replace(/[^\d,]/g, '').length;

    // 3. Format
    const newVal = formatNumberString(oldVal);
    input.value = newVal;

    if (callback) callback(newVal);

    // 4. Restore cursor
    // Find position where we have same number of digits
    let newCursor = 0;
    let digitsSeen = 0;
    for (let i = 0; i < newVal.length; i++) {
        if (digitsSeen >= digitsBefore) break;
        const char = newVal[i];
        if (/[0-9,]/.test(char)) digitsSeen++;
        newCursor++;
    }

    // Ensure we don't jump inside spaces oddly if possible, but basic digit count is robust enough
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

/****************
 * AUTH & HISTORY
 ****************/
async function initApp() {
    // Default Date
    els.dateInput.value = new Date().toISOString().slice(0, 10);
    updateDateDisplay();

    // 1. Get User ID
    if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        if (tg.initDataUnsafe?.user?.id) {
            state.userId = String(tg.initDataUnsafe.user.id);
        }

        // Theme
        const p = tg.themeParams;
        if (p?.bg_color) {
            document.documentElement.style.setProperty('--tg-theme-bg-color', p.bg_color);
        }
    }

    if (!state.userId) {
        showStatus("Не подключен", true);
        els.historyList.innerHTML = `<div class="history-error">Не подключен<br><span class="text-[12px] opacity-70">Откройте через Telegram</span></div>`;
        els.formSection.classList.add("opacity-50", "pointer-events-none");
        return;
    }

    showStatus("Подключение...", false);
    await loadHistory();
}

async function loadHistory() {
    state.loading = true;
    const res = await apiPost({ action: "get_transactions" });
    state.loading = false;

    if (res.ok) {
        state.access = true;
        state.history = res.items || [];
        state.user = res.user;
        renderHistory();
        showStatus("Онлайн", false);
        els.formSection.classList.remove("opacity-50", "pointer-events-none");
    } else {
        state.access = false;
        els.formSection.classList.add("opacity-50", "pointer-events-none");

        const msg = res.error === "network_error" ? "Не подключен" : "Ошибка доступа";
        showStatus(msg, true);
        els.historyList.innerHTML = `<div class="history-error">${msg}</div>`;
    }
}

/****************
 * THEME & LOGIC
 ****************/
const updateTheme = () => {
    const t = state.type;

    // Glider Position
    if (t === 'in') els.typeGlider.style.transform = 'translateX(0%)';
    else if (t === 'out') els.typeGlider.style.transform = 'translateX(100%)'; // approximate 
    else els.typeGlider.style.transform = 'translateX(200%)';

    // Fix glider calc: container has padding 4px (p-1). 
    // Width is calc(33.33% - 4px).
    // Left offsets: 0%, 100% + gap? It's easier to use left property or just translation steps.
    // CSS grid/flex gap logic: 
    // Let's rely on simple percentage steps if width is exactly 1/3.
    // Actually, container is flex. item flex-1.
    // Let's use simple left/transform logic.
    // Width is roughly 33%.
    // Translation: 0%, 100%, 200% relative to self width? Yes if margins match.
    // Let's assume the glider CSS I wrote in HTML (w-[calc(33.33%-4px)]) works with simple transforms
    // if I manually adjust the left offset for each position via class or style.

    // Better Glider Sync:
    const step = 100; // %
    // Adjust based on gap logic used in HTML? I used p-1, but no gap on flex container in new HTML?
    // Start index
    const idx = ['in', 'out', 'fx'].indexOf(t);
    // There is no gap in my HTML replacement, just flex-1. 
    // So translateX(100% * idx) should work perfectly.
    // But I added specific padding.
    // Actually, simpler:
    els.typeGlider.style.left = '4px'; // Base offset from p-1
    // The width is calculated.
    // Just move it:
    els.typeGlider.style.transform = `translateX(${idx * 100}%)`;

    // Active Text Colors
    ['in', 'out', 'fx'].forEach(k => {
        const lbl = els.typeLabels[k];
        if (k === t) {
            lbl.className = "flex-1 h-full flex items-center justify-center cursor-pointer z-10 transition-colors duration-200 text-tg-text font-semibold";
        } else {
            lbl.className = "flex-1 h-full flex items-center justify-center cursor-pointer z-10 transition-colors duration-200 text-tg-hint hover:text-tg-text";
        }
    });

    // Inputs & Signs
    const setColors = (cls) => {
        els.amountInput.className = `w-full bg-tg-secondaryBg p-3 rounded-xl border border-transparent focus:outline-none transition-colors text-[16px] pl-6 ${cls}`;
        els.saveBtn.className = `w-full py-3 rounded-xl text-[16px] text-white shadow-lg active:scale-95 transition-all mt-2 font-medium ${cls.replace('text-', 'bg-')}`;
        // Photo border
        els.photoLabel.className = `flex items-center gap-3 p-3 rounded-xl border border-dashed border-tg-hint/30 cursor-pointer transition-colors bg-tg-secondaryBg text-tg-hint hover:text-tg-text hover:border-${cls.split('-')[1]}-400`;
    };

    if (t === 'in') {
        els.amountSign.textContent = "+";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-green-500";
        els.amountLabel.textContent = "Сумма";
        els.fxBlock.classList.add("hidden");
        setColors('text-green-500');
    } else if (t === 'out') {
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-red-500";
        els.amountLabel.textContent = "Сумма";
        els.fxBlock.classList.add("hidden");
        setColors('text-red-500');
    } else { // fx
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-blue-500";
        els.amountLabel.textContent = "Сумма (Отдаю)";
        els.fxBlock.classList.remove("hidden");
        setColors('text-blue-500');
    }
};

const checkFxCurrencyLogic = () => {
    // Rule: If currency != UZS -> Receive currency must be UZS.
    // If currency == UZS -> Receive currency can be anything (USD/EUR etc).

    if (els.currencyInput.value !== 'UZS') {
        // Force FX currency to UZS and lock it
        els.fxCurrencyInput.value = 'UZS';
        // HTML doesn't have UZS in fxCurrencyInput by default in my previous snippet? 
        // Wait, index.html options are USD/EUR/rub/kzt. I should add UZS or inject it.
        // Or just show "UZS" text and hide select.

        // Let's add UZS option dynamically if missing, or just force value if it exists?
        // Actually best UX: Lock the select and show it's UZS.

        // Ensure UZS option exists
        if (!els.fxCurrencyInput.querySelector('option[value="UZS"]')) {
            const opt = document.createElement('option');
            opt.value = "UZS";
            opt.textContent = "UZS";
            els.fxCurrencyInput.add(opt, 0);
        }

        els.fxCurrencyInput.value = 'UZS';
        els.fxCurrencyInput.disabled = true;
    } else {
        // Unlock
        els.fxCurrencyInput.disabled = false;
        // If it was stuck on UZS, user might want to change.
        // Remove UZS from list if we want to strictly follow "Foreign currency" logic?
        // User said: "if currency = UZS -> get in foreign currency".
        // This implies FX target shouldn't be UZS?
        // But let's leave it flexible unless strictly forbidden.
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
    // Simple logic: Amount * Rate (if we treat rate as UZS/Unit ?)
    // Label says: "Курс (UZS за 1 ед.)"
    // Case 1: Selling USD (Amount=100 USD). Rate=12800. Total = 1,280,000 UZS.
    // Case 2: Buying USD (Amount=1,280,000 UZS). Rate=12800. Total = 100 USD.

    if (els.currencyInput.value !== 'UZS' && els.fxCurrencyInput.value === 'UZS') {
        // Selling Foreign, Getting UZS
        // Amount (Forex) * Rate = UZS
        res = amt * rate;
    } else if (els.currencyInput.value === 'UZS' && els.fxCurrencyInput.value !== 'UZS') {
        // Buying Foreign, Giving UZS
        // Amount (UZS) / Rate = Forex
        res = amt / rate;
    } else {
        // Cross rate? Or UZS->UZS?
        // Fallback multiplicative
        res = amt * rate;
    }

    els.fxTotalDisplay.textContent = `Итого: + ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(res)} ${els.fxCurrencyInput.value}`;
};

/****************
 * EVENTS
 ****************/

// Date
const updateDateDisplay = () => {
    if (!els.dateInput.value) return;
    const [y, m, d] = els.dateInput.value.split('-');
    els.dateDisplay.textContent = `${d}.${m}.${y}`;
    state.date = els.dateInput.value;
};
els.dateInput.addEventListener('change', updateDateDisplay);
// Trigger once
updateDateDisplay();

// Type Switch
els.typeInputs.forEach(inp => {
    inp.addEventListener('change', () => {
        state.type = inp.value;
        updateTheme();
        calculateFx();
    });
});

// Amount
els.amountInput.addEventListener('input', (e) => {
    handleInputWithFormat(e, (val) => {
        state.amount = val;
        calculateFx();
    });
});

// Currency
els.currencyInput.addEventListener('change', () => {
    state.currency = els.currencyInput.value;
    checkFxCurrencyLogic();
});

// FX
els.fxRateInput.addEventListener('input', (e) => {
    handleInputWithFormat(e, (val) => {
        state.fxRate = val;
        calculateFx();
    });
});
els.fxCurrencyInput.addEventListener('change', () => {
    state.fxCurrency = els.fxCurrencyInput.value;
    calculateFx();
});

// Photo
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
 * SAVE
 ****************/
els.saveBtn.addEventListener('click', async () => {
    if (!state.userId) return;

    // Validate
    if (!state.amount || parseNumber(state.amount) === 0) {
        alert("Введите сумму");
        return;
    }
    if (!els.counterpartyInput.value.trim()) {
        alert("Введите контрагента");
        return;
    }

    els.saveBtnText.textContent = "Сохраняется...";
    els.saveBtn.disabled = true;

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

    if (state.photo) {
        try {
            const base64Full = await fileToBase64(state.photo);
            payload.photo_base64 = base64Full.split(',')[1];
            payload.photo_filename = state.photo.name;
            payload.photo_mime = state.photo.type;
        } catch (e) { console.error(e); }
    }

    const res = await apiPost(payload);

    if (res.ok) {
        els.saveBtnText.textContent = "Сохранено!";
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        await loadHistory();

        // Reset
        state.amount = "";
        els.amountInput.value = "";
        state.fxRate = "";
        els.fxRateInput.value = "";
        els.commentInput.value = "";
        els.counterpartyInput.value = "";
        state.photo = null;
        els.photoRemoveBtn.click();

        setTimeout(() => {
            els.saveBtnText.textContent = "Сохранить";
            els.saveBtn.disabled = false;
        }, 1500);

    } else {
        els.saveBtnText.textContent = "Ошибка";
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
        alert("Ошибка: " + (res.error || "unknown"));
        setTimeout(() => {
            els.saveBtnText.textContent = "Сохранить";
            els.saveBtn.disabled = false;
        }, 1500);
    }
});

function renderHistory() {
    if (!state.history) return;
    els.historyCount.textContent = `${state.history.length}`;
    els.historyList.innerHTML = "";

    // Sort by date desc (if not already)
    // Assuming backend returns sorted, but we can prepend.

    state.history.forEach(item => {
        const div = document.createElement('div');
        div.className = "bg-tg-secondaryBg p-3 rounded-2xl flex gap-3 items-center";

        let iconColor = 'text-gray-500';
        let iconBg = 'bg-gray-100';
        let arrow = '';

        const typeRaw = (item.type || "").toLowerCase();

        // Determine icons
        // Server might return "in", "out", "fx" or Russian. 
        // User pointed out: "Получил" vs "in".
        // Let's robust match.

        if (typeRaw.includes('in') || typeRaw.includes('получил')) {
            iconColor = 'text-green-500';
            iconBg = 'bg-green-500/10';
            arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;
        } else if (typeRaw.includes('out') || typeRaw.includes('отдал')) {
            iconColor = 'text-red-500';
            iconBg = 'bg-red-500/10';
            arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`;
        } else { // FX
            iconColor = 'text-blue-500';
            iconBg = 'bg-blue-500/10';
            arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`;
        }

        const dateStr = item.date; // already formatted?
        const amountStr = item.amount_main;
        const subStr = item.amount_sub || item.counterparty || "";

        div.innerHTML = `
            <div class="w-10 h-10 rounded-full ${iconBg} ${iconColor} flex items-center justify-center shrink-0">
                ${arrow}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center">
                    <span class="text-tg-text font-medium truncate pr-2">${item.desc || (item.type || "Запись")}</span>
                    <span class="text-tg-text font-semibold shrink-0 ${iconColor}">${amountStr}</span>
                </div>
                <div class="flex justify-between items-center mt-1">
                    <span class="text-[13px] text-tg-hint truncate w-2/3">${subStr}</span>
                    <span class="text-[12px] text-tg-hint shrink-0">${dateStr}</span>
                </div>
            </div>
        `;
        els.historyList.appendChild(div);
    });
}

// Init
initApp();
updateTheme(); // set initial glitch state
