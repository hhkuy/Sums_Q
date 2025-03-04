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
    const response = await fetch(TOPICS_JSON_PATH);
    topicsData = await response.json();
    createDropdown(topicsData.topics, null, 0);
  } catch (error) {
    console.error('Error fetching or reading exp_topics.json:', error);
  }
}

/**
 * Create a dropdown list for a given array of topics.
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

/**
 * Handle selection change in a dropdown.
 */
function handleSelectionChange(currentSelect, subtopicsArray) {
  const selectedIndex = currentSelect.value;
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

/**
 * Remove all dropdowns deeper than the provided level.
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
    if (typeof initAdvancedVideoPlayers === 'function') {
      initAdvancedVideoPlayers();
    }
  } catch (error) {
    contentArea.innerHTML = `<p>Error fetching file: ${error.message}</p>`;
  }
}

/**
 * Download PDF function
 * (يبحث عن <iframe> + <video> + .video-container + #videoContainer)
 */
function downloadPdf() {
  let content = contentArea.innerHTML;
  let replaced = false;

  // === نفس التعديل البسيط: استبدال الصورة وجعلها أصغر ===
  const subscriptionBlock = `
<div style="text-align:center;">
  <p>If you want to watch the video or the content, you must subscribe to the site (you will find the form and subscription details on the site written in English).</p>
  <img src="https://raw.githubusercontent.com/hhkuy/Sums_Q_Pic/main/pic/result.png" alt="Subscription Required"
       style="max-width: 400px; display:block; margin: 0 auto;" />
</div>`;

  let modifiedContent = content
    .replace(/<div class="video-container"[^>]*>[\s\S]*?<\/div>/gi, function() {
      if (!replaced) {
        replaced = true;
        return subscriptionBlock;
      } else {
        return '';
      }
    })
    .replace(/<div id="videoContainer"[^>]*>[\s\S]*?<\/div>/gi, function() {
      if (!replaced) {
        replaced = true;
        return subscriptionBlock;
      } else {
        return '';
      }
    })
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, function() {
      if (!replaced) {
        replaced = true;
        return subscriptionBlock;
      } else {
        return '';
      }
    })
    .replace(/<video[^>]*>[\s\S]*?<\/video>/gi, function() {
      if (!replaced) {
        replaced = true;
        return subscriptionBlock;
      } else {
        return '';
      }
    });

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
          /* العلامة المائية بحجم أصغر */
          body::before {
            content: "SUMS Site\\A https://sites.google.com/view/medsums/sums-questions-bank-sqb";
            white-space: pre;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-30deg);
            font-size: 20px;
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
 * Start the initialization process
 */
init();
