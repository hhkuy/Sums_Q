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
    // Probably we are not using the dropdown approach in this scenario.
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
    } else {
      contentArea.innerHTML = '<p>No content available.</p>';
    }
    // بعد تحميل المحتوى، يمكن تهيئة الفيديو الافتراضي إذا كنت تريد
    initDefaultVideosInDropdown();
  } catch (error) {
    contentArea.innerHTML = `<p>Error fetching file: ${error.message}</p>`;
  }
}

/**
 * مثال بسيط لتهيئة الفيديو الافتراضي ضمن طريقة الـ Dropdown فقط
 */
function initDefaultVideosInDropdown() {
  if (!contentArea) return;
  const videos = contentArea.querySelectorAll('video');
  videos.forEach(video => {
    // وضع إعدادات مشابهة للملف الآخر
    video.setAttribute('controls', '');
    video.setAttribute('controlsList', 'nodownload');
    video.setAttribute('playsinline', '');
  });
}

/**
 * Download PDF function (للمحتوى في contentArea)
 * - استبدال أي <iframe> أو <video> بعنصر الصورة والنص مرة واحدة
 */
function downloadPdf() {
  if (!contentArea) return;
  let content = contentArea.innerHTML;

  let replacedImageOnce = false;
  const replaceVideoOrIframe = () => {
    if (!replacedImageOnce) {
      replacedImageOnce = true;
      return `
<p>If you want to watch the video or the content, you must subscribe to the site (you will find the form and subscription details on the site written in English).</p>
<p><img src="https://raw.githubusercontent.com/hhkuy/Sums_Q_Pic/main/pic/result.png" alt="Subscribe Image" style="max-width:200px;"/></p>
`;
    } else {
      return `
<p>If you want to watch the video or the content, you must subscribe to the site (you will find the form and subscription details on the site written in English).</p>
`;
    }
  };

  let modifiedContent = content
    .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, function() {
      return replaceVideoOrIframe();
    })
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, function() {
      return replaceVideoOrIframe();
    });

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
