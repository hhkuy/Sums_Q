// exp_main.js

// Path to the main topics JSON (located in the exp_data folder)
const TOPICS_JSON_PATH = 'exp_data/exp_topics.json';

// The container element for the dropdown lists
const dropdownsContainer = document.getElementById('dropdowns-container');

// The element where the final content will be displayed
const contentArea = document.getElementById('content-area');

// Variable to store topics data after fetching the JSON
let topicsData = null;

/**
 * Main initialization function.
 */
async function init() {
  try {
    // 1. Fetch topics data from the JSON file
    const response = await fetch(TOPICS_JSON_PATH);
    topicsData = await response.json();

    // 2. Create the first dropdown (main topics) if available
    createDropdown(topicsData.topics, null, 0);
    // لا تغيير على منطق البحث هنا، لأنه خاص بطريقة Dropdown.
  } catch (error) {
    console.error('Error fetching or reading exp_topics.json:', error);
  }
}

/**
 * Create a dropdown list for a given array of topics.
 * @param {Array} subtopicsArray - The array of topics (or subtopics) for which to create a dropdown.
 * @param {HTMLSelectElement} parentSelect - The parent dropdown element (if any).
 * @param {number} level - The level of nesting (0 = main, 1 = sub, etc.).
 */
function createDropdown(subtopicsArray, parentSelect, level) {
  // Create a new select element
  const select = document.createElement('select');
  select.dataset.level = level; // Save the level in the dataset

  // Create default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select --';
  select.appendChild(defaultOption);

  // Add options from the given array
  subtopicsArray.forEach((topicObj, index) => {
    const option = document.createElement('option');
    option.value = index; // Store the index as the option value
    option.textContent = topicObj.title;
    select.appendChild(option);
  });

  // Add change event to this select
  select.addEventListener('change', () => {
    handleSelectionChange(select, subtopicsArray);
  });

  // If no parent dropdown exists, append directly; otherwise, remove all dropdowns of higher level and append
  if (!parentSelect) {
    dropdownsContainer.appendChild(select);
  } else {
    removeDropdownsAfterLevel(level);
    dropdownsContainer.appendChild(select);
  }
}

/**
 * Handle selection change in a dropdown.
 * 1. If the selected topic has subtopics, create a new dropdown.
 * 2. If it has a dataFile (final topic), fetch and display its content.
 * @param {HTMLSelectElement} currentSelect 
 * @param {Array} subtopicsArray 
 */
function handleSelectionChange(currentSelect, subtopicsArray) {
  const selectedIndex = currentSelect.value;
  // Clear the content area as selection may change
  contentArea.innerHTML = '';

  // If nothing is selected, remove all dropdowns that are deeper than the current level
  if (selectedIndex === '') {
    removeDropdownsAfterLevel(currentSelect.dataset.level);
    return;
  }

  // Get the chosen topic object
  const chosenTopic = subtopicsArray[parseInt(selectedIndex)];
  
  // If the chosen topic has subtopics, create a new dropdown for them
  if (chosenTopic.subtopics && chosenTopic.subtopics.length > 0) {
    createDropdown(chosenTopic.subtopics, currentSelect, parseInt(currentSelect.dataset.level) + 1);
  } else {
    // If no subtopics exist, but a dataFile is provided, fetch and display its content
    if (chosenTopic.dataFile) {
      fetchDataAndDisplay(chosenTopic.dataFile);
    }
  }
}

/**
 * Remove all dropdowns that are at a deeper level than the provided level.
 * @param {number} level 
 */
function removeDropdownsAfterLevel(level) {
  const allSelects = dropdownsContainer.querySelectorAll('select');
  allSelects.forEach(sel => {
    if (parseInt(sel.dataset.level) > level) {
      sel.remove();
    }
  });
}

/**
 * Fetch a JSON file from the exp_data folder and display its content.
 * @param {string} dataFileName 
 */
