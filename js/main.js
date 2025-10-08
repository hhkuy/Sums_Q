/* =========================================================
   Viatosis — Virtual Basic Exam (VBE)
   Reads ONLY: basic_data/basic_links.json
   Then fetches each subject.files[] JSON and samples randomly.
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

  /** ---------- DOM Ready ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    try {
      LINKS = await fetch(PATH_LINKS).then(r => r.json());

      // Pre-fetch all files ON LOAD so we can compute counts for About grid
      await prefetchAllFiles(LINKS);
      paintDistributionTiles(LINKS);

      // Bind controls
      $("#startBtn").addEventListener("click", onStartExam);
      $("#gradeBtn").addEventListener("click", onGrade);
      $("#homeBtn").addEventListener("click", onHome);

      $("#toggleLeadBtn").addEventListener("click", () => {
        const root = $("#questionsMount");
        root.classList.toggle("lead-hidden");
        // Toggle button text
        $("#toggleLeadBtn").textContent = root.classList.contains("lead-hidden") ? "إظهار مصدر السؤال" : "إخفاء مصدر السؤال";
      });

      $("#toggleExplBtn").addEventListener("click", () => {
        const root = $("#questionsMount");
        root.classList.toggle("expl-hidden");
        $("#toggleExplBtn").textContent = root.classList.contains("expl-hidden") ? "إظهار الشرح (Explanation)" : "إخفاء الشرح (Explanation)";
      });

      // Timer controls
      $("#pauseBtn").addEventListener("click", pauseTimer);
      $("#resumeBtn").addEventListener("click", resumeTimer);
      $("#resetBtn").addEventListener("click", resetTimer);

      // Filters bar (event delegation)
      $("#filtersBar").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-filter]");
        if (!btn) return;
        applyFilter(btn.getAttribute("data-filter"));
      });

      // Initialize timer display according to input
      updateTimerFromInput(); // sets remainingSec & label

      // Keep timer preview synced when user changes duration before start
      $("#durationMinutes").addEventListener("input", updateTimerFromInput);

    } catch (e) {
      console.error(e);
      alert("Failed to load configuration: basic_data/basic_links.json");
    }
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

  /** ---------- About grid: show subject name + total available count ONLY ---------- */
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
    // Confirmation (8)
    if (!confirm("هل أنت متأكد من بدء الامتحان؟ سيبدأ العدّ التنازلي مباشرة.")) return;

    // Read duration (2)
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
      // Merge and deduplicate questions per subject
      let pool = [];
      const uniqPaths = Array.from(new Set(sub.files || []));
      uniqPaths.forEach(p => { pool = pool.concat(FILE_CACHE.get(p) || []); });

      // Wrap lead-intro span for toggle
      pool = pool.map(q => ({ ...q, question: wrapLeadSpan(q.question) }));
      // Deduplicate by qID if present
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

    // Apply initial hides according to buttons state (default: not hidden)
    applyLeadToggle(false);
    applyExplToggle(false);

    // Show and start timer
    showTimer();
    startTimer();

    // Scroll to exam
    window.scrollTo({ top: $("#examArea").offsetTop - 10, behavior: "smooth" });
  }

  function wrapLeadSpan(html) {
    if (typeof html !== "string") return html;
    // ضع أول <span> ضمن class=lead-intro إن لم يكن فيه class
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
      section.innerHTML = `
        <h3 style="margin:0 0 6px 0">${block.name}</h3>
        <div class="muted">${block.items.length} of ${block.count} requested</div>
      `;
      mount.appendChild(section);

      for (const q of block.items) {
        const qBox = document.createElement("div");
        qBox.className = "q";
        qBox.dataset.qid = q.qID || "";
        qBox.dataset.answer = String(q.answer); // numeric index expected
        qBox.dataset.status = ""; // will be set after grading

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

  /** ---------- Toggle helpers ---------- */
  function applyLeadToggle(show){
    const root = $("#questionsMount");
    if (!root) return;
    root.classList.toggle("lead-hidden", !show);
  }
  function applyExplToggle(show){
    const root = $("#questionsMount");
    if (!root) return;
    root.classList.toggle("expl-hidden", !show);
  }

  /** ---------- Grading ---------- */
  function onGrade() {
    // Confirmation (8)
    if (!confirm("تأكيد عرض النتيجة الآن؟ لا يمكنك تغيير الإجابات بعد التصحيح.")) return;

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
        q.dataset.status = "na";
        if (opts[ansIdx]) opts[ansIdx].classList.add("correct");
        return;
      }

      const chosenIdx = Number(chosen.value);
      if (chosenIdx === ansIdx) {
        ok++;
        q.dataset.status = "correct";
        opts[chosenIdx]?.classList.add("correct");
      } else {
        bad++;
        q.dataset.status = "wrong";
        opts[chosenIdx]?.classList.add("wrong");
        opts[ansIdx]?.classList.add("correct");
      }

      // Lock choices after grading
      $$("input[type=radio]", q).forEach(i => i.disabled = true);
    });

    $("#okCount").textContent = ok;
    $("#badCount").textContent = bad;
    $("#naCount").textContent = na;
    $("#scoreText").textContent = `Score: ${ok} / ${LINKS?.total || 200}`;
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

  /** ---------- Back to Home with confirmation ---------- */
  function onHome(){
    if (!confirm("هل تريد الرجوع إلى الواجهة الرئيسية؟ قد تفقد التقدّم الحالي.")) return;
    // Reset all state visually (soft reset to intro)
    clearInterval(timerId);
    timerId = null; timerRunning = false;
    $("#timerFab").style.display = "none";
    $("#questionsMount").innerHTML = "";
    $("#resultCard").classList.add("hidden");
    $("#filtersBar").classList.add("hidden");
    $("#intro").classList.remove("hidden");
    $("#examArea").classList.add("hidden");
    $("#startBtn").disabled = false;
    applyFilter("all");
    updateTimerFromInput();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** ---------- Timer ---------- */
  function showTimer(){
    $("#timerFab").style.display = "block";
    $("#timerState").textContent = "Running";
  }
  function setTimerLabel(sec){
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    $("#timerTime").textContent =
      `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  function startTimer(){
    if (timerRunning) return;
    timerRunning = true;
    $("#pauseBtn").classList.remove("hidden");
    $("#resumeBtn").classList.add("hidden");
    $("#timerState").textContent = "Running";

    timerId = setInterval(() => {
      if (remainingSec > 0) {
        remainingSec--;
        setTimerLabel(remainingSec);
      } else {
        clearInterval(timerId);
        timerRunning = false;
        $("#timerState").textContent = "Time up";
        alert("انتهى الوقت! سيتم عرض النتيجة الآن.");
        onGrade();
      }
    }, 1000);
  }
  function pauseTimer(){
    if (!timerRunning) return;
    clearInterval(timerId);
    timerRunning = false;
    $("#pauseBtn").classList.add("hidden");
    $("#resumeBtn").classList.remove("hidden");
    $("#timerState").textContent = "Paused";
  }
  function resumeTimer(){
    if (timerRunning) return;
    startTimer();
  }
  function resetTimer(){
    if (!confirm("إعادة ضبط المؤقّت إلى المدة الأصلية؟")) return;
    remainingSec = examDurationSec;
    setTimerLabel(remainingSec);
    if (!timerRunning){
      $("#timerState").textContent = "Ready";
    }
  }
  function updateTimerFromInput(){
    const minInput = parseInt($("#durationMinutes").value || "180", 10);
    const validMin = (isFinite(minInput) && minInput >= 5) ? minInput : 180;
    examDurationSec = validMin * 60;
    remainingSec = examDurationSec;
    setTimerLabel(remainingSec);
  }

  /** ---------- Lead/Explanation toggles initial state ---------- */
  function applyLeadToggle(show){ // re-declared to satisfy hoisting usage above
    const root = $("#questionsMount");
    if (!root) return;
    root.classList.toggle("lead-hidden", !show);
  }
  function applyExplToggle(show){
    const root = $("#questionsMount");
    if (!root) return;
    root.classList.toggle("expl-hidden", !show);
  }

})();
