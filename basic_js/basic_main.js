/* =========================================================
   Viatosis — VBE (RTL + Timer + Arabic UI + Custom Modals)
   يعتمد فقط على: basic_data/basic_links.json + data/*.json
   لا استخدام لـ topics.json إطلاقًا.
   يصلح مع الفتح المباشر والتضمين (WordPress iframe).
   ========================================================= */
(function () {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ======== حساب الجذر الحقيقي للمجلد (questions-bank/) حتى عند التضمين ========
  // سنستفيد من مسار هذا الملف (basic_main.js) لأنه دائمًا مسار مطلق بعد التحميل
  const SCRIPT_URL = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : (function () {
        // fallback: نلجأ لـ window.location إن لزم
        try { return new URL('basic_js/basic_main.js', window.location.href).toString(); }
        catch { return window.location.href; }
      })();

  const BASE = new URL('../', SCRIPT_URL);          // questions-bank/
  const PATH_LINKS = new URL('basic_data/basic_links.json', BASE).toString();

  // ======== Utils ========
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

  async function loadJSON(url) {
    const bust = `v=${Date.now()}`; // منع الكاش
    const u = new URL(url, BASE);
    u.searchParams.set('_', bust);
    const r = await fetch(u.toString(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  // ======== Modal (رسائل مخصّصة) ========
  const modal = {
    wrap: $("#modal"),
    title: $("#modalTitle"),
    body: $("#modalBody"),
    actions: $("#modalActions"),
    closeBtn: $("#modalClose"),
    show({ title, html, buttons }) {
      this.title.textContent = title || "رسالة";
      this.body.innerHTML = html || "";
      this.actions.innerHTML = "";
      (buttons || []).forEach(b => {
        const btn = document.createElement("button");
        btn.className = `btn ${b.variant || 'btn-outline'}`;
        btn.textContent = b.text;
        btn.addEventListener('click', () => {
          if (typeof b.onClick === 'function') b.onClick();
        });
        this.actions.appendChild(btn);
      });
      this.wrap.classList.add("show");
    },
    hide(){ this.wrap.classList.remove("show"); }
  };
  modal.closeBtn.addEventListener('click', ()=>modal.hide());
  $(".modal-back").addEventListener('click', ()=>modal.hide());

  // ======== الحالة العامة ========
  let LINKS = null;               // محتوى basic_links.json
  let SUBJECT_BLOCKS = [];        // [{name,count,items:[...]}, ...]
  let MASTER_EXAM = [];           // مصفوفة الأسئلة النهائية
  let FILE_CACHE = new Map();     // مسار → أسئلة
  let shortagesGlobal = [];       // ملاحظات نقص

  // Timer
  let totalMs = 0;                // إجمالي الوقت بالمللي ثانية
  let deadline = 0;
  let tickHandle = null;
  let paused = false;
  let remainMsAtPause = 0;

  let graded = false;

  // ======== Bootstrap ========
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    // اربط الأزرار الثابتة
    $("#toggleLeadBtn").addEventListener("click", toggleLead);
    $("#toggleExpBtn").addEventListener("click", toggleExp);

    // زر البدء مع رسالة تأكيد مخصّصة
    $("#startBtn").addEventListener("click", () => {
      const hh = Number($("#hoursInput").value || 0);
      const mm = Number($("#minsInput").value || 0);
      const total = (hh*60)+mm;

      modal.show({
        title: "تأكيد بدء الاختبار",
        html: `
          <div>هل أنت متأكد من بدء الامتحان الآن؟</div>
          <div class="muted" style="margin-top:6px">المدة المحددة: <b>${hh}</b> ساعة و <b>${mm}</b> دقيقة (الإجمالي ${total} دقيقة).</div>
        `,
        buttons: [
          { text: "إلغاء", variant: "btn-ghost", onClick: () => modal.hide() },
          { text: "ابدأ الآن", variant: "", onClick: async () => { modal.hide(); await safeStart(); } }
        ]
      });
    });

    $("#gradeBtn").addEventListener("click", () => {
      if (graded) return;
      modal.show({
        title: "تأكيد عرض النتيجة",
        html: `<div>بعد عرض النتيجة سيتم إيقاف المؤقّت وتعطيل التعديل على الإجابات.</div>`,
        buttons: [
          { text: "تراجع", variant: "btn-ghost", onClick: ()=>modal.hide() },
          { text: "اعرض النتيجة", variant: "", onClick: ()=>{ modal.hide(); onGrade(); } }
        ]
      });
    });

    // أزرار الفلاتر والعودة
    $("#backBtn").addEventListener("click", () => {
      modal.show({
        title: "العودة إلى واجهة البداية",
        html: `<div>لن يتم حذف الأسئلة، لكن ستعود إلى الواجهة التعريفية.</div>`,
        buttons: [
          { text: "إلغاء", variant: "btn-ghost", onClick: ()=>modal.hide() },
          { text: "موافق", variant: "", onClick: ()=>{ modal.hide(); backToIntro(); } }
        ]
      });
    });

    ["f_ok","f_bad","f_na"].forEach(id => $("#"+id).addEventListener("change", applyFilters));

    // ساعة الإيقاف المؤقت/الاستئناف
    $("#pauseBtn").addEventListener("click", togglePause);

    // افتراضات قبل البدء
    $("#questionsMount").classList.add("lead-hidden");   // إخفاء المصدر
    $("#questionsMount").classList.remove("exp-hidden"); // إظهار الشرح
  });

  async function safeStart(){
    try{
      // حمّل الروابط مرة واحدة قبل البدء (لو لم تُحمّل)
      if (!LINKS) {
        LINKS = await loadJSON(PATH_LINKS);
      }
      await prefetchAllFiles(); // تحميل جميع ملفات data المذكورة داخل basic_links.json
      await onStartExam();      // ابدأ فعلاً
    }catch(e){
      modal.show({
        title: "خطأ",
        html: `<div>تعذّر تحميل الإعدادات: <b>${e.message || e}</b><br>تأكّد من وجود <b>basic_data/basic_links.json</b> ومن صلاحيات الملفات.</div>`,
        buttons: [{ text:"حسناً", variant:"", onClick:()=>modal.hide() }]
      });
      console.error(e);
    }
  }

  // ======== Files ========
  async function prefetchAllFiles(){
    const allPaths = Array.from(new Set((LINKS.subjects || []).flatMap(s => s.files || [])));
    FILE_CACHE = new Map();
    await Promise.all(allPaths.map(async (p) => {
      const abs = new URL(p, BASE).toString();
      try {
        const data = await loadJSON(abs);
        FILE_CACHE.set(abs, Array.isArray(data) ? data : []);
      } catch (err) {
        FILE_CACHE.set(abs, []);
        console.warn("فشل تحميل:", abs, err);
      }
    }));
  }

  // ======== Start Exam ========
  async function onStartExam() {
    const hh = Math.max(0, Math.min(12, Number($("#hoursInput").value || 0)));
    const mm = Math.max(0, Math.min(59, Number($("#minsInput").value || 0)));
    totalMs = (hh * 60 + mm) * 60 * 1000;
    if (totalMs <= 0) {
      modal.show({
        title: "تنبيه",
        html: `<div>يرجى تحديد مدة زمنية صحيحة (ساعة/دقيقة).</div>`,
        buttons: [{ text:"حسناً", variant:"", onClick:()=>modal.hide() }]
      });
      return;
    }

    // كوّن البلوك لكل مادة
    SUBJECT_BLOCKS = [];
    shortagesGlobal = [];

    for (const sub of (LINKS.subjects || [])) {
      const uniqAbs = Array.from(new Set((sub.files || []).map(p => new URL(p, BASE).toString())));
      let pool = [];
      uniqAbs.forEach(abs => pool = pool.concat(FILE_CACHE.get(abs) || []));

      // لفّ الـ span الأول ليصير "مصدر السؤال"
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
    $("#todayBadge").textContent = todayStr();
    renderQuestions(MASTER_EXAM);

    // ملاحظات نقص
    const note = $("#shortageNote");
    if (shortagesGlobal.length) {
      note.innerHTML = `<strong>ملاحظة:</strong> بعض الأقسام تحتوي أسئلة أقل من المطلوب:<br>${shortagesGlobal.join("<br>")}`;
      note.classList.remove("hidden");
    } else note.classList.add("hidden");

    // أعِد الحالات
    $("#questionsMount").classList.add("lead-hidden");   // المصدر مخفي
    $("#questionsMount").classList.remove("exp-hidden"); // الشرح ظاهر

    // تشغيل المؤقّت العائم
    startTimer();
    window.scrollTo({ top: $("#examArea").offsetTop - 8, behavior: "smooth" });
  }

  function wrapLeadSpan(html) {
    if (typeof html !== "string") return html;
    // نغلف أول <span> بكلاس lead-intro إن لم يكن له class
    return html.replace(/<span\b(?![^>]*class=)[^>]*>/i, (m) => {
      if (m.includes("class=")) return m.replace(/class=['"]([^'"]*)['"]/, (_m, c) => `class="lead-intro ${c}"`);
      return m.replace("<span", `<span class="lead-intro"`);
    });
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
        qBox.innerHTML = `
          <h4>#${idx}</h4>
          <div class="stem">${q.question}</div>
          <div class="options">
            ${(q.options || []).map((opt, i) => `
              <label class="opt">
                <input type="radio" name="q_${idx}" value="${i}">
                <div>${typeof opt === "string" ? opt : String(opt)}</div>
              </label>
            `).join("")}
          </div>
          ${q.explanation ? `<details class="muted" style="margin-top:6px"><summary>شرح</summary><div style="margin-top:6px">${typeof q.explanation === "string" ? q.explanation : String(q.explanation)}</div></details>` : ""}
        `;
        section.appendChild(qBox);
        idx++;
      }
    }
  }

  // ======== Toggles ========
  function toggleLead(){
    const mount = $("#questionsMount");
    mount.classList.toggle("lead-hidden");
    $("#toggleLeadBtn").classList.toggle("btn-outline");
    // تغيير نص الزر
    const hidden = mount.classList.contains("lead-hidden");
    $("#toggleLeadBtn").textContent = hidden ? "إظهار مصدر السؤال" : "إخفاء مصدر السؤال";
  }

  function toggleExp(){
    const mount = $("#questionsMount");
    mount.classList.toggle("exp-hidden");
    $("#toggleExpBtn").classList.toggle("btn-outline");
    const hidden = mount.classList.contains("exp-hidden");
    $("#toggleExpBtn").textContent = hidden ? "إظهار الشرح (Explanation)" : "إخفاء الشرح (Explanation)";
  }

  // ======== Grading ========
  function onGrade() {
    if (graded) return;
    graded = true;

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
    $("#scoreText").textContent = `النتيجة: ${ok} / ${(LINKS && LINKS.total) || 200}`;
    $("#resultCard").classList.remove("hidden");

    // تعطيل جميع المدخلات بعد التصحيح
    $$("input[type=radio]").forEach(i => i.disabled = true);

    // إيقاف المؤقت وإظهار الفلاتر
    stopTimer(true);
    $("#filters").classList.remove("hidden");

    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ======== Filters after grading ========
  function applyFilters(){
    const showOK  = $("#f_ok").checked;
    const showBad = $("#f_bad").checked;
    const showNA  = $("#f_na").checked;

    const cards = $$(".q");
    cards.forEach(q => {
      // الحالة من أصناف الخيارات
      const hasCorrect = $$(".opt.correct", q).length > 0;
      const hasWrong   = $$(".opt.wrong", q).length > 0;
      const isNA       = q.classList.contains("unanswered");

      let visible = true;

      const anyFilterOn = showOK || showBad || showNA;
      if (anyFilterOn){
        visible = false;
        if (showOK && hasCorrect && !hasWrong && !isNA) visible = true;
        if (showBad && hasWrong) visible = true;
        if (showNA  && isNA) visible = true;
      }

      q.style.display = visible ? "" : "none";
    });
  }

  function backToIntro(){
    // إخفاء منطقة الامتحان
    $("#examArea").classList.add("hidden");
    $("#intro").classList.remove("hidden");
    // إخفاء النتائج والفلاتر
    $("#resultCard").classList.add("hidden");
    $("#filters").classList.add("hidden");
    graded = false;
    // تنظيف المؤقت
    stopTimer(true);
    // إعادة التمرير للأعلى
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ======== Timer ========
  function startTimer(){
    const fab = $("#timerFab");
    fab.classList.remove("hidden");
    graded = false;
    paused = false;
    $("#pauseBtn").textContent = "إيقاف مؤقت";

    deadline = Date.now() + totalMs;
    renderTick(); // أول تحديث فوري
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(renderTick, 1000);
  }

  function stopTimer(hide){
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    if (hide) $("#timerFab").classList.add("hidden");
  }

  function togglePause(){
    if (!tickHandle && !paused) return; // لم يبدأ
    if (!paused){
      // إيقاف مؤقت: احفظ الباقي
      remainMsAtPause = Math.max(0, deadline - Date.now());
      paused = true;
      clearInterval(tickHandle);
      tickHandle = null;
      $("#pauseBtn").textContent = "استئناف";
    } else {
      // استئناف: أعد تحديد نهاية الوقت
      deadline = Date.now() + remainMsAtPause;
      paused = false;
      renderTick();
      tickHandle = setInterval(renderTick, 1000);
      $("#pauseBtn").textContent = "إيقاف مؤقت";
    }
  }

  function renderTick(){
    const remain = Math.max(0, deadline - Date.now());
    $("#timerClock").textContent = msToHMS(remain);
    if (remain <= 0){
      stopTimer(true);
      if (!graded) onGrade();
    }
  }

  function msToHMS(ms){
    let s = Math.floor(ms/1000);
    const h = Math.floor(s/3600); s -= h*3600;
    const m = Math.floor(s/60);   s -= m*60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
})();
