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
 * - Opens a new about:blank window (A4, 0 margin).
 * - Replicates the content's styling (tables, etc.) exactly but without outer borders/margins.
 * - Replaces video elements with a subscription message and a QR code image for the questions link.
 * - Adds a light watermark overlay with "SUMS site" and the website URL.
 * - Includes MathJax for correct rendering of math symbols and equations.
 */
function downloadPdf() {
  let content = contentArea.innerHTML;
  // Replace any iframe video embed with a QR code image (if exists)
  let modifiedContent = content.replace(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/gi, function(_, src) {
    const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + encodeURIComponent(src);
    return `<img src="${qrUrl}" alt="QR Code for video link">`;
  });
  // Replace video elements with subscription message and QR code
  modifiedContent = modifiedContent.replace(/<video[\s\S]*?<\/video>/gi, function(match) {
    return `<div style="text-align:center; margin:20px 0;">
              <p style="font-size:16px; color:#000;">To view the video or content, please subscribe to our site.</p>
              <p style="font-size:16px; color:#000;">To see questions related to the topics, please scan the QR code below:</p>
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('https://sites.google.com/view/medsums/sums-questions-bank-sqb')}" alt="QR Code for questions">
            </div>`;
  });
  const printWindow = window.open('about:blank', '_blank');
  printWindow.document.write(
    `<html>
      <head>
        <meta charset="UTF-8">
        <title>Download PDF</title>
        <!-- Include MathJax for math symbols/equations -->
        <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.js"></script>
        <style>
          @page { size: A4; margin: 0; }
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
          /* Content styling without outer borders */
          #content {
            padding: 20px;
            border: none;
            font-size: 14px;
          }
          /* Table styling remains the same */
          #content table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          #content table th, #content table td {
            border: 1px solid #ccc;
            padding: 10px;
            text-align: left;
          }
          #content table thead { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <!-- Watermark overlay -->
        <div id="watermark" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; opacity: 0.1; z-index: -1; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
          <div style="font-size: 50px; color: #000;">SUMS site</div>
          <div style="font-size: 20px; color: #000;">https://sites.google.com/view/medsums/sums-questions-bank-sqb</div>
        </div>
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
