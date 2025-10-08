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
  let LINKS = null;
  let SUBJECT_BLOCKS = [];
  let MASTER_EXAM = [];
  let FILE_CACHE = new Map();
  let shortagesGlobal = [];
  let gradedOnce = false;

  // Timer State
  let totalMs = 0;
  let deadline = 0;
  let remainingMs = 0;
  let tickHandle = null;
  let isPaused = false;

  /** ---------- Bootstrap ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    try {
      LINKS = await fetch(PATH_LINKS).then(r => r.json());
      
      // Bind UI
      $("#startBtn").addEventListener("click", onStartExam);
      $("#gradeBtn").addEventListener("click", onGrade);
      $("#toggleLeadBtn").addEventListener("change", toggleLead);
      $("#toggleExpBtn").addEventListener("change", toggleExp);
      $("#timerFab").addEventListener("click", toggleTimerPause);
      $("#backBtn").addEventListener("click", onBackToIntro);

      $$('#resultFilters input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', applyResultFilters);
      });

    } catch (e) {
      console.error(e);
      showCustomModal("تعذّر تحميل إعدادات الامتحان. تأكد من وجود الملفات المطلوبة.", ()=>{}, true);
    }
  });

  /** ---------- Files (Prefetch on Start) ---------- */
  async function prefetchAllFiles() {
    const allPaths = Array.from(new Set(LINKS.subjects.flatMap(s => s.files || [])));
    FILE_CACHE = new Map();
    // Use Promise.all to fetch concurrently
    await Promise.all(allPaths.map(async (p) => {
      // Don't refetch if already in cache
      if (FILE_CACHE.has(p)) return;
      try {
        const data = await fetch(p).then(r => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        });
        FILE_CACHE.set(p, Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn("فشل تحميل:", p, err);
        FILE_CACHE.set(p, []); // Cache empty array on failure
      }
    }));
  }

  /** ---------- Start Exam ---------- */
  async function onStartExam() {
    const hh = Math.max(0, Number($("#hoursInput").value || 0));
    const mm = Math.max(0, Number($("#minsInput").value || 0));
    totalMs = (hh * 60 + mm) * 60 * 1000;
    if (totalMs <= 0) {
      showCustomModal("يرجى تحديد مدة زمنية صحيحة (ساعة/دقيقة).", () => {}, true);
      return;
    }

    $("#startBtn").disabled = true;
    $("#startBtn").textContent = "جاري التحميل...";

    await prefetchAllFiles();

    SUBJECT_BLOCKS = [];
    shortagesGlobal = [];

    for (const sub of LINKS.subjects) {
      const uniqFiles = Array.from(new Set(sub.files || []));
      let pool = [];
      uniqFiles.forEach(p => pool = pool.concat(FILE_CACHE.get(p) || []));
      
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

    $("#intro").classList.add("hidden");
    $("#examArea").classList.remove("hidden");
    renderQuestions(MASTER_EXAM);
    
    // Reset button state
    $("#startBtn").disabled = false;
    $("#startBtn").textContent = "Start Exam";
    
    const note = $("#shortageNote");
    if (shortagesGlobal.length) {
      note.innerHTML = `<strong>ملاحظة:</strong> بعض الأقسام تحتوي أسئلة أقل من المطلوب:<br>${shortagesGlobal.join("<br>")}`;
      note.classList.remove("hidden");
    } else note.classList.add("hidden");

    applyInitialToggles();
    startTimer();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function wrapLeadSpan(html) {
    if (typeof html !== "string") return html;
    return html.replace(/<span\b(?![^>]*class=)[^>]*>/i, (m) => `<span class="lead-intro">`);
  }

  function renderQuestions(questions) {
    const mount = $("#questionsMount");
    mount.innerHTML = "";
    let idx = 1;
    for (const block of SUBJECT_BLOCKS) {
      const section = document.createElement("div");
      section.className = "card";
      section.innerHTML = `<h3 style="margin:0 0 6px 0">${block.name}</h3><div class="muted">${block.items.length} من ${block.count} المطلوبة</div>`;
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
                <div>${String(opt)}</div>
              </label>
            `).join("")}
          </div>
          ${q.explanation ? `<details class="muted" style="margin-top:6px"><summary>شرح</summary><div style="margin-top:6px">${String(q.explanation)}</div></details>` : ""}
        `;
        section.appendChild(qBox);
        idx++;
      }
    }
  }

  /** ---------- Toggles & Filters ---------- */
  function applyInitialToggles(){
    toggleLead();
    toggleExp();
  }
  function toggleLead() {
    $("#questionsMount").classList.toggle("lead-hidden", !$("#toggleLeadBtn").checked);
  }
  function toggleExp() {
    $("#questionsMount").classList.toggle("exp-hidden", !$("#toggleExpBtn").checked);
  }

  function applyResultFilters(){
    const visibleStatuses = $$('#resultFilters input:checked').map(chk => chk.value);
    $$('.q').forEach(qBox => {
      const isVisible = visibleStatuses.some(status => qBox.classList.contains(status));
      qBox.classList.toggle('filtered-hide', !isVisible);
    });
  }
  
  /** ---------- Grading ---------- */
  function onGrade() {
    if (gradedOnce) return;
    showCustomModal("هل أنت متأكد من رغبتك في إنهاء الامتحان وعرض النتيجة؟", () => {
        gradedOnce = true;
        gradeExam();
    });
  }

  function gradeExam() {
    let ok = 0, bad = 0, na = 0;

    $$(".q").forEach(q => {
      const ansIdx = Number(q.dataset.answer);
      const chosenInput = $$("input[type=radio]", q).find(i => i.checked);
      const opts = $$(".opt", q);

      if (!chosenInput) {
        na++;
        q.classList.add("q-unanswered");
        if (opts[ansIdx]) opts[ansIdx].classList.add("correct");
      } else {
        const chosenIdx = Number(chosenInput.value);
        if (chosenIdx === ansIdx) {
          ok++;
          q.classList.add("q-correct");
          opts[chosenIdx]?.classList.add("correct");
        } else {
          bad++;
          q.classList.add("q-wrong");
          opts[chosenIdx]?.classList.add("wrong");
          opts[ansIdx]?.classList.add("correct");
        }
      }
    });

    $("#okCount").textContent = ok;
    $("#badCount").textContent = bad;
    $("#naCount").textContent = na;
    $("#scoreText").textContent = `النتيجة: ${ok} / ${LINKS.total || 200}`;
    
    $("#resultCard").classList.remove("hidden");
    $("#resultFilters").classList.remove("hidden");
    
    $$("input[type=radio]").forEach(i => i.disabled = true);
    
    stopTimer(true);
    $("#gradeBtn").disabled = true;

    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /** ---------- Timer ---------- */
  function startTimer() {
    const fab = $("#timerFab");
    fab.classList.remove("hidden", "paused");
    isPaused = false;
    gradedOnce = false;

    deadline = Date.now() + totalMs;
    renderTick();
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(renderTick, 1000);
  }

  function stopTimer(hide) {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    if (hide) $("#timerFab").classList.add("hidden");
  }
  
  function toggleTimerPause(){
      isPaused = !isPaused;
      $("#timerFab").classList.toggle("paused", isPaused);
      if(isPaused){
          remainingMs = deadline - Date.now();
          clearInterval(tickHandle);
          $("#timerStatus").textContent = "متوقف مؤقتاً";
      } else {
          deadline = Date.now() + remainingMs;
          renderTick();
          tickHandle = setInterval(renderTick, 1000);
          $("#timerStatus").textContent = "الوقت المتبقي";
      }
  }

  function renderTick() {
    const remain = Math.max(0, deadline - Date.now());
    $("#timerClock").textContent = msToHMS(remain);

    if (remain <= 0) {
      stopTimer(true);
      if (!gradedOnce) {
        showCustomModal("انتهى الوقت! سيتم الآن عرض النتيجة.", gradeExam, true);
      }
    }
  }

  function msToHMS(ms) {
    let s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60);   s -= m * 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /** ---------- Navigation & Reset ---------- */
  function onBackToIntro(){
    showCustomModal("هل تريد حقًا الرجوع؟ سيتم حذف تقدمك في هذا الامتحان.", resetExam);
  }

  function resetExam(){
    stopTimer(true);
    $("#examArea").classList.add("hidden");
    $("#intro").classList.remove("hidden");
    
    // Reset results and filters
    $("#resultCard").classList.add("hidden");
    $("#resultFilters").classList.add("hidden");
    $$('#resultFilters input').forEach(i => i.checked = true);
    
    // Reset state
    gradedOnce = false;
    MASTER_EXAM = [];
    $("#questionsMount").innerHTML = "";
    $("#gradeBtn").disabled = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** ---------- Custom Modal ---------- */
  function showCustomModal(message, onConfirmCallback, isAlert = false) {
    const modal = $("#customModal");
    $("#modalText").textContent = message;
    const confirmBtn = $("#modalConfirmBtn");
    const cancelBtn = $("#modalCancelBtn");

    cancelBtn.classList.toggle('hidden', isAlert);
    
    // Clone and replace to remove old listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener("click", () => {
      onConfirmCallback();
      modal.classList.remove("visible");
    });
    
    cancelBtn.onclick = () => modal.classList.remove("visible");
    modal.classList.add("visible");
  }

})();
