// exp_main.js

// Path to the main topics JSON (located in the exp_data folder)
const TOPICS_JSON_PATH = 'exp_data/exp_topics.json';

// The container element for the dropdown lists
const dropdownsContainer = document.getElementById('dropdowns-container') || null;

// The element where the final content will be displayed
const contentArea = document.getElementById('content-area') || null;

// Variable to store topics data after fetching the JSON
let topicsData = null;

/**
 * Main initialization function (if you are using the dropdown approach).
 * If you are not using this approach, you can ignore or remove.
 */
async function init() {
  if (!dropdownsContainer || !contentArea) {
    // قد لا نستخدم هذه الطريقة في هذا المشروع
    return;
  }
  try {
    // 1. Fetch topics data from the JSON file
    const response = await fetch(TOPICS_JSON_PATH);
    topicsData = await response.json();

    // 2. Create the first dropdown (main topics) if available
    createDropdown(topicsData.topics, null, 0);
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
  if (contentArea) {
    contentArea.innerHTML = '';
  }

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
  if (!contentArea) return;
  try {
    const response = await fetch(`exp_data/${dataFileName}`);
    if (!response.ok) {
      throw new Error(`Error fetching file: ${dataFileName}`);
    }
    const data = await response.json();
    // Assume the JSON contains a 'content' field with HTML
    if (data.content) {
      contentArea.innerHTML = data.content;
      // من الممكن تطبيق نفس منطق تهيئة الفيديو إن أردت:
      initDefaultVideosInDropdown();
    } else {
      contentArea.innerHTML = '<p>No content available.</p>';
    }
  } catch (error) {
    contentArea.innerHTML = `<p>Error fetching file: ${error.message}</p>`;
  }
}

/**
 * مثال بسيط لتهيئة الفيديو الافتراضي ضمن طريقة الـ Dropdown
 * نطبق نفس أفكار ملفنا الأساسي
 */
function initDefaultVideosInDropdown() {
  if (!contentArea) return;
  const videos = contentArea.querySelectorAll('video');
  videos.forEach(video => {
    // تغليفه بحاوية
    const container = document.createElement('div');
    container.classList.add('default-video-container');
    video.setAttribute('controls', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('controlsList', 'nodownload');
    video.parentNode.insertBefore(container, video);
    container.appendChild(video);

    // لو أردت التكبير باللمس هنا أيضاً، يمكنك استدعاء دالة pinch & pan
    initPinchZoomAndPanDropdown(container, video);
  });
}

/**
 * دالة تمكين التكبير والتحريك باللمس في وضع الـ Dropdown
 */
function initPinchZoomAndPanDropdown(container, video) {
  let currentScale = 1;
  let currentTranslate = { x: 0, y: 0 };
  let lastPanPosition = null;
  let initialDistance = null;
  let initialScale = 1;

  container.addEventListener('touchstart', handleTouchStart, { passive: false });
  container.addEventListener('touchmove', handleTouchMove, { passive: false });
  container.addEventListener('touchend', handleTouchEnd);

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      initialDistance = getDistance(e.touches[0], e.touches[1]);
      initialScale = currentScale;
    } else if (e.touches.length === 1 && currentScale > 1) {
      lastPanPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function handleTouchMove(e) {
    if (e.touches.length === 2 && initialDistance !== null) {
      const newDistance = getDistance(e.touches[0], e.touches[1]);
      let newScale = initialScale * (newDistance / initialDistance);
      newScale = Math.min(Math.max(newScale, 1), 3);
      currentScale = newScale;
      constrainTranslation();
      updateTransform();
      e.preventDefault();
    } else if (e.touches.length === 1 && currentScale > 1 && lastPanPosition) {
      const currentTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const deltaX = currentTouch.x - lastPanPosition.x;
      const deltaY = currentTouch.y - lastPanPosition.y;
      currentTranslate.x += deltaX;
      currentTranslate.y += deltaY;
      constrainTranslation();
      updateTransform();
      lastPanPosition = currentTouch;
      e.preventDefault();
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length < 2) {
      initialDistance = null;
      initialScale = currentScale;
    }
    if (e.touches.length === 0) {
      lastPanPosition = null;
    }
  }

  function getDistance(touch1, touch2) {
    return Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
  }

  function updateTransform() {
    video.style.transform = `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${currentScale})`;
  }

  function constrainTranslation() {
    const rect = container.getBoundingClientRect();
    const maxTranslateX = (rect.width * (currentScale - 1)) / 2;
    const maxTranslateY = (rect.height * (currentScale - 1)) / 2;
    currentTranslate.x = Math.min(Math.max(currentTranslate.x, -maxTranslateX), maxTranslateX);
    currentTranslate.y = Math.min(Math.max(currentTranslate.y, -maxTranslateY), maxTranslateY);
  }
}

/**
 * Download PDF function (للمحتوى في contentArea)
 * - استبدال أي <iframe> أو <video> بعنصر الصورة والنص في كل مرة
 */
function downloadPdf() {
  if (!contentArea) return;
  let content = contentArea.innerHTML;

  const replacedBlock = `
<p>If you want to watch the video or the content, you must subscribe to the site (you will find the form and subscription details on the site written in English).</p>
<p><img src="https://raw.githubusercontent.com/hhkuy/Sums_Q_Pic/main/pic/result.png" alt="Subscribe Image" style="max-width:200px;"/></p>
`;

  // استبدال جميع الفيديوهات والإطارات
  let modifiedContent = content
    .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, replacedBlock)
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, replacedBlock);

  // Open a new window (about:blank)
  const printWindow = window.open('about:blank', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Download PDF</title>
        <style>
          @page { size: auto; margin: 0; }
          body {
            margin: 0; 
            padding: 0;
            font-family: 'Montserrat', sans-serif; 
            background-color: #fafafa; 
            color: #2c3e50;
          }
          /* العلامة المائية بحجم أصغر وفي المنتصف - ثابتة وأمام المحتوى */
          body::before {
            content: "SUMS Site\\A https://sites.google.com/view/medsums/sums-questions-bank-sqb";
            white-space: pre;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 25px;
            color: rgba(0, 0, 0, 0.07);
            pointer-events: none;
            z-index: 9999;
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
          /* نسخ ألوان العناوين والفقرات والتريغرز لضمان تطابق الألوان */
          h1 { color: #2e4053; }
          h2 { color: #2874a6; }
          h3 { color: #148f77; }
          h4 { color: #9b59b6; }
          h5, h6 { color: #b03a2e; }
          p, li, td, th { color: #2c3e50; }
          strong { color: #6c3483; font-weight: bold; }
          em { color: #d35400; font-style: italic; }

          .question-trigger {
            color: #ff8c00; 
            font-weight: bold; 
            cursor: pointer; 
            text-decoration: underline;
          }
          .image-trigger {
            color: #28a745; 
            font-weight: bold; 
            cursor: pointer; 
            text-decoration: underline;
          }
          .video-trigger {
            color: #007bff; 
            font-weight: bold; 
            cursor: pointer; 
            text-decoration: underline;
          }
          .link-trigger {
            color: #6f42c1; 
            font-weight: bold; 
            cursor: pointer; 
            text-decoration: underline;
          }
          .multi-trigger {
            color: #dc3545; 
            font-weight: bold; 
            cursor: pointer; 
            text-decoration: underline;
          }
          .iframe-trigger {
            color: #20c997; 
            font-weight: bold; 
            cursor: pointer; 
            text-decoration: underline;
          }
          .text-trigger {
            color: #d63384; 
            font-weight: bold; 
            cursor: pointer; 
            text-decoration: underline;
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
    </html>
  `);
  printWindow.document.close();
}

/**
 * Start the initialization process (if using dropdown approach)
 */
init();
