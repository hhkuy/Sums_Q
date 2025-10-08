/* =========================================================
   Viatosis — Virtual Basic Exam (VBE)
   NO dependency on topics.json at all.
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
  const baseName = (path) => {
    const ix = path.lastIndexOf("/");
    return ix >= 0 ? path.slice(ix + 1) : path;
  };

  /** ---------- State ---------- */
  let LINKS = null;        // content of basic_links.json
  let SUBJECT_BLOCKS = []; // [{name,count,items:[...]}, ...]
  let MASTER_EXAM = [];    // flattened 200 questions

  /** ---------- Start ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    try {
      LINKS = await fetch(PATH_LINKS).then(r => r.json());
      paintDistributionTiles(LINKS);

      $("#startBtn").addEventListener("click", onStartExam);
      $("#toggleLead").addEventListener("change", onToggleLead);
      $("#gradeBtn").addEventListener("click", onGrade);
    } catch (e) {
      console.error(e);
      alert("Failed to load configuration: basic_data/basic_links.json");
    }
  });

  function paintDistributionTiles(cfg) {
    const grid = $("#dist-grid");
    grid.innerHTML = "";
    cfg.subjects.forEach(s => {
      const el = document.createElement("div");
      el.className = "tile";
      el.innerHTML = `<strong>${s.name}</strong>
        <div class="muted">${s.count} question${s.count>1?"s":""}</div>
        <div style="margin-top:6px;font-size:.9rem;color:#334155">
          <b>Files:</b>
          <ul style="margin:6px 0 0 18px;padding:0">
            ${s.files.map(f => `<li>${baseName(f)}</li>`).join("")}
          </ul>
        </div>`;
      grid.appendChild(el);
    });
  }

  /** ---------- Build Exam ---------- */
  async function onStartExam() {
    $("#startBtn").disabled = true;

    // Fetch all needed files per subject (deduplicate within subject, but not across if same OK)
    SUBJECT_BLOCKS = [];
    const shortages = [];
    const failedFiles = new Set();

    // Pre-fetch cache: avoid loading same file multiple times across subjects
    const allPaths = Array.from(new Set(LINKS.subjects.flatMap(s => s.files)));
    const fileCache = new Map();
    await Promise.all(allPaths.map(async (p) => {
      try {
        const data = await fetch(p).then(r => {
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        });
        fileCache.set(p, Array.isArray(data) ? data : []);
      } catch (err) {
        console.warn("Failed to fetch:", p, err);
        failedFiles.add(p);
        fileCache.set(p, []);
      }
    }));

    for (const sub of LINKS.subjects) {
      // merge files into a pool
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

    // UI move to exam
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
    applyLeadToggle($("#toggleLead").checked);
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
      section.innerHTML = `<h3 style="margin:0 0 6px 0">${block.name}</h3>
        <div class="muted">${block.items.length} of ${block.count} requested</div>`;
      mount.appendChild(section);

      for (const q of block.items) {
        const qBox = document.createElement("div");
        qBox.className = "q";
        qBox.dataset.qid = q.qID || "";
        qBox.dataset.answer = String(q.answer); // numeric index expected
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
          ${q.explanation ? `<details class="muted" style="margin-top:6px"><summary>Explanation</summary><div style="margin-top:6px">${typeof q.explanation === "string" ? q.explanation : String(q.explanation)}</div></details>` : ""}
        `;
        section.appendChild(qBox);
        idx++;
      }
    }
  }

  /** ---------- Lead toggle ---------- */
  function onToggleLead(e){ applyLeadToggle(!!e.target.checked); }
  function applyLeadToggle(show){
    const root = $("#questionsMount");
    if (!root) return;
    root.classList.toggle("lead-hidden", !show);
  }

  /** ---------- Grading ---------- */
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
    $("#scoreText").textContent = `Score: ${ok} / ${LINKS.total || 200}`;
    $("#resultCard").classList.remove("hidden");
    $("#resultCard").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // Set header date after DOM ready
  document.addEventListener("DOMContentLoaded", ()=>{
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();
  });

})();
