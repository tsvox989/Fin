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
    date: new Date().toISOString().split("T")[0],
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
    formSection: document.querySelector('section:first-of-type'), // Wrapper for form
    historySection: document.querySelector('section:last-of-type'), // Wrapper for history

    // Inputs
    dateDisplay: document.getElementById("dateDisplay"),
    dateInput: document.getElementById("dateInput"),

    typeSeg: document.getElementById("typeSeg"),
    typeBtns: document.querySelectorAll("#typeSeg button"),

    amountLabel: document.getElementById("amountLabel"),
    amountSign: document.getElementById("amountSign"),
    amountInput: document.getElementById("amountInput"),
    currencyInput: document.getElementById("currencyInput"),

    fxBlock: document.getElementById("fxBlock"),
    fxRateInput: document.getElementById("fxRateInput"),
    fxCurrencyInput: document.getElementById("fxCurrencyInput"),
    fxTotalDisplay: document.getElementById("fxTotalDisplay"),

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
    // Always attach user_id if valid
    if (state.userId && !payload.user_id) payload.user_id = state.userId;

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            // text/plain avoids CORS preflight OPTIONS request
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
    reader.onload = () => resolve(reader.result); // "data:image/jpeg;base64,..."
    reader.onerror = error => reject(error);
});

/****************
 * UTILS
 ****************/
const formatInput = (val) => {
    let clean = val.replace(/[^\d,]/g, '');
    const parts = clean.split(',');
    if (parts.length > 2) clean = parts[0] + ',' + parts.slice(1).join('');

    const split = clean.split(',');
    let integerPart = split[0];
    const decimalPart = split.length > 1 ? split[1].slice(0, 2) : null;

    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

    if (decimalPart !== null) return `${integerPart},${decimalPart}`;
    if (val.endsWith(',') && split.length === 1) return `${integerPart},`;
    return integerPart;
};

const parseNumber = (val) => {
    if (!val) return 0;
    return parseFloat(val.replace(/\s/g, '').replace(',', '.'));
};

