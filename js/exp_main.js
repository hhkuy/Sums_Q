// exp_main.js

// Path to the main topics JSON (located in the exp_data folder)
const TOPICS_JSON_PATH = 'exp_data/exp_topics.json';

// The container element for the dropdown lists (if used in your setup)
const dropdownsContainer = document.getElementById('dropdowns-container') || null;

// The element where the final content will be displayed (if using dropdown approach)
const contentArea = document.getElementById('content-area') || null;

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

    // 2. Create the first dropdown (main topics) if available -- only if your setup uses it
    if (dropdownsContainer && topicsData.topics) {
      createDropdown(topicsData.topics, null, 0);
    }
    // بقية التهيئة الخاصة بعرض المواضيع في accordion
  } catch (error) {
    console.error('Error fetching or reading exp_topics.json:', error);
  }
}

/**
 * Create a dropdown list for a given array of topics. (If needed in your setup)
 */
function createDropdown(subtopicsArray, parentSelect, level) {
  const select = document.createElement('select');
  select.dataset.level = level;

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select --';
  select.appendChild(defaultOption);

  subtopicsArray.forEach((topicObj, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = topicObj.title;
    select.appendChild(option);
  });

  select.addEventListener('change', () => {
    handleSelectionChange(select, subtopicsArray);
  });

  if (!parentSelect) {
    dropdownsContainer.appendChild(select);
  } else {
    removeDropdownsAfterLevel(level);
    dropdownsContainer.appendChild(select);
  }
}

function handleSelectionChange(currentSelect, subtopicsArray) {
  const selectedIndex = currentSelect.value;
  if (!contentArea) return;

  contentArea.innerHTML = '';
  if (selectedIndex === '') {
    removeDropdownsAfterLevel(currentSelect.dataset.level);
    return;
  }

  const chosenTopic = subtopicsArray[parseInt(selectedIndex)];
  if (chosenTopic.subtopics && chosenTopic.subtopics.length > 0) {
    createDropdown(chosenTopic.subtopics, currentSelect, parseInt(currentSelect.dataset.level) + 1);
  } else {
    if (chosenTopic.dataFile) {
      fetchDataAndDisplay(chosenTopic.dataFile);
    }
  }
}

function removeDropdownsAfterLevel(level) {
  const allSelects = dropdownsContainer.querySelectorAll('select');
  allSelects.forEach(sel => {
    if (parseInt(sel.dataset.level) > level) {
      sel.remove();
    }
  });
}

/**
 * Fetch a JSON file from the exp_data folder and display its content (if using dropdown approach).
 */
async function fetchDataAndDisplay(dataFileName) {
  try {
    const response = await fetch(`exp_data/${dataFileName}`);
    if (!response.ok) {
      throw new Error(`Error fetching file: ${dataFileName}`);
    }
    const data = await response.json();
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

/*====================================
  الكود الخاص بالأكوردين (Topics) في الصفحة الرئيسية
=====================================*/
let questionFiles = [];       
let allSearchableElements = [];
let globalTopicsData = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadQuestionFilesFromTopics();
    await loadTopicsAccordion();
  } catch (error) {
    console.error('Error during page load (accordion):', error);
  }
  document.getElementById('topicSearch').addEventListener('input', filterTopics);
});

async function loadQuestionFilesFromTopics() {
  try {
    const res = await fetch('data/topics.json');  // مثال: data/topics.json
    if (!res.ok) throw new Error('Cannot fetch data/topics.json');
    const topicsData = await res.json();
    let allFiles = [];
    topicsData.forEach(topicObj => {
      if (Array.isArray(topicObj.subTopics)) {
        topicObj.subTopics.forEach(sub => {
          if (sub.file) {
            allFiles.push(sub.file);
          }
        });
      }
    });
    questionFiles = [...new Set(allFiles)];
  } catch (err) {
    console.error('Error in loadQuestionFilesFromTopics:', err);
    alert('Failed to load question files from topics.json');
  }
}

async function loadTopicsAccordion() {
  const TOPICS_JSON_PATH = 'exp_data/exp_topics.json';
  const topicsAccordion = document.getElementById('topicsAccordion');
  try {
    const response = await fetch(TOPICS_JSON_PATH);
    if (!response.ok) throw new Error('Cannot fetch exp_topics.json');
    const data = await response.json();
    globalTopicsData = data.topics || [];
    buildAccordion(globalTopicsData, topicsAccordion, 'main', "");
  } catch (error) {
    console.error('Error fetching topics:', error);
    topicsAccordion.innerHTML = '<p class="text-danger">Error loading topics. Ensure your local server is running.</p>';
  }
}