async function fetchDataAndDisplay(dataFileName) {
  try {
    const response = await fetch(`exp_data/${dataFileName}`);
    if (!response.ok) {
      throw new Error(`Error fetching file: ${dataFileName}`);
    }
    const data = await response.json();
    // Assume the JSON contains a 'content' field with HTML
    if (data.content) {
      contentArea.innerHTML = data.content;
    } else {
      contentArea.innerHTML = '<p>No content available.</p>';
    }
    // بعد تحميل المحتوى، إذا وُجد فيديو داخل المحتوى، يتم تهيئة مشغل الفيديو المتقدم
    if (typeof initAdvancedVideoPlayers === 'function') {
      initAdvancedVideoPlayers();
    }
  } catch (error) {
    contentArea.innerHTML = `<p>Error fetching file: ${error.message}</p>`;
  }
}

/**
 * Download PDF function
 * (لا يتم تغيير أي سطر موجود مسبقًا, 
 *  فقط إضفنا العبارة: ( تجدون فورم و تفاصيل الاشتراك في الموقع )
 *  تصغير حجم العلامة المائية إلى 35px,
 *  والألوان تبقى تماماً كما الصفحة الأصلية)
 */
function downloadPdf() {
  // Get the content from the contentArea
  let content = contentArea.innerHTML;

  // العبارة المحدثة للفيديو:
  const subscriptionText = `If you want to watch the video or the content, you must subscribe to the site ( تجدون فورم و تفاصيل الاشتراك في الموقع ).<br>
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://sites.google.com/view/medsums/sums-questions-bank-sqb" alt="QR Code"/>`;

  // استبدال أي .video-container أو <iframe> أو <video> بعنصر الاشتراك الجديد:
  let modifiedContent = content
    .replace(/<div class="video-container"[^>]*>[\s\S]*?<\/div>/gi, function() {
      return `<p>${subscriptionText}</p>`;
    })
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, function() {
      return `<p>${subscriptionText}</p>`;
    })
    .replace(/<video[^>]*>.*?<\/video>/gi, function() {
      return `<p>${subscriptionText}</p>`;
    });

  // فتح نافذة about:blank بنفس تنسيق الصفحة الأصلية
  const printWindow = window.open('about:blank', '_blank');
  printWindow.document.write(
    `<html>
      <head>
        <meta charset="UTF-8">
        <title>Download PDF</title>
        <style>
          @page { size: auto; margin: 0; }
          body {
            margin: 0; 
            padding: 0;
            font-family: 'Cairo', sans-serif; 
            background-color: #fafafa; 
            color: #2c3e50;
          }
          /* watermark بخط أصغر (35px) مع موقعه المائل */
          body::before {
            content: "SUMS Site\\A https://sites.google.com/view/medsums/sums-questions-bank-sqb";
            white-space: pre;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 35px;
            color: rgba(0, 0, 0, 0.07);
            pointer-events: none;
            z-index: 0;
            text-align: center;
          }
          #content {
            position: relative;
            z-index: 1;
            margin: 20px; 
            padding: 20px; 
            font-size: 14px;
            border: none;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          table th, table td {
            border: 1px solid #ccc;
            padding: 10px;
            text-align: left;
          }
          table thead {
            background-color: #f2f2f2;
          }
          h1, h2, h3, h4, h5, h6,
          p, li, td, th, pre, code, span {
            color: #2c3e50;
          }
          /* دعم الرياضيات */
          .mjx-container {
            zoom: 1.2;
          }
        </style>
      </head>
      <body>
        <div id="content">
          ${modifiedContent}
        </div>
        <!-- إضافة MathJax لعرض المعادلات -->
        <script>
          window.MathJax = {
            tex: {
              inlineMath: [['$', '$'], ['\\\\(', '\\\\)']]
            },
            svg: {
              fontCache: 'global'
            }
          };
        <\/script>
        <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"><\/script>
        <script>
          window.onload = function() {
            window.focus();
            window.print();
          };
        <\/script>
      </body>
    </html>`
  );
  printWindow.document.close();
}

/*===================================
  إضافة ميزة الترايغر للصور والفيديو والروابط + 
  إمكانية دمج أكثر من تريغر في نفس الكلمة (multi-trigger),
  وفتح المودال دون تأخير (إزالة fade).
=====================================*/
document.addEventListener('DOMContentLoaded', () => {
  attachMediaTriggers();
});

/**
 * سيتعامل مع العناصر ذات الأصناف:
 *  - image-trigger (data-img="...")
 *  - video-trigger (data-video="...")
 *  - hyperlink-trigger (data-href="...")
 *  - question-trigger (data-qids="...") 
 *  إذا وجد أكثر من نوع لدى العنصر نفسه (مثلاً class="image-trigger video-trigger"...) 
 *  نجعله multi-trigger بلون مختلف.
 */