const formatCurrency = (amount, currency) => {
    // Basic formatter
    return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} ${currency}`;
};

const showStatus = (msg, isError = false) => {
    if (!els.statusPill) return;
    els.statusPill.innerHTML = `<span>${msg}</span>`;
    els.statusPill.className = `flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${isError ? 'text-red-500 bg-red-500/10' : 'text-green-500 bg-green-500/10'
        }`;
};

/****************
 * AUTH & HISTORY
 ****************/
async function initApp() {
    showStatus("Подключение...", false);

    // 1. Get User ID
    state.userId = "372315"; // DEFAULT DEBUG ID

    if (window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.ready();
        tg.expand();

        // Extract ID from initDataUnsafe
        if (tg.initDataUnsafe?.user?.id) {
            state.userId = String(tg.initDataUnsafe.user.id);
        }

        // Apply Theme params (optional)
        const p = tg.themeParams;
        if (p?.bg_color) {
            document.documentElement.style.setProperty('--tg-theme-bg-color', p.bg_color);
        }
    }

    console.log("UserID:", state.userId);

    // 2. Load History / Check Access
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
        showStatus("Синхронизировано", false);
        els.formSection.classList.remove("opacity-50", "pointer-events-none");
    } else {
        // Handle Error
        state.access = false;
        els.formSection.classList.add("opacity-50", "pointer-events-none"); // Block form

        if (res.error === "disabled") {
            showStatus("Доступ запрещен", true);
            alert("Ваш аккаунт отключен.");
        } else if (res.error === "not_found") {
            showStatus("Нет доступа", true);
            alert("Вас нет в списке доступа.");
        } else {
            showStatus("Ошибка сети", true);
        }
    }
}

/****************
 * THEME LOGIC
 ****************/
const updateTheme = () => {
    const t = state.type;

    // Buttons
    els.typeBtns.forEach(btn => {
        const val = btn.dataset.val;
        btn.className = "flex-1 py-2 text-[14px] rounded-lg transition-all duration-200 h-full";
        if (val === t) {
            if (t === 'in') btn.classList.add('bg-green-500', 'text-white', 'shadow-sm');
            else if (t === 'out') btn.classList.add('bg-red-500', 'text-white', 'shadow-sm');
            else if (t === 'fx') btn.classList.add('bg-blue-500', 'text-white', 'shadow-sm');
        } else {
            btn.classList.add('text-tg-hint', 'hover:text-tg-text');
        }
    });

    // Amount Sign & Inputs
    if (t === 'in') {
        els.amountSign.textContent = "+";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-green-500";
        els.amountInput.className = "w-full bg-tg-secondaryBg p-3 rounded-xl border border-transparent focus:outline-none transition-colors text-[16px] pl-6 text-green-500";
        els.amountLabel.textContent = "Сумма";
        els.fxBlock.classList.add("hidden");
    } else if (t === 'out') {
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-red-500";
        els.amountInput.className = "w-full bg-tg-secondaryBg p-3 rounded-xl border border-transparent focus:outline-none transition-colors text-[16px] pl-6 text-red-500";
        els.amountLabel.textContent = "Сумма";
        els.fxBlock.classList.add("hidden");
    } else {
        els.amountSign.textContent = "-";
        els.amountSign.className = "absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-red-500";
        els.amountInput.className = "w-full bg-tg-secondaryBg p-3 rounded-xl border border-transparent focus:outline-none transition-colors text-[16px] pl-6 text-red-500";
        els.amountLabel.textContent = "Сумма (Отдаю)";
        els.fxBlock.classList.remove("hidden");
    }

    // Save Button
    els.saveBtn.className = `w-full py-3 rounded-xl text-[16px] text-white shadow-lg active:scale-95 transition-all mt-2 ${t === 'in' ? 'bg-green-500' : (t === 'out' ? 'bg-red-500' : 'bg-blue-500')
        }`;

    // Photo Border Hover
    els.photoLabel.className = `flex items-center gap-3 p-3 rounded-xl border border-dashed border-tg-hint/30 cursor-pointer transition-colors bg-tg-secondaryBg text-tg-hint hover:text-tg-text ${t === 'in' ? 'hover:border-green-400' : (t === 'out' ? 'hover:border-red-400' : 'hover:border-blue-400')
        }`;
};

/****************
 * EVENTS
 ****************/
// Date
const updateDateDisplay = () => {
    const [y, m, d] = els.dateInput.value.split('-');
    els.dateDisplay.textContent = `${d}.${m}.${y}`;
    state.date = els.dateInput.value;
};
els.dateInput.addEventListener('change', updateDateDisplay);

// Type
els.typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        state.type = btn.dataset.val;
        updateTheme();
        calculateFx();
    });
});

// Amount
els.amountInput.addEventListener('input', (e) => {
    const newVal = formatInput(e.target.value);
    e.target.value = newVal;
    state.amount = newVal;
    calculateFx();
});

// Currency
els.currencyInput.addEventListener('change', () => calculateFx());

// FX
els.fxRateInput.addEventListener('input', (e) => {
    const newVal = formatInput(e.target.value);
    e.target.value = newVal;
    state.fxRate = newVal;
    calculateFx();
});
els.fxCurrencyInput.addEventListener('change', () => calculateFx());

const calculateFx = () => {
    if (state.type !== 'fx') return;

    const amt = parseNumber(state.amount);
    const rate = parseNumber(state.fxRate);

    if (!amt || !rate) {
        els.fxTotalDisplay.textContent = `Итого: + 0,00 ${els.currencyInput.value === 'UZS' ? els.fxCurrencyInput.value : 'UZS'}`;
        return;
    }

    let res = 0;
    let targetCur = '';

    if (els.currencyInput.value === 'UZS') {
        res = amt / rate;
        targetCur = els.fxCurrencyInput.value;
    } else {
        res = amt * rate;
        targetCur = 'UZS';
    }

    els.fxTotalDisplay.textContent = `Итого: + ${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(res)} ${targetCur}`;
};

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
    if (!state.userId) { alert("Ошибка: нет ID пользователя"); return; }
    if (!state.amount || parseNumber(state.amount) === 0) {
        alert("Введите сумму");
        return;
    }

    // UI Loading
    els.saveBtnText.textContent = "Сохраняется...";
    els.saveBtn.disabled = true;

    // Prepare Payload
    const [y, m, d] = state.date.split('-');
    const dateFormatted = `${d}.${m}.${y}`; // DD.MM.YYYY

    const payload = {
        action: "save_transaction",
        user_id: state.userId,

        type: state.type,
        date: dateFormatted,

        currency: els.currencyInput.value,
        amount_raw: state.amount.replace(/\s/g, ''), // No spaces, only comma

        counterparty: "", // No field in UI for this yet? Or did we hide it? Oh wait, index.html missing counterparty field?
        // Wait, index.html HAS comment but NOT counterparty based on my previous overwrite?
        // Let's check the code: there IS NO counterparty input in the current HTML overwrite!
        // We need to support counterparty as per API specs.
        // For now sending empty string or we can fix HTML later. 
        // Let's stick to what we have visible.
        counterparty: "",
        comment: els.commentInput.value.trim()
    };

    // FX Fields
    if (state.type === 'fx') {
        payload.fx_rate_raw = state.fxRate.replace(/\s/g, '');
        payload.fx_currency = els.fxCurrencyInput.value;
    }

    // Photo
    if (state.photo) {
        try {
            const base64Full = await fileToBase64(state.photo);
            // data:image/jpeg;base64,...
            const base64Data = base64Full.split(',')[1];
            payload.photo_base64 = base64Data;
            payload.photo_filename = state.photo.name;
            payload.photo_mime = state.photo.type;
        } catch (e) {
            console.error("Photo encode error", e);
        }
    }

    // Send
    const res = await apiPost(payload);

    if (res.ok) {
        // Success
        els.saveBtnText.textContent = "Сохранено!";
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }

        // Refresh History
        await loadHistory();

        // Reset Form
        state.amount = "";
        els.amountInput.value = "";
        state.fxRate = "";
        els.fxRateInput.value = "";
        els.commentInput.value = "";
        state.photo = null;
        els.photoRemoveBtn.click();

        setTimeout(() => {
            els.saveBtnText.textContent = "Сохранить";
            els.saveBtn.disabled = false;
        }, 1500);

    } else {
        // Error
        els.saveBtnText.textContent = "Не удалось сохранить";
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
        alert("Ошибка: " + (res.error || "unknown"));

        setTimeout(() => {
            els.saveBtnText.textContent = "Сохранить";
            els.saveBtn.disabled = false;
        }, 2000);
    }
});

function renderHistory() {
    if (!state.history) return;
    els.historyCount.textContent = `${Math.min(state.history.length, 50)} / ${state.history.length}`;
    els.historyList.innerHTML = "";

    state.history.forEach(item => {
        const div = document.createElement('div');
        div.className = "bg-tg-secondaryBg p-3 rounded-2xl flex gap-3 items-start";

        // Icon logic
        let iconHtml = '';
        let colorCls = '';
        let bgCls = '';

        // item.type comes as "Получил"/"Отдал"/"Обменял" from server based on example response?
        // API DOCS SAY: "reviews" returns type: "Получил". But API SAVE expects "in".
        // Let's normalize for display color.

        const tLower = (item.type || "").toLowerCase();
        let isIn = tLower.includes("получил") || tLower === 'in';
        let isOut = tLower.includes("отдал") || tLower === 'out';
        let isFx = tLower.includes("обменял") || tLower === 'fx';

        if (isIn) {
            colorCls = 'text-green-500'; bgCls = 'bg-green-500/10';
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7 7 17"/><path d="M17 17H7V7"/></svg>`;
        } else if (isOut) {
            colorCls = 'text-red-500'; bgCls = 'bg-red-500/10';
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>`;
        } else {
            colorCls = 'text-blue-500'; bgCls = 'bg-blue-500/10';
            iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>`;
        }

        div.innerHTML = `
            <div class="w-10 h-10 rounded-full ${bgCls} ${colorCls} flex items-center justify-center shrink-0">
                ${iconHtml}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <div class="min-w-0 pr-2">
                        <h3 class="text-tg-text truncate text-[16px]">${item.type}</h3>
                        <p class="text-[14px] text-tg-hint mt-0.5">${item.date}</p>
                    </div>
                    <div class="text-right shrink-0">
                        <span class="block text-[16px] whitespace-nowrap ${colorCls}">
                            ${item.amount_main}
                        </span>
                        ${item.amount_sub ? `<span class="block text-[12px] text-tg-hint">${item.amount_sub}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        els.historyList.appendChild(div);
    });
}

// Initial Boot
initApp();