function buildAccordion(topicsArray, parentElement, parentId, currentPath) {
  if (!Array.isArray(topicsArray)) return;
  topicsArray.forEach((topic, index) => {
    const uniqueId = `${parentId}-topic-${index}`;
    const headerId = `heading-${uniqueId}`;
    const collapseId = `collapse-${uniqueId}`;
    let fullPath = currentPath ? currentPath + " - " + topic.title : topic.title;

    const accordionItem = document.createElement('div');
    accordionItem.classList.add('accordion-item');
    accordionItem.innerHTML = 
      `<h2 class="accordion-header" id="${headerId}">
         <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
           data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
           <i class="bi bi-bookmarks-fill me-2"></i> ${topic.title}
         </button>
       </h2>
       <div id="${collapseId}" class="accordion-collapse collapse"
            aria-labelledby="${headerId}"
            data-bs-parent="${parentId !== 'main' ? '#' + parentId : '#topicsAccordion'}">
         <div class="accordion-body" id="body-${uniqueId}">
         </div>
       </div>`;
    parentElement.appendChild(accordionItem);

    const bodyElement = accordionItem.querySelector(`#body-${uniqueId}`);
    if (Array.isArray(topic.subtopics) && topic.subtopics.length > 0) {
      const nestedAccordion = document.createElement('div');
      nestedAccordion.classList.add('accordion');
      nestedAccordion.id = `nested-${uniqueId}`;
      bodyElement.appendChild(nestedAccordion);
      buildAccordion(topic.subtopics, nestedAccordion, `nested-${uniqueId}`, fullPath);
    }

    if (topic.dataFile) {
      const showContentBtn = document.createElement('button');
      showContentBtn.classList.add('btn', 'btn-primary', 'btn-custom', 'btn-show-content');
      showContentBtn.innerHTML = `<i class="bi bi-eye-fill"></i> View Content`;
      showContentBtn.addEventListener('click', () => {
        openContentPage(fullPath, topic.dataFile);
      });
      bodyElement.appendChild(showContentBtn);
    }
  });
}

function filterTopics() {
  const query = document.getElementById('topicSearch').value.trim().toLowerCase();
  const accordion = document.getElementById('topicsAccordion');
  accordion.innerHTML = ''; // clear old results

  if (!query) {
    buildAccordion(globalTopicsData, accordion, 'main', "");
    return;
  }

  const filtered = searchTopicsRecursive(globalTopicsData, query);
  buildAccordion(filtered, accordion, 'main', "");
}

function searchTopicsRecursive(topics, query) {
  let result = [];
  if (!topics) return result;
  topics.forEach(topic => {
    const titleMatch = topic.title.toLowerCase().includes(query);
    let matchedSubtopics = [];
    if (Array.isArray(topic.subtopics)) {
      matchedSubtopics = searchTopicsRecursive(topic.subtopics, query);
    }
    if (titleMatch) {
      result.push(topic);
    } else if (matchedSubtopics.length > 0) {
      let newTopic = Object.assign({}, topic);
      newTopic.subtopics = matchedSubtopics;
      result.push(newTopic);
    }
  });
  return result;
}

async function openContentPage(topicFullPath, dataFile) {
  try {
    const pageTopics = document.getElementById('pageTopics');
    const pageContent = document.getElementById('pageContent');
    const contentTitle = document.getElementById('contentTitle');
    const resultDiv = document.getElementById('result');

    const response = await fetch(`exp_data/${dataFile}`);
    if (!response.ok) throw new Error(`Cannot fetch file: ${dataFile}`);
    const jsonData = await response.json();

    contentTitle.textContent = topicFullPath;
    resultDiv.innerHTML = jsonData.content ? jsonData.content : '<p>No content available.</p>';

    attachQuestionTriggers();
    allSearchableElements = Array.from(document.querySelectorAll('#result p, #result td, #result th, #result h1, #result h2, #result h3, #result h4, #result h5, #result h6, #result li'));

    pageTopics.style.display = 'none';
    document.getElementById('topicsSearchContainer').style.display = 'none';
    pageContent.style.display = 'block';
    document.getElementById('floatingButtons').style.display = 'flex';

    scrollToTop();
    // تهيئة مشغل الفيديو المتقدم إذا وُجد فيديو في المحتوى
    if (typeof initAdvancedVideoPlayers === 'function') {
      initAdvancedVideoPlayers();
    }
  } catch (error) {
    console.error('Error opening content file:', error);
    alert('Error loading content. Check console for details.');
  }
}

