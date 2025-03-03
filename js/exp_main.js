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
 * Download PDF function:
 * - Opens a new about:blank window (A4, 0 margin, no borders).
 * - Replicates the content's layout exactly but without borders.
 * - Replaces any video embeds with a message in English and a QR CODE image for the specified link.
 * - Adds a light background watermark containing "SUMS site" and the website link.
 * - Includes MathJax for proper rendering of mathematical symbols and equations.
 */
function downloadPdf() {
  let content = contentArea.innerHTML;
  // Replace any video tags with subscription message and QR CODE
  let modifiedContent = content.replace(/<video[^>]*>[\s\S]*?<\/video>/g, function(match) {
    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent("https://sites.google.com/view/medsums/sums-questions-bank-sqb");
    return `<div style="text-align: center; font-size: 16px; margin: 20px 0;">
              <p>To view the video or content, you must subscribe to the website.</p>
              <p>To see the questions related to the topics, please subscribe.</p>
              <p><img src="${qrUrl}" alt="QR Code for subscription" /></p>
            </div>`;
  });
  // Replace any iframes similarly (if any)
  modifiedContent = modifiedContent.replace(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/g, function(_, src) {
    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent("https://sites.google.com/view/medsums/sums-questions-bank-sqb");
    return `<div style="text-align: center; font-size: 16px; margin: 20px 0;">
              <p>To view the video or content, you must subscribe to the website.</p>
              <p>To see the questions related to the topics, please subscribe.</p>
              <p><img src="${qrUrl}" alt="QR Code for subscription" /></p>
            </div>`;
  });
  
  const printWindow = window.open('about:blank', '_blank');
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
          /* Watermark layer */
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
        </style>
      </head>
      <body>
        <div class="watermark">
          <div>SUMS site</div>
          <div><a href="https://sites.google.com/view/medsums/sums-questions-bank-sqb" target="_blank">https://sites.google.com/view/medsums/sums-questions-bank-sqb</a></div>
        </div>
        <h1>${document.getElementById('contentTitle').textContent}</h1>
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
 * Start the initialization process
 */
init();
