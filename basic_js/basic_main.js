/* =========================================================
   Viatosis — Virtual Basic Exam (VBE)
   Depends ONLY on: basic_data/basic_links.json
   - Custom modals for Start / Grade / Back
   - Inline circular countdown timer beside date (appears after start)
   - Show Result + Back buttons side-by-side (both with modals)
   - Toggle "Show sources" (lead) & "Show Explanation"
   - Result filter
   - No browser default alerts
   ========================================================= */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const PATH_LINKS = "basic_data/basic_links.json";
  const HOME_URL = "index.html";

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
  let LINKS = null;         // basic_links.json content
  let SUBJECT_BLOCKS = [];  // [{name,count,items:[...]}, ...]
  let MASTER_EXAM = [];     // flattened questions
  let graded = false;

  // Timer state (inline)
  let timerSeconds = 0;
  let timerLeft = 0;
  let timerTick = null;
  let timerPaused = false; // (no pause button required now; but keep state for future)

  /** ---------- DOM Ready ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    // Modal generic close
    $$("[data-close]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const sel = e.currentTarget.getAttribute("data-close");
        const m = $(sel);
        if (m) m.classList.add("hidden");
      });
    });

    // Load links
    try {
      LINKS = await fetch(PATH_LINKS).then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      });
      paintDistributionTiles(LINKS);
    } catch (e) {
      console.error(e);
      const note = $("#shortageNote");
      note.innerHTML = "<strong>تعذر تحميل التهيئة:</strong> basic_data/basic_links.json";
      note.classList.remove("hidden");
    }

    // Handlers
    $("#startBtn").addEventListener("click", () => openModal("#modalStart"));
    $("#confirmStart").addEventListener("click", () => { closeModal("#modalStart"); onStartExam(); });

    $("#toggleLead").addEventListener("change", (e) => applyLeadToggle(!!e.target.checked));
    $("#toggleExplain").addEventListener("change", (e) => applyExplainToggle(!!e.target.checked));

    $("#gradeBtn").addEventListener("click", () => openModal("#modalGrade"));
    $("#confirmGrade").addEventListener("click", () => { closeModal("#modalGrade"); onGrade(); });

    $("#backBtn").addEventListener("click", () => openModal("#modalBack"));
    $("#confirmBack").addEventListener("click", () => {
      closeModal("#modalBack");
      try { window.location.href = HOME_URL; }
      catch { if (window.history.length > 1) window.history.back(); else window.location.reload(); }
    });

    $("#filterSelect").addEventListener("change", onFilterChange);

    // Prepare timer canvas
    drawTimer();
  });

  /** ---------- UI painters ---------- */
  function paintDistributionTiles(cfg) {
    const grid = $("#dist-grid");
    grid.innerHTML = "";
    cfg.subjects.forEach(s => {
      const el = document.createElement("div");
      el.className = "tile";
      // Show only name + count (no file paths)
      el.innerHTML = `<strong>${s.name}</strong>
        <div class="muted">${s.count} question${s.count>1?"s":""}</div>`;
      grid.appendChild(el);
    });
  }

  /** ---------- Building the Exam ---------- */
  async function onStartExam() {
    // Validate duration
    const mins = Number($("#durationMin").value || 180);
    const safeMins = isFinite(mins) ? Math.min(Math.max(mins, 5), 600) : 180;
    $("#durationMin").value = String(safeMins);

    $("#startBtn").disabled = true;

    SUBJECT_BLOCKS = [];
    const shortages = [];
    const failedFiles = new Set();

    // Pre-fetch unique file paths across all subjects
    const allPaths = Array.from(new Set((LINKS?.subjects || []).flatMap(s => s.files)));
    const fileCache = new Map();

    await Promise.all(allPaths.map(async (p) => {
      try {
        const resp = await fetch(p);
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        fileCache.set(p, Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn("Failed to fetch:", p, err);
        failedFiles.add(p);
        fileCache.set(p, []);
      }
    }));

    for (const sub of (LINKS?.subjects || [])) {
      let pool = [];
      const uniqPaths = Array.from(new Set(sub.files || []));
      uniqPaths.forEach(p => { pool = pool.concat(fileCache.get(p) || []); });

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

    // Move UI to exam
    $("#intro").classList.add("hidden");
    $("#examArea").classList.remove("hidden");

    const note = $("#shortageNote");
    const parts = [];
    if (shortages.length) {
      parts.push(`<div><strong>ملاحظة:</strong> بعض الأقسام تحوي أسئلة أقل من المطلوب:</div><div>${shortages.join("<br>")}</div>`);
    }
    if (failedFiles.size) {
      parts.push(`<div style="margin-top:6px"><strong>ملفات لم تُحمّل:</strong><br>${Array.from(failedFiles).map(p=>`• ${p}`).join("<br>")}</div>`);
    }
    if (parts.length) {
      note.innerHTML = parts.join("<hr style='border:none;border-top:1px dashed #fca5a5;margin:8px 0'/>");
      note.classList.remove("hidden");
    } else {
      note.classList.add("hidden");
    }

    renderQuestions();

    // Apply toggles initial state exactly as chosen before start
    applyLeadToggle($("#toggleLead").checked);
    applyExplainToggle($("#toggleExplain").checked);

    // Start inline timer (shows next to date)
    startTimer(safeMins * 60);

    // Scroll to exam
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
      section.setAttribute("data-section", block.name);
      section.innerHTML = `<h3 style="margin:0 0 6px 0">${block.name}</h3>
        <div class="muted">${block.items.length} of ${block.count} requested</div>`;
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

        const explainHtml = q.explanation
          ? `<details class="muted" style="margin-top:6px"><summary>Explanation</summary><div style="margin-top:6px">${typeof q.explanation === "string" ? q.explanation : String(q.explanation)}</div></details>`
          : "";

        qBox.innerHTML = `
          <h4>#${idx}</h4>
          <div class="stem">${q.question}</div>
          <div class="options">${optsHtml}</div>
          ${explainHtml}
        `;

        section.appendChild(qBox);
        idx++;
      }
    }
  }

  /** ---------- Toggles ---------- */
  function applyLeadToggle(show){
    const root = $("#questionsMount");
    if (!root) return;
    root.classList.toggle("lead-hidden", !show);
  }

  function applyExplainToggle(show){
    const dets = $$("details", $("#questionsMount"));
    dets.forEach(d => { if (show) d.setAttribute("open", ""); else d.removeAttribute("open"); });
  }

  /** ---------- Grading & Filter ---------- */
  function onGrade() {
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
        q.dataset.state = "unanswered";
        return;
      }
      const chosenIdx = Number(chosen.value);
      if (chosenIdx === ansIdx) {
        ok++;
        opts[chosenIdx]?.classList.add("correct");
        q.dataset.state = "correct";
      } else {
        bad++;
        opts[chosenIdx]?.classList.add("wrong");
        opts[ansIdx]?.classList.add("correct");
        q.dataset.state = "wrong";
      }
    });

    const totalShown = MASTER_EXAM.length;
    $("#okCount").textContent = ok;
    $("#badCount").textContent = bad;
    $("#naCount").textContent = na;
    $("#scoreText").textContent = `Score: ${ok} / ${totalShown}`;
    $("#resultCard").classList.remove("hidden");
    $("#filterBar").classList.remove("hidden");

    graded = true;
    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onFilterChange(e){
    const val = e.target.value;
    const allQ = $$(".q");
    allQ.forEach(q => {
      const st = q.dataset.state || "na";
      let show = true;
      if (val === "correct") show = (st === "correct");
      else if (val === "wrong") show = (st === "wrong");
      else if (val === "unanswered") show = (st === "unanswered");
      else show = true;
      q.style.display = show ? "" : "none";
    });
  }

  /** ---------- Modals ---------- */
  function openModal(sel){
    const m = $(sel);
    if (m) m.classList.remove("hidden");
  }
  function closeModal(sel){
    const m = $(sel);
    if (m) m.classList.add("hidden");
  }

  /** ---------- Timer (Inline beside date) ---------- */
  function startTimer(seconds){
    timerSeconds = seconds;
    timerLeft = seconds;
    timerPaused = false;
    $("#timerInline").classList.remove("hidden");

    if (timerTick) clearInterval(timerTick);
    timerTick = setInterval(tickTimer, 1000);
    drawTimer();
    updateTimerNums();
  }
  function tickTimer(){
    if (timerPaused) return;
    if (timerLeft > 0) {
      timerLeft--;
      drawTimer();
      updateTimerNums();
    } else {
      clearInterval(timerTick);
      timerTick = null;
      if (!graded) onGrade();
    }
  }
  function updateTimerNums(){
    const t = Math.max(0, timerLeft);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = t % 60;
    const pad = (n)=> String(n).padStart(2,"0");
    $("#timerNums").textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  function drawTimer(){
    const canvas = $("#timerCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const cx = w/2, cy = h/2, r = Math.min(w,h)/2 - 4;
    ctx.clearRect(0,0,w,h);

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Progress arc
    const frac = timerSeconds > 0 ? (timerLeft / timerSeconds) : 0;
    const start = -Math.PI/2;
    const end = start + Math.PI*2*frac;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end, false);
    ctx.strokeStyle = "#7a5af5";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();
  }

})();
