/* =========================================================
   Viatosis — VBE (RTL + Timer + Arabic UI)
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
  let LINKS = null;              // محتوى basic_links.json
  let SUBJECT_BLOCKS = [];       // [{name,count,items:[...]}, ...]
  let MASTER_EXAM = [];          // مصفوفة الأسئلة النهائية
  let FILE_CACHE = new Map();    // مسار → أسئلة
  let shortagesGlobal = [];      // ملاحظات نقص
  // Timer
  let totalMs = 0;               // إجمالي الوقت بالمللي ثانية
  let deadline = 0;              // توقيت الانتهاء (Date.now + totalMs)
  let tickHandle = null;
  let gradedOnce = false;

  /** ---------- Bootstrap ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    try {
      LINKS = await fetch(PATH_LINKS).then(r => r.json());
      // Prefetch all files once to حساب عدد المتاح وعرض التوزيع
      await prefetchAllFiles();
      paintDistributionTilesWithAvailability();

      // Bind UI
      $("#startBtn").addEventListener("click", onStartExam);
      $("#gradeBtn").addEventListener("click", onGrade);
      $("#toggleLeadBtn").addEventListener("click", toggleLead);
      $("#toggleExpBtn").addEventListener("click", toggleExp);
      $("#timerFab").addEventListener("click", ()=>{ /* مجرد عرض */ });

      // Default: إخفاء المصدر (لنطبّق نفس سلوك السابق بعد البدء)
      $("#questionsMount").classList.add("lead-hidden");
      // Default: إظهار الشرح قبل البدء (لنغّيره فقط عند ضغط الزر)
      $("#questionsMount").classList.remove("exp-hidden");
    } catch (e) {
      console.error(e);
      alert("تعذّر تحميل إعدادات الامتحان. تأكد من وجود basic_data/basic_links.json والملفات المشار إليها.");
    }
  });

  /** ---------- Files ---------- */
  async function prefetchAllFiles(){
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

  /** ---------- Distribution (with availability) ---------- */
  function paintDistributionTilesWithAvailability() {
    const grid = $("#dist-grid");
    grid.innerHTML = "";

    LINKS.subjects.forEach(s => {
      const uniq = Array.from(new Set(s.files || []));
      let pool = [];
      uniq.forEach(p => pool = pool.concat(FILE_CACHE.get(p) || []));
      pool = uniqueBy(pool, q => q.qID || null);

      const available = pool.length;
      const el = document.createElement("div");
      el.className = "tile";
      el.innerHTML = `
        <strong>${s.name}</strong>
        <div class="muted">المطلوب: <b>${s.count}</b> سؤال</div>
        <div class="muted">المتاح حاليًا: <b>${available}</b> سؤال</div>
      `;
      grid.appendChild(el);
    });
  }

  /** ---------- Start Exam ---------- */
  async function onStartExam() {
    // وقت الامتحان من المدخلات
    const hh = Math.max(0, Math.min(12, Number($("#hoursInput").value || 0)));
    const mm = Math.max(0, Math.min(59, Number($("#minsInput").value || 0)));
    totalMs = (hh * 60 + mm) * 60 * 1000;
    if (totalMs <= 0) {
      alert("يرجى تحديد مدة زمنية صحيحة (ساعة/دقيقة).");
      return;
    }

    $("#startBtn").disabled = true;

    SUBJECT_BLOCKS = [];
    shortagesGlobal = [];

    for (const sub of LINKS.subjects) {
      const uniq = Array.from(new Set(sub.files || []));
      let pool = [];
      uniq.forEach(p => pool = pool.concat(FILE_CACHE.get(p) || []));
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
    renderQuestions(MASTER_EXAM);

    // ملاحظات نقص
    const note = $("#shortageNote");
    if (shortagesGlobal.length) {
      note.innerHTML = `<strong>ملاحظة:</strong> بعض الأقسام تحتوي أسئلة أقل من المطلوب:<br>${shortagesGlobal.join("<br>")}`;
      note.classList.remove("hidden");
    } else note.classList.add("hidden");

    // تطبيق حالة الأزرار الحالية
    // المصدر: افتراضيًا مخفي حتى قبل البدء
    $("#questionsMount").classList.add("lead-hidden");
    // الشرح: افتراضيًا ظاهر قبل البدء
    $("#questionsMount").classList.remove("exp-hidden");

    // تشغيل المؤقّت العائم
    startTimer();
    window.scrollTo({ top: $("#examArea").offsetTop - 10, behavior: "smooth" });
  }

  function wrapLeadSpan(html) {
    if (typeof html !== "string") return html;
    // نغلف أول <span> بكلاس lead-intro إن لم يكن له class
    return html.replace(/<span\b(?![^>]*class=)[^>]*>/i, (m) => {
      if (m.includes("class=")) return m.replace(/class=['"]([^'"]*)['"]/, (_m, c) => `class="lead-intro ${c}"`);
      return m.replace("<span", `<span class="lead-intro"`);
    });
  }

  function renderQuestions(questions) {
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

  /** ---------- Toggles ---------- */
  function toggleLead(){
    const mount = $("#questionsMount");
    mount.classList.toggle("lead-hidden");
    $("#toggleLeadBtn").classList.toggle("btn-outline");
  }
  function toggleExp(){
    const mount = $("#questionsMount");
    mount.classList.toggle("exp-hidden");
    $("#toggleExpBtn").classList.toggle("btn-outline");
  }

  /** ---------- Grading ---------- */
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
    $("#scoreText").textContent = `النتيجة: ${ok} / ${LINKS.total || 200}`;
    $("#resultCard").classList.remove("hidden");

    // تعطيل جميع المدخلات بعد التصحيح
    $$("input[type=radio]").forEach(i => i.disabled = true);

    // إيقاف المؤقت وإخفاء الزر العائم
    stopTimer(true);

    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** ---------- Timer ---------- */
  function startTimer(){
    const fab = $("#timerFab");
    fab.classList.remove("hidden");
    gradedOnce = false;

    deadline = Date.now() + totalMs;
    renderTick(); // أول تحديث فوري
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(renderTick, 1000);
  }

  function stopTimer(hide){
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    if (hide) $("#timerFab").classList.add("hidden");
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

})();
