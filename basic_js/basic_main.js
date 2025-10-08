/* basic_js/basic_main.js */
/* Viatosis — Virtual Basic Exam (Standalone)
   - يعتمد فقط على مجلد data (عبر basic_data/basic_links.json) لجلب أسئلة JSON
   - تقسيم الأسئلة ثابت إلى 200 MCQ كما طُلب
*/

(() => {
  "use strict";

  /* ====== CONFIG ====== */
  const DISTRIBUTION = [
    { key: "Anatomy", count: 54 },
    { key: "Physiology", count: 36 },
    { key: "Virology", count: 6 },
    { key: "Principles of Health", count: 11 },
    { key: "Epidemiology", count: 9 },
    { key: "Medical Terminology", count: 20 },
    { key: "Biochemistry", count: 22 },
    { key: "Immunology", count: 9 },
    { key: "Microbiology", count: 17 },
    { key: "Parasitology", count: 11 },
    { key: "Mycology", count: 5 },
  ];
  const TOTAL = DISTRIBUTION.reduce((a, b) => a + b.count, 0); // 200
  const PAGE_SIZE = 25; // صفحة وهمية داخل نفس الواجهة (Scrolling)
  const LINKS_FILE = "basic_data/basic_links.json";

  /* ====== ELEMENTS ====== */
  const todayDateEl = document.getElementById("today-date");
  const distributionEl = document.getElementById("distribution");
  const durationInput = document.getElementById("duration-min");
  const startBtn = document.getElementById("start-btn");
  const toggleSource = document.getElementById("toggle-source");
  const toggleExplain = document.getElementById("toggle-explain");
  const examEl = document.getElementById("exam");
  const showResultBtn = document.getElementById("show-result");
  const backHomeBtn = document.getElementById("back-home");
  const scoreStat = document.getElementById("score-stat");
  const detailStat = document.getElementById("detail-stat");
  const filterBar = document.getElementById("filterbar");

  // timer elements
  const timerBox = document.getElementById("timer");
  const timeText = document.getElementById("time-text");
  const timerCircle = document.getElementById("timer-circle");
  const pauseResumeBtn = document.getElementById("pause-resume");
  const resetTimerBtn = document.getElementById("reset-timer");

  // modal elements
  const modalBackdrop = document.getElementById("modal-backdrop");
  const modalTitle = document.getElementById("modal-title");
  const modalMsg = document.getElementById("modal-msg");
  const modalCancel = document.getElementById("modal-cancel");
  const modalOk = document.getElementById("modal-ok");

  /* ====== STATE ====== */
  let loadedPools = {}; // key -> array of questions
  let generatedExam = []; // array of normalized questions
  let hasSubmitted = false;

  // timer state
  let totalSeconds = 0;
  let remaining = 0;
  let timerId = null;
  let paused = false;

  /* ====== UTIL ====== */
  const fmtDate = (d = new Date()) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  };
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const uniqBy = (arr, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = keyFn(x);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(x);
      }
    }
    return out;
  };

  const createEl = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v);
    });
    children.forEach((c) => el.appendChild(c));
    return el;
  };

  /* ====== MODAL (custom confirm) ====== */
  function confirmModal({ title = "تأكيد", message = "", okText = "تأكيد", cancelText = "إلغاء" }) {
    modalTitle.textContent = title;
    modalMsg.innerHTML = message;
    modalOk.textContent = okText;
    modalCancel.textContent = cancelText;

    return new Promise((resolve) => {
      const onCancel = () => { hide(); resolve(false); };
      const onOk = () => { hide(); resolve(true); };
      const onKey = (e) => { if (e.key === "Escape") onCancel(); };

      function hide() {
        modalBackdrop.style.display = "none";
        modalCancel.removeEventListener("click", onCancel);
        modalOk.removeEventListener("click", onOk);
        window.removeEventListener("keydown", onKey);
      }

      modalBackdrop.style.display = "flex";
      modalCancel.addEventListener("click", onCancel);
      modalOk.addEventListener("click", onOk);
      window.addEventListener("keydown", onKey);
    });
  }

  /* ====== TIMER ====== */
  function initTimer(seconds) {
    totalSeconds = seconds;
    remaining = seconds;
    paused = false;
    renderTimer();
    timerBox.style.display = "flex";
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, 1000);
    pauseResumeBtn.textContent = "إيقاف";
  }
  function tick() {
    if (paused) return;
    remaining = Math.max(remaining - 1, 0);
    renderTimer();
    if (remaining <= 0) {
      clearInterval(timerId);
      timerId = null;
      autoSubmitOnTime();
    }
  }
  function renderTimer() {
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    timeText.textContent = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

    const circumference = 2 * Math.PI * 45; // r=45 => 282.743...
    const progress = totalSeconds === 0 ? 0 : remaining / totalSeconds;
    const offset = circumference * (1 - progress);
    timerCircle.style.strokeDashoffset = String(offset);
  }
  function togglePause() {
    paused = !paused;
    pauseResumeBtn.textContent = paused ? "استمرار" : "إيقاف";
  }
  function resetTimer() {
    remaining = totalSeconds;
    paused = false;
    pauseResumeBtn.textContent = "إيقاف";
    renderTimer();
  }
  async function autoSubmitOnTime() {
    await confirmModal({
      title: "انتهى الوقت",
      message: "انتهى الوقت المحدد للامتحان. سيتم عرض النتيجة الآن.",
      okText: "حسناً",
      cancelText: "—"
    });
    gradeNow();
  }

  /* ====== LOAD & BUILD ====== */
  function renderDistribution() {
    distributionEl.innerHTML = "";
    DISTRIBUTION.forEach(d => {
      const item = createEl("div", { class: "pill" });
      item.innerHTML = `<b>${d.key}</b> — ${d.count} Questions`;
      distributionEl.appendChild(item);
    });
  }

  function normalizeQuestion(raw, catKey, globalIndex) {
    // raw structure: {question, options[], answer, answerText, explanation, userAnswer, qID}
    // Wrap first <span ...> as q-source (for toggling)
    let qHTML = String(raw.question || "");
    // Try to wrap the very first span into class="q-source"
    qHTML = qHTML.replace(/<span([^>]*)>/i, (m, attrs) => `<span class="q-source"${attrs.includes("style") ? " " + attrs.trim() : ""}>`);
    return {
      id: raw.qID || `${catKey}-${globalIndex}`,
      cat: catKey,
      questionHTML: qHTML,
      options: Array.isArray(raw.options) ? raw.options.slice(0, 8) : [],
      answerIndex: typeof raw.answer === "number" ? raw.answer : 0,
      answerText: raw.answerText || "",
      explanation: raw.explanation || "",
      userAnswer: null, // 0..n
      status: "unanswered" // correct | incorrect | unanswered
    };
  }

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return res.json();
  }

  async function loadPools() {
    const links = await fetchJSON(LINKS_FILE);
    // links: { "Anatomy": ["data/...json", ...], "Physiology": [...] , ... }
    const pool = {};
    for (const { key } of DISTRIBUTION) {
      const files = links[key] || [];
      let all = [];
      for (const f of files) {
        try {
          const arr = await fetchJSON(f);
          if (Array.isArray(arr)) all = all.concat(arr);
        } catch (e) {
          console.warn("Cannot load", f, e);
        }
      }
      // de-dup by qID if available
      all = uniqBy(all, x => x.qID || JSON.stringify(x).slice(0, 120));
      pool[key] = all;
    }
    return pool;
  }

  function sampleFromPool() {
    const out = [];
    let globalIndex = 0;
    for (const part of DISTRIBUTION) {
      const pool = (loadedPools[part.key] || []).slice();
      if (pool.length < part.count) {
        console.warn(`Pool "${part.key}" has only ${pool.length}, but needs ${part.count}. Will reuse after shuffle.`);
      }
      const bag = [];
      const shuffled = shuffle(pool);
      // if not enough, loop again (allows reuse but still randomized)
      while (bag.length < part.count) {
        for (const q of shuffled) {
          bag.push(q);
          if (bag.length >= part.count) break;
        }
      }
      // normalize and push
      bag.forEach((raw) => {
        out.push(normalizeQuestion(raw, part.key, globalIndex++));
      });
    }
    // final shuffle inside each category? The instruction keeps the order of sections.
    // We'll keep category order as given, and within each, random order:
    const grouped = {};
    out.forEach(q => {
      grouped[q.cat] = grouped[q.cat] || [];
      grouped[q.cat].push(q);
    });
    const merged = [];
    for (const part of DISTRIBUTION) {
      merged.push(...shuffle(grouped[part.key]));
    }
    return merged.slice(0, TOTAL);
  }

  function buildExamUI() {
    examEl.innerHTML = "";
    const pages = Math.ceil(generatedExam.length / PAGE_SIZE);
    for (let p = 0; p < pages; p++) {
      const from = p * PAGE_SIZE;
      const to = Math.min((p + 1) * PAGE_SIZE, generatedExam.length);
      const title = createEl("div", { class: "page-title", text: `Page ${p + 1}` });
      examEl.appendChild(title);
      for (let i = from; i < to; i++) {
        examEl.appendChild(buildQuestionBlock(generatedExam[i], i));
      }
    }
  }

  function buildQuestionBlock(q, index) {
    const block = createEl("div", { class: "question", "data-qid": q.id, "data-status": q.status, "data-cat": q.cat });

    // Header
    const head = createEl("div", { class: "q-head" });
    const left = createEl("div", { class: "q-no", text: `Q${index + 1}.` });
    const right = createEl("div", { class: "muted" });
    right.innerHTML = `<span class="tag">${q.cat}</span>`;

    head.appendChild(left);
    head.appendChild(right);

    // Question text
    const text = createEl("div", { class: "q-text", html: q.questionHTML });

    // Respect toggle: hide q-source span if needed
    if (!toggleSource.checked) {
      const spans = text.querySelectorAll(".q-source");
      spans.forEach(s => s.classList.add("hidden"));
    }

    // Options
    const opts = createEl("div", { class: "options" });
    q.options.forEach((opt, idx) => {
      const id = `${q.id}-${idx}`;
      const row = createEl("label", { class: "opt", "for": id });
      const radio = createEl("input", { type: "radio", name: q.id, id });
      radio.addEventListener("change", () => {
        q.userAnswer = idx;
        q.status = (idx === q.answerIndex) ? "correct" : "incorrect";
        block.dataset.status = q.status;
        // enable show result if any answered
        showResultBtn.disabled = false;
      });
      const span = createEl("span", { html: opt });
      row.appendChild(radio);
      row.appendChild(span);
      opts.appendChild(row);
    });

    // Explanation (respect toggle)
    const explain = createEl("div", { class: "explain" });
    explain.innerHTML = `<b>Explanation:</b> ${q.explanation || "—"}`;
    if (!toggleExplain.checked) explain.classList.add("hidden");

    block.appendChild(head);
    block.appendChild(text);
    block.appendChild(opts);
    block.appendChild(explain);
    return block;
  }

  function applyTogglesToDOM() {
    document.querySelectorAll(".q-text").forEach(qt => {
      const spans = qt.querySelectorAll(".q-source");
      spans.forEach(s => s.classList.toggle("hidden", !toggleSource.checked));
    });
    document.querySelectorAll(".explain").forEach(ex => {
      ex.classList.toggle("hidden", !toggleExplain.checked);
    });
  }

  function disableInputsAfterSubmit() {
    examEl.querySelectorAll("input[type=radio]").forEach(r => r.disabled = true);
  }

  function colorizeAfterSubmit() {
    // For each question block:
    examEl.querySelectorAll(".question").forEach(block => {
      const qid = block.dataset.qid;
      const q = generatedExam.find(x => x.id === qid);
      if (!q) return;

      const rows = block.querySelectorAll(".opt");
      rows.forEach((row, idx) => {
        row.classList.remove("correct", "incorrect", "unanswered");
        const input = row.querySelector("input[type=radio]");
        if (idx === q.answerIndex) {
          // always highlight correct in green
          row.classList.add("correct");
        }
        if (q.userAnswer === null) {
          // unanswered overall
          // Mark chosen? none chosen -> add yellow to all or just header?
          // We'll add yellow only to the whole question: mark all options light but emphasize correctness in green
          // Here we add unanswered to options that are not correct, and correct stays green.
          if (idx !== q.answerIndex) row.classList.add("unanswered");
        } else if (q.userAnswer === idx && idx !== q.answerIndex) {
          // chosen wrong option -> red
          row.classList.add("incorrect");
        }
      });

      // set question dataset for filter
      block.dataset.status = q.userAnswer === null ? "unanswered" : (q.userAnswer === q.answerIndex ? "correct" : "incorrect");
    });
  }

  function computeScore() {
    let correct = 0, incorrect = 0, unanswered = 0;
    for (const q of generatedExam) {
      if (q.userAnswer === null) unanswered++;
      else if (q.userAnswer === q.answerIndex) correct++;
      else incorrect++;
    }
    return { correct, incorrect, unanswered, total: generatedExam.length };
  }

  function updateScoreUI() {
    const { correct, incorrect, unanswered, total } = computeScore();
    scoreStat.textContent = `النتيجة: ${correct} / ${total}`;
    detailStat.textContent = `صح: ${correct} • خطأ: ${incorrect} • غير مُجاب: ${unanswered}`;
  }

  function showFilterBar() {
    filterBar.style.display = "flex";
    // activate "all" by default
    filterBar.querySelectorAll(".chip").forEach(ch => ch.classList.remove("active"));
    const allBtn = filterBar.querySelector('[data-filter="all"]');
    allBtn.classList.add("active");
    applyFilter("all");
  }

  function applyFilter(kind) {
    examEl.querySelectorAll(".question").forEach(block => {
      const st = block.dataset.status || "unanswered";
      block.style.display = (kind === "all" || st === kind) ? "" : "none";
    });
  }

  function attachFilterEvents() {
    filterBar.querySelectorAll(".chip").forEach(ch => {
      ch.addEventListener("click", () => {
        filterBar.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        ch.classList.add("active");
        const k = ch.getAttribute("data-filter");
        applyFilter(k);
      });
    });
  }

  async function gradeNow() {
    if (hasSubmitted) return;
    hasSubmitted = true;
    if (timerId) { clearInterval(timerId); timerId = null; }

    disableInputsAfterSubmit();
    colorizeAfterSubmit();
    updateScoreUI();
    showFilterBar();

    await confirmModal({
      title: "تم عرض النتيجة",
      message: "تم حساب نتيجتك وإظهار التصحيح اللوني.<br>يمكنك استخدام شريط الفلترة لعرض الأسئلة الصحيحة أو الخاطئة أو غير المُجابة.",
      okText: "تمام"
    });
  }

  /* ====== EVENTS ====== */
  startBtn.addEventListener("click", async () => {
    const mins = Math.max(5, Math.min(300, parseInt(durationInput.value || "180", 10)));
    const ok = await confirmModal({
      title: "بدء الامتحان",
      message: `سيتم توليد امتحان افتراضي من 200 سؤال حسب التوزيع القياسي.<br><span class="tag">المدة</span> ${mins} دقيقة.<br><br>هل تريد البدء؟`,
      okText: "ابدأ",
      cancelText: "إلغاء"
    });
    if (!ok) return;

    // Reset state
    hasSubmitted = false;
    showResultBtn.disabled = true;
    scoreStat.textContent = `النتيجة: — / ${TOTAL}`;
    detailStat.textContent = `صح: — • خطأ: — • غير مُجاب: —`;
    filterBar.style.display = "none";
    examEl.innerHTML = "";

    // Build exam
    try {
      loadedPools = await loadPools();
      generatedExam = sampleFromPool();
      buildExamUI();
      applyTogglesToDOM();
    } catch (e) {
      console.error(e);
      await confirmModal({
        title: "خطأ بالتحميل",
        message: "حدثت مشكلة في تحميل ملفات الأسئلة من مجلد data. تأكد من صحة المسارات وصلاحيات القراءة.",
        okText: "حسناً"
      });
      return;
    }

    // Init timer
    initTimer(mins * 60);
  });

  toggleSource.addEventListener("change", applyTogglesToDOM);
  toggleExplain.addEventListener("change", applyTogglesToDOM);

  showResultBtn.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "عرض النتيجة",
      message: "هل تريد حساب الدرجة وإظهار التصحيح؟",
      okText: "عرض النتيجة",
      cancelText: "إلغاء"
    });
    if (!ok) return;
    gradeNow();
  });

  backHomeBtn.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "العودة",
      message: "هل تريد العودة إلى الصفحة الرئيسية؟ سيتم فقدان تقدمك الحالي.",
      okText: "نعم، عودة",
      cancelText: "متابعة الامتحان"
    });
    if (!ok) return;
    window.location.href = "index.html";
  });

  pauseResumeBtn.addEventListener("click", togglePause);
  resetTimerBtn.addEventListener("click", resetTimer);

  // Filter events
  attachFilterEvents();

  /* ====== INIT ====== */
  (() => {
    todayDateEl.textContent = fmtDate(new Date());
    renderDistribution();
  })();

})();
