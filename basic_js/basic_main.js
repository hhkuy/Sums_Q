/* =========================================================
   Viatosis — VBE (Arabic RTL)
   يقرأ فقط basic_data/basic_links.json عند الضغط على Start
   ويجلب منها روابط data/*.json للسحب العشوائي.
   ========================================================= */
(function () {
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const PATH_LINKS = "basic_data/basic_links.json";

  // ---------- Utils ----------
  const todayStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  };
  const uniqueBy = (arr, keyFn) => {
    const seen = new Set(); const out=[];
    for(const x of arr){
      const k = keyFn(x);
      if (k==null){ out.push(x); continue; }
      if (!seen.has(k)){ seen.add(k); out.push(x); }
    }
    return out;
  };

  // ---------- State ----------
  let LINKS = null;
  let SUBJECT_BLOCKS = [];
  let MASTER_EXAM = [];
  let FILE_CACHE = new Map();
  let shortagesGlobal = [];

  // Timer state
  let totalMs = 0;
  let deadline = 0;
  let tickHandle = null;
  let paused = false;
  let remainingPaused = 0;

  let gradedOnce = false;

  // Toggles (from checkboxes)
  let showLead = false;  // اظهار مصدر السؤال
  let showExp  = false;  // اظهار الشرح

  // ---------- Modal (custom confirm) ----------
  function confirmModal(message, title="تأكيد"){
    return new Promise((resolve)=>{
      $("#modalTitle").textContent = title;
      $("#modalMsg").innerHTML = message;
      const back = $("#modalBack");
      back.style.display = "flex";
      back.setAttribute("aria-hidden","false");
      const onOk = ()=>{ cleanup(); resolve(true); };
      const onCancel = ()=>{ cleanup(); resolve(false); };
      function cleanup(){
        $("#modalOk").removeEventListener("click", onOk);
        $("#modalCancel").removeEventListener("click", onCancel);
        back.style.display="none";
        back.setAttribute("aria-hidden","true");
      }
      $("#modalOk").addEventListener("click", onOk);
      $("#modalCancel").addEventListener("click", onCancel);
    });
  }

  // ---------- Bootstrap ----------
  document.addEventListener("DOMContentLoaded", () => {
    $("#todayBadge").textContent = todayStr();
    $("#yearNow").textContent = new Date().getFullYear();

    // إعدادات الإظهار قبل البدء
    $("#showLeadChk").addEventListener("change", (e)=> showLead = e.target.checked);
    $("#showExpChk").addEventListener("change",  (e)=> showExp  = e.target.checked);

    $("#startBtn").addEventListener("click", onStartExam);
    $("#gradeBtn").addEventListener("click", onGrade);
    $("#pauseBtn").addEventListener("click", togglePause);
    $("#backBtn").addEventListener("click", onBackHome);

    // فلاتر بعد التصحيح
    $("#fltOk").addEventListener("change", applyFilters);
    $("#fltBad").addEventListener("change", applyFilters);
    $("#fltNa").addEventListener("change", applyFilters);

    // قيم ابتدائية
    showLead = $("#showLeadChk").checked;
    showExp  = $("#showExpChk").checked;
  });

  // ---------- Start Exam ----------
  async function onStartExam(){
    // قراءة الوقت
    const hh = Math.max(0, Math.min(12, Number($("#hoursInput").value || 0)));
    const mm = Math.max(0, Math.min(59, Number($("#minsInput").value || 0)));
    totalMs = (hh*60 + mm) * 60 * 1000;
    if (totalMs <= 0){
      await confirmModal("يرجى تحديد مدة زمنية صحيحة (ساعة/دقيقة).");
      return;
    }

    // لا نقرأ الملفات إلا هنا
    try {
      LINKS = await fetch(PATH_LINKS).then(r=>r.json());
    } catch(e){
      console.error(e);
      await confirmModal("تعذّر تحميل ملف الإعداد basic_data/basic_links.json.");
      return;
    }

    // نجلب كل الملفات المذكورة مرّة واحدة
    FILE_CACHE = new Map();
    const allPaths = Array.from(new Set(LINKS.subjects.flatMap(s=>s.files || [])));
    await Promise.all(allPaths.map(async p=>{
      try{
        const data = await fetch(p).then(r=>{
          if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          return r.json();
        });
        FILE_CACHE.set(p, Array.isArray(data)?data:[]);
      }catch(err){
        console.warn("فشل تحميل:", p, err);
        FILE_CACHE.set(p, []);
      }
    }));

    // إعداد البلوكات وسحب الأسئلة
    SUBJECT_BLOCKS = [];
    shortagesGlobal = [];
    for(const sub of LINKS.subjects){
      const uniq = Array.from(new Set(sub.files||[]));
      let pool = [];
      uniq.forEach(p => pool = pool.concat(FILE_CACHE.get(p) || []));
      // لف أول span كمصدر
      pool = pool.map(q => ({...q, question: wrapLeadSpan(q.question)}));
      pool = uniqueBy(pool, q=>q.qID || null);

      const shuffled = shuffle(pool);
      let takeN = sub.count;
      if (shuffled.length < sub.count){
        shortagesGlobal.push(`• ${sub.name}: المتاح ${shuffled.length} < المطلوب ${sub.count}`);
        takeN = shuffled.length;
      }
      SUBJECT_BLOCKS.push({ name: sub.name, count: sub.count, items: shuffled.slice(0, takeN) });
    }

    MASTER_EXAM = SUBJECT_BLOCKS.flatMap(b => b.items);

    // إظهار منطقة الامتحان
    $("#home").classList.add("hidden");
    $("#examArea").classList.remove("hidden");
    renderQuestions();

    const note = $("#shortageNote");
    if (shortagesGlobal.length){
      note.innerHTML = `<strong>ملاحظة:</strong> بعض الأقسام تحتوي أسئلة أقل من المطلوب:<br>${shortagesGlobal.join("<br>")}`;
      note.classList.remove("hidden");
    } else note.classList.add("hidden");

    // تطبيق مفاتيح الإظهار حسب اختيارات المستخدم قبل البدء
    const mount = $("#questionsMount");
    if (!showLead) mount.classList.add("lead-hidden"); else mount.classList.remove("lead-hidden");
    if (!showExp)  mount.classList.add("exp-hidden");  else mount.classList.remove("exp-hidden");

    // تشغيل الساعة
    startTimer();
    window.scrollTo({ top: $("#examArea").offsetTop - 10, behavior: "smooth" });
  }

  function wrapLeadSpan(html){
    if (typeof html!=="string") return html;
    // نضيف class="lead-intro" لأول span (إن لم يحتوي على class)
    return html.replace(/<span\b(?![^>]*class=)[^>]*>/i, m => m.replace("<span", `<span class="lead-intro"`));
  }

  function renderQuestions(){
    const mount = $("#questionsMount");
    mount.innerHTML = "";

    let idx = 1;
    for(const block of SUBJECT_BLOCKS){
      const section = document.createElement("div");
      section.className = "card";
      section.innerHTML = `
        <h3 style="margin:0 0 6px 0">${block.name}</h3>
        <div class="muted">${block.items.length} من ${block.count} المطلوبة</div>
      `;
      mount.appendChild(section);

      for(const q of block.items){
        const qBox = document.createElement("div");
        qBox.className = "q";
        qBox.dataset.qid = q.qID || "";
        qBox.dataset.answer = String(q.answer);

        qBox.innerHTML = `
          <h4>#${idx}</h4>
          <div class="stem">${q.question}</div>
          <div class="options">
            ${(q.options || []).map((opt,i)=>`
              <label class="opt">
                <input type="radio" name="q_${idx}" value="${i}">
                <div>${typeof opt==="string" ? opt : String(opt)}</div>
              </label>
            `).join("")}
          </div>
          ${q.explanation
            ? `<details class="muted" style="margin-top:6px"><summary>شرح</summary><div style="margin-top:6px">${typeof q.explanation==="string" ? q.explanation : String(q.explanation)}</div></details>`
            : ""
          }
        `;
        section.appendChild(qBox);
        idx++;
      }
    }
  }

  // ---------- Grading ----------
  async function onGrade(){
    const ok = await confirmModal("هل تريد إنهاء الامتحان وعرض النتيجة؟","تأكيد عرض النتيجة");
    if (!ok) return;

    if (gradedOnce) return;
    gradedOnce = true;

    const qBoxes = $$(".q");
    let okN=0, badN=0, naN=0;

    qBoxes.forEach(q=>{
      q.classList.remove("unanswered","is-correct","is-wrong","is-na");
      $$(".opt",q).forEach(o=>o.classList.remove("correct","wrong"));
      const ansIdx = Number(q.dataset.answer);
      const chosen = $$("input[type=radio]", q).find(i=>i.checked);
      const opts = $$(".opt", q);

      if (!chosen){
        naN++; q.classList.add("unanswered","is-na");
        if (opts[ansIdx]) opts[ansIdx].classList.add("correct");
        return;
      }
      const chosenIdx = Number(chosen.value);
      if (chosenIdx === ansIdx){
        okN++; q.classList.add("is-correct");
        opts[chosenIdx]?.classList.add("correct");
      } else {
        badN++; q.classList.add("is-wrong");
        opts[chosenIdx]?.classList.add("wrong");
        opts[ansIdx]?.classList.add("correct");
      }
    });

    $("#okCount").textContent  = okN;
    $("#badCount").textContent = badN;
    $("#naCount").textContent  = naN;
    $("#scoreText").textContent = `النتيجة: ${okN} / ${(LINKS && LINKS.total) || 200}`;
    $("#resultCard").classList.remove("hidden");

    // تعطيل الاختيارات
    $$("input[type=radio]").forEach(i=>i.disabled=true);

    // إظهار الفلاتر
    $("#filtersBar").classList.remove("hidden");
    applyFilters();

    // إيقاف المؤقّت
    stopTimer(true);

    $("#resultCard").scrollIntoView({behavior:"smooth", block:"center"});
  }

  // ---------- Filters ----------
  function applyFilters(){
    const showOk = $("#fltOk").checked;
    const showBad= $("#fltBad").checked;
    const showNa = $("#fltNa").checked;

    const all = $$(".q");
    all.forEach(q=>{
      const isOk = q.classList.contains("is-correct");
      const isBad= q.classList.contains("is-wrong");
      const isNa = q.classList.contains("is-na");

      let visible = false;
      if (isOk && showOk) visible = true;
      if (isBad && showBad) visible = true;
      if (isNa && showNa)  visible = true;

      q.style.display = visible ? "" : "none";
    });
  }

  // ---------- Back to home ----------
  async function onBackHome(){
    const ok = await confirmModal("سيتم إلغاء الامتحان الحالي والعودة للواجهة الرئيسية. هل تريد المتابعة؟","تنبيه");
    if (!ok) return;

    // إعادة كل شيء
    stopTimer(true);
    gradedOnce = false;
    MASTER_EXAM = [];
    SUBJECT_BLOCKS = [];
    shortagesGlobal = [];
    $("#filtersBar").classList.add("hidden");
    $("#resultCard").classList.add("hidden");
    $("#questionsMount").innerHTML = "";
    $("#examArea").classList.add("hidden");
    $("#home").classList.remove("hidden");
    // إعادة اختيار الإظهار طبقًا للcheckboxes
    const mount = $("#questionsMount");
    mount.classList.remove("lead-hidden","exp-hidden");
  }

  // ---------- Timer ----------
  function startTimer(){
    const fab = $("#timerFab");
    fab.classList.remove("hidden");
    gradedOnce = false;
    paused = false;
    $("#pauseBtn").textContent = "إيقاف مؤقت";

    deadline = Date.now() + totalMs;
    renderTick();
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(renderTick, 1000);
  }
  function togglePause(){
    if (!tickHandle && !paused) return;
    if (!paused){
      // إيقاف
      paused = true;
      remainingPaused = Math.max(0, deadline - Date.now());
      clearInterval(tickHandle); tickHandle=null;
      $("#timerFab").classList.add("paused");
      $("#pauseBtn").textContent = "استمرار";
    } else {
      // استمرار
      paused = false;
      deadline = Date.now() + remainingPaused;
      $("#timerFab").classList.remove("paused");
      $("#pauseBtn").textContent = "إيقاف مؤقت";
      renderTick();
      tickHandle = setInterval(renderTick, 1000);
    }
  }
  function stopTimer(hide){
    if (tickHandle){ clearInterval(tickHandle); tickHandle=null; }
    paused = false;
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