function attachMediaTriggers() {
  // نجمع كل العناصر التي قد تحتوي على أي من هذه الأصناف
  const possibleTriggers = document.querySelectorAll('.image-trigger, .video-trigger, .hyperlink-trigger, .question-trigger');

  possibleTriggers.forEach(trigger => {
    let countTriggers = 0;
    if (trigger.hasAttribute('data-img')) countTriggers++;
    if (trigger.hasAttribute('data-video')) countTriggers++;
    if (trigger.hasAttribute('data-href')) countTriggers++;
    if (trigger.hasAttribute('data-qids')) countTriggers++;

    // لو وجد أكثر من نوع من الـ data-attributes على نفس العنصر
    if (countTriggers > 1) {
      trigger.classList.add('multi-trigger');
    }

    // تعامل مع كل نوع (صورة/فيديو/رابط/سؤال):
    // صور
    if (trigger.classList.contains('image-trigger') && trigger.hasAttribute('data-img')) {
      trigger.addEventListener('click', () => {
        const imgSrc = trigger.getAttribute('data-img');
        if (imgSrc) {
          showImageModal(imgSrc);
        }
      });
    }

    // فيديو
    if (trigger.classList.contains('video-trigger') && trigger.hasAttribute('data-video')) {
      trigger.addEventListener('click', () => {
        const vidSrc = trigger.getAttribute('data-video');
        if (vidSrc) {
          showVideoModal(vidSrc);
        }
      });
    }

    // رابط
    if (trigger.classList.contains('hyperlink-trigger') && trigger.hasAttribute('data-href')) {
      trigger.addEventListener('click', () => {
        const href = trigger.getAttribute('data-href');
        if (href) {
          window.open(href, '_blank');
        }
      });
    }

    // أسئلة (question-trigger)
    if (trigger.classList.contains('question-trigger') && trigger.hasAttribute('data-qids')) {
      trigger.addEventListener('click', () => {
        const qids = trigger.getAttribute('data-qids');
        if (qids) {
          const idArray = qids.split(',').map(id => id.trim());
          fetchQuestionsAndShowModal(idArray);
        }
      });
    }
  });
}

/**
 * عرض صورة في نافذة مودال دون fade (يفتح فورًا)
 */
function showImageModal(src) {
  const modalDiv = document.createElement('div');
  // أزلنا fade ليكون فوريًا
  modalDiv.classList.add('modal');
  modalDiv.innerHTML = `
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-body text-center">
          <img src="${src}" alt="triggered image" style="max-width:100%;">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);
  const modalObj = new bootstrap.Modal(modalDiv, { backdrop: true });
  modalObj.show();
  modalDiv.addEventListener('hidden.bs.modal', () => {
    modalDiv.remove();
  });
}

/**
 * عرض فيديو في نافذة مودال دون fade
 */
function showVideoModal(src) {
  const modalDiv = document.createElement('div');
  modalDiv.classList.add('modal'); // بدون fade
  modalDiv.innerHTML = `
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-body text-center">
          <video src="${src}" controls style="max-width:100%;">
            المتصفح الخاص بك لا يدعم الفيديو.
          </video>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);
  const modalObj = new bootstrap.Modal(modalDiv, { backdrop: true });
  modalObj.show();
  modalDiv.addEventListener('hidden.bs.modal', () => {
    modalDiv.remove();
  });
}

/*==============================
  الأسئلة (نفس الأكواد السابقة)
===============================*/
/**
 * جلب الأسئلة وعرضها في مودال
 */
