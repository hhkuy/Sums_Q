/* =========================================================
   Viatosis — Virtual Basic Exam (VBE)
   Reads ONLY: basic_data/basic_links.json
   Samples randomly from listed JSON files.
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
  let LINKS = null;        // content of basic_links.json
  let SUBJECT_BLOCKS = []; // [{name,count,items:[...]}, ...]
  let MASTER_EXAM = [];    // flattened questions
  let FILE_CACHE = new Map(); // path -> array of questions
  let FAILED_FILES = new Set();
  let shortages = [];

  // Timer state
  let examDurationSec = 180 * 60; // default 3h
  let remainingSec = examDurationSec;
  let timerId = null;
  let timerRunning = false;

  /** ---------- Custom Modal (Confirm) ---------- */
  function confirmDialog({ title="تأكيد", message="هل أنت متأكد؟", okText="تأكيد", cancelText="إلغاء" }){
    return new Promise((resolve) => {
      const overlay = $("#overlay");
      $("#modalTitle").textContent = title;
      $("#modalMsg").textContent = message;
      $("#modalOk").textContent = okText;
      $("#modalCancel").textContent = cancelText;
      overlay.style.display = "flex";
      overlay.setAttribute("aria-hidden","false");

      const close = (val) => {
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden","true");
        $("#modalOk").onclick = null;
        $("#modalCancel").onclick = null;
        overlay.onclick = null;
        resolve(val);
      };
      $("#modalOk").onclick = () => close(true);
      $("#modalCancel").onclick = () => close(false);
      overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    });
  }

  /** ---------- DOM Ready ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    try {
      LINKS = await fetch(PATH_LINKS).then(r => r.json()).catch(err => { throw err; });
      // Pre-fetch all files so we can compute counts for About grid
      await prefetchAllFiles(LINKS);
      paintDistributionTiles(LINKS);
    } catch (e) {
      // لا نظهر أي Alert للمتصفح — فقط نسجل في الكونسول
      console.error("Failed to load configuration or files:", e);
      // نعرض ملاحظة خفيفة داخل الصفحة بدلاً من نافذة مزعجة
      const note = $("#shortageNote");
      if (note){
        note.innerHTML = `<strong>Note:</strong> Some resources are not accessible right now. The exam will still try to load available questions.`;
        note.classList.remove("hidden");
      }
    }

    // Bind controls
    $("#startBtn")?.addEventListener("click", onStartExam);
    $("#gradeBtn")?.addEventListener("click", onGrade);
    $("#homeBtn")?.addEventListener("click", onHome);

    $("#toggleLeadBtn")?.addEventListener("click", () => {
      const root = $("#questionsMount");
      root.classList.toggle("lead-hidden");
      $("#toggleLeadBtn").textContent = root.classList.contains("lead-hidden") ? "إظهار مصدر السؤال" : "إخفاء مصدر السؤال";
    });

    $("#toggleExplBtn")?.addEventListener("click", () => {
      const root = $("#questionsMount");
      root.classList.toggle("expl-hidden");
      $("#toggleExplBtn").textContent = root.classList.contains("expl-hidden") ? "إظهار الشرح (Explanation)" : "إخفاء الشرح (Explanation)";
    });

    // Timer buttons
    $("#pauseBtn")?.addEventListener("click", pauseTimer);
    $("#resumeBtn")?.addEventListener("click", resumeTimer);
    $("#resetBtn")?.addEventListener("click", resetTimer);

    // Sync timer preview with input
    updateTimerFromInput();
    $("#durationMinutes")?.addEventListener("input", updateTimerFromInput);
  });

  /** ---------- Pre-fetch all files for About counts ---------- */
  async function prefetchAllFiles(cfg){
    FAILED_FILES = new Set();
    FILE_CACHE = new Map();
    const allPaths = Array.from(new Set(cfg.subjects.flatMap(s => s.files || [])));
    await Promise.all(allPaths.map(async (p) => {
      try {
        const data = await fetch(p).then(r => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        });
        FILE_CACHE.set(p, Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn("Failed to fetch:", p, err);
        FAILED_FILES.add(p);
        FILE_CACHE.set(p, []);
      }
    }));
  }

  /** ---------- About grid: ONLY subject name + total available count ---------- */
  function paintDistributionTiles(cfg) {
    const grid = $("#dist-grid");
    grid.innerHTML = "";
    cfg.subjects.forEach(s => {
      const uniqPaths = Array.from(new Set(s.files || []));
      let pool = [];
      uniqPaths.forEach(p => { pool = pool.concat(FILE_CACHE.get(p) || []); });
      pool = uniqueBy(pool, x => x.qID || null);

      const el = document.createElement("div");
      el.className = "tile";
      el.innerHTML = `
        <strong>${s.name}</strong>
        <div class="muted">${pool.length} questions available</div>
      `;
      grid.appendChild(el);
    });
  }

  /** ---------- Build Exam ---------- */
  async function onStartExam() {
    const ok = await confirmDialog({
      title:"بدء الامتحان",
      message:"هل أنت متأكد من بدء الامتحان؟ سيبدأ العدّ التنازلي مباشرة وفق المدة المحددة.",
      okText:"ابدأ", cancelText:"إلغاء"
    });
    if (!ok) return;

    // Read duration
    const minInput = parseInt($("#durationMinutes").value || "180", 10);
    if (isFinite(minInput) && minInput >= 5) {
      examDurationSec = minInput * 60;
      remainingSec = examDurationSec;
      setTimerLabel(remainingSec);
    }

    $("#startBtn").disabled = true;

    SUBJECT_BLOCKS = [];
    shortages = [];
    const failedFiles = new Set(FAILED_FILES); // from prefetch

    for (const sub of LINKS.subjects) {
      let pool = [];
      const uniqPaths = Array.from(new Set(sub.files || []));
      uniqPaths.forEach(p => { pool = pool.concat(FILE_CACHE.get(p) || []); });

      // Lead intro wrap
      pool = pool.map(q => ({ ...q, question: wrapLeadSpan(q.question) }));
      // Dedup
      pool = uniqueBy(pool, (x) => x.qID || null);

      const shuffled = shuffle(pool);
      let takeN = sub.count;
      if (shuffled.length < sub.count) {
        shortages.push(`• ${sub.name}: available ${shuffled.length} < required ${sub.count}`);
        takeN = shuffled.length;
      }
      const pick = shuffled.slice(0, takeN);
      SUBJECT_BLOCKS.push({ name: sub.name, count: sub.count, items: pick });
    }

    MASTER_EXAM = SUBJECT_BLOCKS.flatMap(b => b.items);

    // Move to exam UI
    $("#intro").classList.add("hidden");
    $("#examArea").classList.remove("hidden");

    const note = $("#shortageNote");
    const parts = [];
    if (shortages.length) {
      parts.push(`<div><strong>Note:</strong> Some sections have fewer available questions than requested:</div><div>${shortages.join("<br>")}</div>`);
    }
    if (failedFiles.size) {
      parts.push(`<div style="margin-top:6px"><strong>Missing/Failed files:</strong><br>${Array.from(failedFiles).map(p=>`• ${p}`).join("<br>")}</div>`);
    }
    if (parts.length) {
      note.innerHTML = parts.join("<hr style='border:none;border-top:1px dashed #fca5a5;margin:8px 0'/>");
      note.classList.remove("hidden");
    } else {
      note.classList.add("hidden");
    }

    renderQuestions(MASTER_EXAM);

    // Initial toggles (default: visible)
    $("#questionsMount").classList.remove("lead-hidden","expl-hidden");

    // Show and start circular timer
    showTimer();
    startTimer();

    window.scrollTo({ top: $("#examArea").offsetTop - 10, behavior: "smooth" });
  }

  function wrapLeadSpan(html) {
    if (typeof html !== "string") return html;
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
      section.innerHTML = `
        <h3 style="margin:0 0 6px 0">${block.name}</h3>
        <div class="muted">${block.items.length} of ${block.count} requested</div>
      `;
      mount.appendChild(section);

      for (const q of block.items) {
        const qBox = document.createElement("div");
        qBox.className = "q";
        qBox.dataset.qid = q.qID || "";
        qBox.dataset.answer = String(q.answer);
        qBox.dataset.status = "";

        const optsHtml = (q.options || []).map((opt, i) => `
          <label class="opt">
            <input type="radio" name="q_${idx}" value="${i}">
            <div>${typeof opt === "string" ? opt : String(opt)}</div>
          </label>
        `).join("");

        const explHtml = q.explanation
          ? `<details class="muted" style="margin-top:6px"><summary>Explanation</summary><div style="margin-top:6px">${typeof q.explanation === "string" ? q.explanation : String(q.explanation)}</div></details>`
          : "";

        qBox.innerHTML = `
          <h4>#${idx}</h4>
          <div class="stem">${q.question}</div>
          <div class="options">${optsHtml}</div>
          ${explHtml}
        `;
        section.appendChild(qBox);
        idx++;
      }
    }
  }

  /** ---------- Grading ---------- */
  async function onGrade() {
    const ok = await confirmDialog({
      title:"عرض النتيجة",
      message:"تريد عرض النتيجة الآن؟ سيتم قفل الإجابات بعد التصحيح.",
      okText:"اعرض النتيجة", cancelText:"رجوع"
    });
    if (!ok) return;

    const qBoxes = $$(".q");
    let okc = 0, bad = 0, na = 0;

    qBoxes.forEach(q => {
      q.classList.remove("unanswered");
      $$(".opt", q).forEach(o => o.classList.remove("correct", "wrong"));

      const ansIdx = Number(q.dataset.answer);
      const chosen = $$("input[type=radio]", q).find(i => i.checked);
      const opts = $$(".opt", q);

      if (!chosen) {
        na++;
        q.classList.add("unanswered");
        q.dataset.status = "na";
        if (opts[ansIdx]) opts[ansIdx].classList.add("correct");
        return;
      }

      const chosenIdx = Number(chosen.value);
      if (chosenIdx === ansIdx) {
        okc++;
        q.dataset.status = "correct";
        opts[chosenIdx]?.classList.add("correct");
      } else {
        bad++;
        q.dataset.status = "wrong";
        opts[chosenIdx]?.classList.add("wrong");
        opts[ansIdx]?.classList.add("correct");
      }

      // Lock after grading
      $$("input[type=radio]", q).forEach(i => i.disabled = true);
    });

    $("#okCount").textContent = okc;
    $("#badCount").textContent = bad;
    $("#naCount").textContent = na;
    $("#scoreText").textContent = `Score: ${okc} / ${LINKS?.total || 200}`;
    $("#resultCard").classList.remove("hidden");
    $("#filtersBar").classList.remove("hidden");
    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** ---------- Filters after grading ---------- */
  function applyFilter(kind){
    const all = $$(".q");
    if (kind === "all") {
      all.forEach(q => q.style.display = "");
      return;
    }
    const kinds = new Set(kind.split("+"));
    all.forEach(q => {
      const st = q.dataset.status || "";
      q.style.display = kinds.has(st) ? "" : "none";
    });
  }
  $("#filtersBar")?.addEventListener?.("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    applyFilter(btn.getAttribute("data-filter"));
  });

  /** ---------- Back to Home with custom confirm ---------- */
  async function onHome(){
    const ok = await confirmDialog({
      title:"الرجوع",
      message:"هل تريد الرجوع إلى الواجهة الرئيسية؟ قد تفقد التقدّم الحالي.",
      okText:"رجوع", cancelText:"إلغاء"
    });
    if (!ok) return;

    clearInterval(timerId);
    timerId = null; timerRunning = false;
    $("#timerFab").style.display = "none";
    $("#questionsMount").innerHTML = "";
    $("#resultCard").classList.add("hidden");
    $("#filtersBar").classList.add("hidden");
    $("#intro").classList.remove("hidden");
    $("#examArea").classList.add("hidden");
    $("#startBtn").disabled = false;
    updateTimerFromInput();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** ---------- Timer (circular) ---------- */
  function showTimer(){
    $("#timerFab").style.display = "flex";
    setTimerRing(remainingSec, examDurationSec);
  }
  function setTimerLabel(sec){
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    $("#timerTime").textContent =
      `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  function setTimerRing(current, total){
    const pct = Math.max(0, Math.min(1, current / total));
    const deg = Math.round(pct * 360);
    $("#timerFab").style.setProperty("--deg", deg + "deg");
  }
  function startTimer(){
    if (timerRunning) return;
    timerRunning = true;
    $("#pauseBtn").classList.remove("hidden");
    $("#resumeBtn").classList.add("hidden");

    timerId = setInterval(() => {
      if (remainingSec > 0) {
        remainingSec--;
        setTimerLabel(remainingSec);
        setTimerRing(remainingSec, examDurationSec);
      } else {
        clearInterval(timerId);
        timerRunning = false;
        confirmDialog({
          title:"انتهى الوقت",
          message:"انتهى الوقت! سيتم عرض النتيجة الآن.",
          okText:"حسناً", cancelText:""
        }).then(() => onGrade());
      }
    }, 1000);
  }
  function pauseTimer(){
    if (!timerRunning) return;
    clearInterval(timerId);
    timerRunning = false;
    $("#pauseBtn").classList.add("hidden");
    $("#resumeBtn").classList.remove("hidden");
  }
  function resumeTimer(){
    if (timerRunning) return;
    startTimer();
  }
  function resetTimer(){
    confirmDialog({
      title:"إعادة المؤقّت",
      message:"إعادة ضبط المؤقّت إلى المدة الأصلية؟",
      okText:"إعادة", cancelText:"إلغاء"
    }).then((ok)=>{
      if (!ok) return;
      remainingSec = examDurationSec;
      setTimerLabel(remainingSec);
      setTimerRing(remainingSec, examDurationSec);
    });
  }
  function updateTimerFromInput(){
    const minInput = parseInt($("#durationMinutes").value || "180", 10);
    const validMin = (isFinite(minInput) && minInput >= 5) ? minInput : 180;
    examDurationSec = validMin * 60;
    remainingSec = examDurationSec;
    setTimerLabel(remainingSec);
    setTimerRing(remainingSec, examDurationSec);
  }

})();