/*==============================
  Attach event listeners to .question-trigger elements
===============================*/
function attachQuestionTriggers() {
  const triggers = document.querySelectorAll('.question-trigger');
  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const qids = trigger.getAttribute('data-qids');
      if (qids) {
        const idArray = qids.split(',').map(id => id.trim());
        fetchQuestionsAndShowModal(idArray);
      }
    });
  });
}

/*==============================
  Fetch Questions and Show Modal
===============================*/
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

/*==============================
  Check Answer for a Question
===============================*/
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

/*==============================
  Utility: Escape HTML Characters
===============================*/
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/*==============================
  Download PDF Functionality
  - فتح صفحة about:blank
  - استبدال الفيديوهات والـ iframe برسالة و QR Code
  - إضافة العلامة المائية (Watermark) في الصفحة المنبثقة فقط
  - تضمين MathJax لعرض المعادلات
===============================*/
function downloadPdf() {
  const contentTitle = document.getElementById('contentTitle').textContent;
  let content = document.getElementById('result').innerHTML;

  // استبدال أي فيديو
  let modifiedContent = content.replace(/<video[^>]*>[\s\S]*?<\/video>/g, function() {
    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent("https://sites.google.com/view/medsums/sums-questions-bank-sqb");
    return `<div style="text-align: center; font-size: 16px; margin: 20px 0;">
              <p>To view the video or content, you must subscribe to the website.</p>
              <p>To see the questions related to the topics, please subscribe.</p>
              <p><img src="${qrUrl}" alt="QR Code for subscription" /></p>
            </div>`;
  });
  // استبدال أي iframe
  modifiedContent = modifiedContent.replace(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/g, function() {
    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent("https://sites.google.com/view/medsums/sums-questions-bank-sqb");
    return `<div style="text-align: center; font-size: 16px; margin: 20px 0;">
              <p>To view the video or content, you must subscribe to the website.</p>
              <p>To see the questions related to the topics, please subscribe.</p>
              <p><img src="${qrUrl}" alt="QR Code for subscription" /></p>
            </div>`;
  });

  // فتح نافذة about:blank
  const printWindow = window.open('about:blank', '_blank');
  // كتابة الـ HTML الكامل في النافذة المنبثقة
  printWindow.document.write(
    `<html>
      <head>
        <meta charset="UTF-8">
        <title>Download PDF</title>
        <!-- MathJax for rendering mathematical symbols -->
        <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        <style>
          @page { size: A4; margin: 0mm; }
          body {
            font-family: 'Montserrat', sans-serif; 
            margin: 0;
            padding: 0;
            background: #fff;
            color: #2c3e50;
          }
          h1 { 
            color: #2e4053;
            text-align: center;
            margin-bottom: 20px;
            font-weight: 600;
          }
          #content {
            margin: 0;
            background-color: #fff;
            padding: 20px;
            font-size: 14px;
          }
          /* Watermark layer: لا تظهر إلا في هذه الصفحة المنبثقة */
          .watermark {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0.1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 50px;
            z-index: -1;
            pointer-events: none;
          }
          .watermark a {
            color: inherit;
            text-decoration: none;
            font-size: 20px;
          }
          /* جداول المحتوى */
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
        </style>
      </head>
      <body>
        <div class="watermark">
          <div>SUMS site</div>
          <div><a href="https://sites.google.com/view/medsums/sums-questions-bank-sqb" target="_blank">https://sites.google.com/view/medsums/sums-questions-bank-sqb</a></div>
        </div>
        <h1>${contentTitle}</h1>
        <div id="content">
          ${modifiedContent}
        </div>
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

/**
 * العودة إلى صفحة المواضيع
 */
function goBackToTopics() {
  document.getElementById('pageContent').style.display = 'none';
  document.getElementById('pageTopics').style.display = 'block';
  document.getElementById('topicsSearchContainer').style.display = 'block';
  document.getElementById('floatingButtons').style.display = 'none';
}

/**
 * Scroll Navigation
 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/**
 * Content Search Modal
 */
function openContentSearchModal() {
  const searchModal = new bootstrap.Modal(document.getElementById('contentSearchModal'));
  searchModal.show();
  const input = document.getElementById('contentSearchInput');
  const resultsContainer = document.getElementById('contentSearchResults');
  input.value = '';
  resultsContainer.innerHTML = '';
  input.focus();

  input.removeEventListener('input', handleContentSearchInput);
  input.addEventListener('input', handleContentSearchInput);
}

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
 * تشغيل التهيئة
 */
init();
