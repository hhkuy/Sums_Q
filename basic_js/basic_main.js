/* =========================================================
   Viatosis — VBE (RTL + Timer + Arabic UI + Custom Modals)
   يعتمد فقط على: basic_data/basic_links.json + data/*.json
   لا استخدام لـ topics.json إطلاقًا.
   ========================================================= */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const PATH_LINKS = "basic_data/basic_links.json";

  /** ---------- Utils ---------- */
  const todayStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const uniqueBy = (arr, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = keyFn(x);
      if (k == null) { out.push(x); continue; }
      if (!seen.has(k)) { seen.add(k); out.push(x); }
    }
    return out;
  };

  /** ---------- State ---------- */
  let LINKS = null;             // محتوى basic_links.json
  let SUBJECT_BLOCKS = [];      // [{name,count,items:[...]}, ...] بعد التوليد
  let MASTER_EXAM = [];         // مصفوفة الأسئلة النهائية
  let FILE_CACHE = new Map();   // مسار → أسئلة
  let shortagesGlobal = [];     // ملاحظات نقص

  // Timer
  let totalMs = 0;              // إجمالي الوقت بالمللي ثانية
  let deadline = 0;             // توقيت الانتهاء (Date.now + totalMs)
  let tickHandle = null;
  let paused = false;
  let pauseStamp = 0;           // لحظة الإيقاف المؤقت
  let gradedOnce = false;

  // Modal handlers
  let modalResolver = null;

  // ثابت: واجهة أمامية ثابتة لا تعتمد على links.json للعرض
  const FRONT_SUBJECTS = [
    { name: "Anatomy", count: 54 },
    { name: "Physiology", count: 36 },
    { name: "Virology", count: 6 },
    { name: "Principles of Health", count: 11 },
    { name: "Epidemiology", count: 9 },
    { name: "Medical Terminology", count: 20 },
    { name: "Biochemistry", count: 22 },
    { name: "Immunology", count: 9 },
    { name: "Microbiology", count: 17 },
    { name: "Parasitology", count: 11 },
    { name: "Mycology", count: 5 },
  ];
  const FRONT_TOTAL = 200;

  /** ---------- Bootstrap ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    // رسم صناديق الواجهة الأمامية (ثابتة ولا تُظهر روابط أو توفر)
    paintFrontTiles();

    // ربط الأزرار
    $("#startBtn").addEventListener("click", onStartExam);
    $("#gradeBtn").addEventListener("click", confirmGrade);
    $("#filterBtn").addEventListener("click", openFilter);
    $("#backBtn").addEventListener("click", confirmBack);
    $("#pauseBtn").addEventListener("click", togglePause);

    // التحكّم بإظهار/إخفاء المصدر والشرح حسب اختيارات المستخدم قبل البدء
    $("#showLeadCk").addEventListener("change", applyLeadExpToggles);
    $("#showExpCk").addEventListener("change", applyLeadExpToggles);

    // تهيئة الحالة الافتراضية لعرض الأسئلة (قبل البدء لن تظهر)
    $("#questionsMount").classList.toggle("lead-hidden", !$("#showLeadCk").checked);
    $("#questionsMount").classList.toggle("exp-hidden", !$("#showExpCk").checked);

    // تحميل links.json وتهيئة الكاش بهدوء (بدون تنبيه متصفح)
    try {
      LINKS = await fetch(PATH_LINKS).then(r => r.json());
      await prefetchAllFiles(); // تجهيز الملفات للتوليد عند الضغط على Start
    } catch (e) {
      console.warn("تعذر التحميل المسبق:", e);
      const box = $("#loadErrorBox");
      box.textContent = "تعذّر التحميل المسبق لمصادر الأسئلة. يمكنك المحاولة بالضغط على Start Exam، وسنحاول التحميل من جديد.";
      box.classList.remove("hidden");
    }
  });

  /** ---------- Front tiles (static) ---------- */
  function paintFrontTiles() {
    const grid = $("#front-grid");
    grid.innerHTML = "";
    FRONT_SUBJECTS.forEach(s => {
      const el = document.createElement("div");
      el.className = "tile";
      el.innerHTML = `
        <strong>${s.name}</strong>
        <div class="muted">${s.count} Questions</div>
      `;
      grid.appendChild(el);
    });
    // صندوق يوضح المجموع
    const totalEl = document.createElement("div");
    totalEl.className = "tile";
    totalEl.innerHTML = `
      <strong>TOTAL</strong>
      <div class="muted">No. of Questions: <b>${FRONT_TOTAL} MCQ</b></div>
    `;
    grid.appendChild(totalEl);
  }

  /** ---------- Files ---------- */
  async function prefetchAllFiles(){
    if (!LINKS || !Array.isArray(LINKS.subjects)) return;
    const allPaths = Array.from(new Set(LINKS.subjects.flatMap(s => s.files || [])));
    FILE_CACHE = new Map();
    await Promise.all(allPaths.map(async (p) => {
      try {
        const data = await fetch(p).then(r => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        });
        FILE_CACHE.set(p, Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn("فشل تحميل:", p, err);
        FILE_CACHE.set(p, []);
      }
    }));
  }

  /** ---------- Start Exam ---------- */
  async function onStartExam() {
    // إذا لم تُحمّل الروابط سابقًا، حاول الآن بهدوء
    if (!LINKS) {
      try {
        LINKS = await fetch(PATH_LINKS).then(r => r.json());
        await prefetchAllFiles();
      } catch (e) {
        showInlineError("تعذّر تحميل إعدادات الامتحان. تأكد من وجود basic_data/basic_links.json والملفات المشار إليها.");
        return;
      }
    }

    // قراءة الوقت من المدخلات
    const hh = clamp(Number($("#hoursInput").value || 0), 0, 12);
    const mm = clamp(Number($("#minsInput").value || 0), 0, 59);
    totalMs = (hh * 60 + mm) * 60 * 1000;
    if (totalMs <= 0) {
      showModal({
        title: "تنبيه",
        body: "يرجى تحديد مدة زمنية صحيحة (ساعة/دقيقة) قبل البدء.",
        okText: "حسنًا",
        cancelText: null
      });
      return;
    }

    $("#startBtn").disabled = true;
    SUBJECT_BLOCKS = [];
    shortagesGlobal = [];

    // نبني الامتحان من LINKS.subjects وفق التوزيع في links.json (الرابط مخفي عن المستخدم)
    for (const sub of LINKS.subjects) {
      const uniq = Array.from(new Set(sub.files || []));
      let pool = [];
      uniq.forEach(p => pool = pool.concat(FILE_CACHE.get(p) || []));
      // تغليف أول span ليُستخدم كمصدر (lead-intro) مع إمكانية إخفائه/إظهاره
      pool = pool.map(q => ({ ...q, question: wrapLeadSpan(q.question) }));
      pool = uniqueBy(pool, (x) => x.qID || null);

      const shuffled = shuffle(pool);
      let takeN = sub.count;
      if (shuffled.length < sub.count) {
        shortagesGlobal.push(`• ${sub.name}: المتاح ${shuffled.length} < المطلوب ${sub.count}`);
        takeN = shuffled.length;
      }
      SUBJECT_BLOCKS.push({ name: sub.name, count: sub.count, items: shuffled.slice(0, takeN) });
    }

    MASTER_EXAM = SUBJECT_BLOCKS.flatMap(b => b.items);

    // إظهار الامتحان
    $("#intro").classList.add("hidden");
    $("#examArea").classList.remove("hidden");

    // تطبيق خيارات الإظهار التي اختارها المستخدم قبل البدء
    applyLeadExpToggles();

    renderQuestions(MASTER_EXAM);

    // ملاحظات نقص
    const note = $("#shortageNote");
    if (shortagesGlobal.length) {
      note.innerHTML = `<strong>ملاحظة:</strong> بعض الأقسام تحتوي أسئلة أقل من المطلوب:<br>${shortagesGlobal.join("<br>")}`;
      note.classList.remove("hidden");
    } else {
      note.classList.add("hidden");
    }

    // تشغيل المؤقّت العائم
    startTimer();

    window.scrollTo({ top: $("#examArea").offsetTop - 10, behavior: "smooth" });
  }

  function wrapLeadSpan(html) {
    if (typeof html !== "string") return html;
    // نغلف أول <span> بكلاس lead-intro إن لم يكن له class
    const withClass = html.replace(/<span\b(?![^>]*class=)[^>]*>/i, (m) => m.replace("<span", `<span class="lead-intro"`));
    // لو لديه class أصلًا، نضيف lead-intro
    return withClass.replace(/<span([^>]*)class=['"]([^'"]*)['"]([^>]*)>/i, (_m, a, c, b) => `<span${a}class="lead-intro ${c}"${b}>`);
  }

  function renderQuestions() {
    const mount = $("#questionsMount");
    mount.innerHTML = "";
    let idx = 1;
    for (const block of SUBJECT_BLOCKS) {
      const section = document.createElement("div");
      section.className = "card";
      section.innerHTML = `<h3 style="margin:0 0 6px 0">${block.name}</h3>
        <div class="muted">${block.items.length} من ${block.count} المطلوبة</div>`;
      mount.appendChild(section);

      for (const q of block.items) {
        const qBox = document.createElement("div");
        qBox.className = "q";
        qBox.dataset.qid = q.qID || "";
        qBox.dataset.answer = String(q.answer);

        const optsHtml = (q.options || []).map((opt, i) => `
          <label class="opt">
            <input type="radio" name="q_${idx}" value="${i}">
            <div>${typeof opt === "string" ? opt : String(opt)}</div>
          </label>
        `).join("");

        const expHtml = q.explanation
          ? `<details class="muted" style="margin-top:6px">
               <summary>شرح</summary>
               <div style="margin-top:6px">${typeof q.explanation === "string" ? q.explanation : String(q.explanation)}</div>
             </details>`
          : "";

        qBox.innerHTML = `
          <h4>#${idx}</h4>
          <div class="stem">${q.question}</div>
          <div class="options">${optsHtml}</div>
          ${expHtml}
        `;
        section.appendChild(qBox);
        idx++;
      }
    }
  }

  /** ---------- Lead/Exp Toggles (checkboxes) ---------- */
  function applyLeadExpToggles() {
    const showLead = $("#showLeadCk").checked;
    const showExp = $("#showExpCk").checked;
    const mount = $("#questionsMount");
    mount.classList.toggle("lead-hidden", !showLead);
    mount.classList.toggle("exp-hidden", !showExp);
  }

  /** ---------- Grading with custom confirm ---------- */
  async function confirmGrade() {
    const ok = await showModal({
      title: "عرض النتيجة",
      body: "هل تريد بالتأكيد إنهاء المحاولة وعرض النتيجة؟ لن تتمكن من تعديل الإجابات بعد ذلك.",
      okText: "نعم، اعرض النتيجة",
      cancelText: "إلغاء"
    });
    if (ok) onGrade();
  }

  function onGrade() {
    if (gradedOnce) return; // لا نكرّر
    gradedOnce = true;

    const qBoxes = $$(".q");
    let ok = 0, bad = 0, na = 0;

    qBoxes.forEach(q => {
      q.classList.remove("unanswered");
      $$(".opt", q).forEach(o => o.classList.remove("correct", "wrong"));

      const ansIdx = Number(q.dataset.answer);
      const chosen = $$("input[type=radio]", q).find(i => i.checked);
      const opts = $$(".opt", q);

      if (!chosen) {
        na++;
        q.classList.add("unanswered");
        if (opts[ansIdx]) opts[ansIdx].classList.add("correct");
        return;
      }
      const chosenIdx = Number(chosen.value);
      if (chosenIdx === ansIdx) {
        ok++;
        opts[chosenIdx]?.classList.add("correct");
      } else {
        bad++;
        opts[chosenIdx]?.classList.add("wrong");
        opts[ansIdx]?.classList.add("correct");
      }
    });

    $("#okCount").textContent = ok;
    $("#badCount").textContent = bad;
    $("#naCount").textContent = na;
    $("#scoreText").textContent = `النتيجة: ${ok} / ${(LINKS && LINKS.total) ? LINKS.total : 200}`;
    $("#resultCard").classList.remove("hidden");

    // تعطيل جميع المدخلات بعد التصحيح
    $$("input[type=radio]").forEach(i => i.disabled = true);

    // إيقاف المؤقت وإخفاء الزر العائم
    stopTimer(true);

    // إظهار زر الفلترة
    $("#filterBtn").classList.remove("hidden");

    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** ---------- Filters ---------- */
  async function openFilter() {
    const extra = document.createElement("div");
    extra.className = "filters";
    extra.innerHTML = `
      <div class="chip" data-k="ok">عرض الصحيحة</div>
      <div class="chip" data-k="bad">عرض الخاطئة</div>
      <div class="chip" data-k="na">عرض غير المُجابة</div>
    `;
    const ok = await showModal({
      title: "فلترة الأسئلة",
      body: "اختر نوع الأسئلة التي تريد عرضها (يمكن تحديد أكثر من خيار).",
      okText: "تطبيق",
      cancelText: "إلغاء",
      extraNode: extra
    });
    if (!ok) return;

    const actives = $$(".chip", extra).filter(c => c.classList.contains("active")).map(c => c.dataset.k);
    applyFilter(actives);
  }

  function applyFilter(keys) {
    // مفاتيح: ok/bad/na. إن كانت خالية، اعرض الكل.
    const showAll = !keys || keys.length === 0;
    const qBoxes = $$(".q");
    qBoxes.forEach(q => q.classList.remove("hidden"));

    if (showAll) return;

    // نحدد حالة كل سؤال بناءً على الكلاسات بعد التصحيح
    qBoxes.forEach(q => {
      const hasCorrect = $$(".opt.correct", q).length > 0;
      const hasWrong = $$(".opt.wrong", q).length > 0;
      const isNA = q.classList.contains("unanswered");

      let state = null;
      if (isNA) state = "na";
      else if (hasWrong) state = "bad";
      else if (hasCorrect && !hasWrong) state = "ok";

      if (!keys.includes(state)) {
        q.classList.add("hidden");
      }
    });
  }

  /** ---------- Back (custom confirm) ---------- */
  async function confirmBack() {
    const ok = await showModal({
      title: "رجوع إلى الواجهة",
      body: "هل تريد الرجوع لواجهة البدء؟ ستفقد المحاولة الحالية غير المحفوظة.",
      okText: "نعم، ارجع",
      cancelText: "إلغاء"
    });
    if (!ok) return;
    // إعادة الضبط
    resetExam();
  }

  function resetExam() {
    stopTimer(true);
    gradedOnce = false;
    paused = false;
    MASTER_EXAM = [];
    SUBJECT_BLOCKS = [];
    shortagesGlobal = [];
    $("#questionsMount").innerHTML = "";
    $("#resultCard").classList.add("hidden");
    $("#filterBtn").classList.add("hidden");
    $("#startBtn").disabled = false;
    $("#examArea").classList.add("hidden");
    $("#intro").classList.remove("hidden");
    // إعادة خيارات العرض حسب خياري المستخدم الحاليين
    applyLeadExpToggles();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** ---------- Timer ---------- */
  function startTimer(){
    const fab = $("#timerFab");
    fab.classList.remove("hidden");
    gradedOnce = false;
    paused = false;
    const now = Date.now();
    deadline = now + totalMs;
    renderTick(); // أول تحديث فوري
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(renderTick, 1000);
    $("#pauseBtn").textContent = "إيقاف مؤقت";
    fab.classList.remove("paused");
  }

  function stopTimer(hide){
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    if (hide) $("#timerFab").classList.add("hidden");
  }

  function togglePause() {
    if (!tickHandle && !paused) return; // غير نشط
    const fab = $("#timerFab");
    if (!paused) {
      // إيقاف مؤقت
      paused = true;
      pauseStamp = Date.now();
      clearInterval(tickHandle);
      tickHandle = null;
      $("#pauseBtn").textContent = "استمرار";
      fab.classList.add("paused");
    } else {
      // استمرار
      const pausedDuration = Date.now() - pauseStamp;
      deadline += pausedDuration; // نمدّد الموعد النهائي بقدر التوقف
      paused = false;
      tickHandle = setInterval(renderTick, 1000);
      $("#pauseBtn").textContent = "إيقاف مؤقت";
      fab.classList.remove("paused");
    }
  }

  function renderTick(){
    const remain = Math.max(0, deadline - Date.now());
    $("#timerClock").textContent = msToHMS(remain);
    if (remain <= 0){
      stopTimer(true);
      if (!gradedOnce) onGrade();
    }
  }

  function msToHMS(ms){
    let s = Math.floor(ms/1000);
    const h = Math.floor(s/3600); s -= h*3600;
    const m = Math.floor(s/60);   s -= m*60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  /** ---------- Custom Modal ---------- */
  function showModal({ title="تأكيد", body="هل أنت متأكد؟", okText="تأكيد", cancelText="إلغاء", extraNode=null }) {
    return new Promise((resolve) => {
      const wrap = $("#modalWrap");
      $("#modalTitle").textContent = title;
      $("#modalBody").textContent = body;

      const extra = $("#modalExtra");
      extra.innerHTML = "";
      if (extraNode) {
        extra.classList.remove("hidden");
        extra.appendChild(extraNode);
        // تفعيل تفعيل/تعطيل شرائح الفلترة
        $$(".chip", extra).forEach(ch => {
          ch.addEventListener("click", () => ch.classList.toggle("active"));
        });
      } else {
        extra.classList.add("hidden");
      }

      const okBtn = $("#modalOk");
      const cancelBtn = $("#modalCancel");

      okBtn.textContent = okText || "تأكيد";
      if (cancelText === null) {
        cancelBtn.classList.add("hidden");
      } else {
        cancelBtn.classList.remove("hidden");
        cancelBtn.textContent = cancelText || "إلغاء";
      }

      wrap.style.display = "flex";

      const cleanup = () => {
        wrap.style.display = "none";
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        modalResolver = null;
      };

      okBtn.onclick = () => { cleanup(); resolve(true); };
      cancelBtn.onclick = () => { cleanup(); resolve(false); };
      wrap.onclick = (e) => {
        if (e.target === wrap) { cleanup(); resolve(false); }
      };

      modalResolver = resolve;
    });
  }

  /** ---------- Inline error instead of alert ---------- */
  function showInlineError(msg){
    const box = $("#loadErrorBox");
    box.textContent = msg;
    box.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
})();