async function fetchQuestionsAndShowModal(idArray) {
  let allQuestions = [];
  try {
    for (const fileName of questionFiles) {
      try {
        const res = await fetch(fileName);
        if (res.ok) {
          const questionsInFile = await res.json();
          allQuestions = allQuestions.concat(questionsInFile);
        }
      } catch (err) {
        console.error(`Error fetching file ${fileName}:`, err);
      }
    }

    const filtered = allQuestions.filter(q => idArray.includes(q.qID));
    let questionsHtml = '';
    if (filtered.length > 0) {
      filtered.forEach(q => {
        questionsHtml += 
          `<div class="question-item" data-answer="${q.answer}">
            <h5>${q.question}</h5>
            <form>
              ${q.options.map((option, idx) => 
                `<div class="form-check">
                  <input class="form-check-input" type="radio" name="qID_${q.qID}" id="qID_${q.qID}_opt${idx}" value="${idx}">
                  <label class="form-check-label" for="qID_${q.qID}_opt${idx}">
                    ${option}
                  </label>
                </div>`
              ).join('')}
              <button type="button" class="btn btn-sm btn-primary mt-2" 
                onclick="checkAnswer(this, '${escapeHtml(q.explanation)}', '${escapeHtml(q.answerText)}')">
                Check Answer
              </button>
              <div class="answer-result text-center" style="display: none;"></div>
            </form>
          </div>`;
      });
    } else {
      questionsHtml = '<p>No questions available for this topic.</p>';
    }

    document.getElementById('questionsModalBody').innerHTML = questionsHtml;
    const questionsModal = new bootstrap.Modal(document.getElementById('questionsModal'));
    questionsModal.show();
  } catch (error) {
    console.error('Error merging questions:', error);
    alert('Error loading questions. Check console for details.');
  }
}

/**
 * التحقق من إجابة السؤال
 */
function checkAnswer(btn, explanation, answerText) {
  const questionItem = btn.closest('.question-item');
  const correctIndex = parseInt(questionItem.dataset.answer, 10);
  const form = questionItem.querySelector('form');
  const selectedRadio = form.querySelector('input[type="radio"]:checked');
  const resultDiv = questionItem.querySelector('.answer-result');

  if (!selectedRadio) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<p class="text-danger">No option selected!</p>';
    return;
  }

  const userIndex = parseInt(selectedRadio.value, 10);
  if (userIndex === correctIndex) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<p class="text-success fw-bold">Correct Answer!</p>
                           <p><strong>Explanation:</strong> ${explanation}</p>`;
  } else {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<p class="text-danger fw-bold">Wrong Answer!</p>
                           <p><strong>Correct Answer:</strong> ${answerText}</p>
                           <p><strong>Explanation:</strong> ${explanation}</p>`;
  }
}

/**
 * Utility: Escape HTML Characters
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * رجوع إلى صفحة المواضيع
 */
function goBackToTopics() {
  document.getElementById('pageContent').style.display = 'none';
  document.getElementById('pageTopics').style.display = 'block';
  document.getElementById('topicsSearchContainer').style.display = 'block';
  document.getElementById('floatingButtons').style.display = 'none';
}

/**
 * Scroll to Top
 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Scroll to Bottom
 */
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/**
 * فتح مودال البحث في المحتوى
 */
function openContentSearchModal() {
  const searchModal = new bootstrap.Modal(document.getElementById('contentSearchModal'));
  searchModal.show();
  const input = document.getElementById('contentSearchInput');
  const resultsContainer = document.getElementById('contentSearchResults');
  input.value = '';
  resultsContainer.innerHTML = '';
  input.focus();

  // منع تكرار الحدث
  input.removeEventListener('input', handleContentSearchInput);
  input.addEventListener('input', handleContentSearchInput);
}

/**
 * البحث داخل المحتوى
 */
function handleContentSearchInput() {
  const query = this.value.toLowerCase();
  const resultsContainer = document.getElementById('contentSearchResults');
  resultsContainer.innerHTML = '';
  if (!query.trim()) return;

  const searchableElements = Array.from(document.querySelectorAll(
    '#result p, #result td, #result th, #result h1, #result h2, #result h3, #result h4, #result h5, #result h6, #result li'
  ));

  searchableElements.forEach(el => {
    if (el.innerText.toLowerCase().includes(query)) {
      let snippet = el.innerText;
      if (snippet.length > 150) snippet = snippet.substring(0, 150) + '...';
      const div = document.createElement('div');
      div.classList.add('search-result-item');
      div.innerText = snippet;

      // عند النقر يغلق المودال ثم يمرر إلى العنصر
      div.addEventListener('click', () => {
        const searchModal = bootstrap.Modal.getInstance(document.getElementById('contentSearchModal'));
        searchModal.hide();
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      });
      resultsContainer.appendChild(div);
    }
  });
}

/**
 * بدء التهيئة
 */
init();
