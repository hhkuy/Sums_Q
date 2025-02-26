/**
 * main.js
 * Full code with final modifications for counting correct/wrong answers in the Custom Quiz.
 */

/***
 * الإعدادات والانتظار لتحميل الصفحة
 ***/
document.addEventListener('DOMContentLoaded', () => {
  loadTopicsList(); // عند تحميل الصفحة، نجلب قائمة المواضيع
  setupTopicSearchListener(); // تجهيز الاستماع لحقل البحث (المواضيع)
});

// المسار الخاص بملف المواضيع
const TOPICS_JSON_FILE = 'data/topics.json';

// متغيرات الأسئلة
let quizData = [];
let originalQuizData = [];

// الفئات (للفلترة)
let originalCategories = [];
let categoryFilterSelected = [];

// متغيرات أخرى
let mode = 'mcq';
let currentCorrectnessFilter = 'all';
let scrollState = 0;
let lastAnsweredIndex = -1;

// عناصر الـDOM
const topicsPage = document.getElementById('topics-page');
const topicsGrid = document.getElementById('topics-grid');
const quizContainer = document.getElementById('quiz-container');
const quizForm = document.getElementById('quiz-form');
const resultElement = document.getElementById('result');
const scrollButton = document.getElementById('scroll-button');
const floatingButtons = document.getElementById('floating-buttons');
const quizTitleElement = document.getElementById('quiz-title');

// سنحتفظ بقائمة المواضيع كاملة في متغير allTopics
let allTopics = [];

/*****************************************************************
 *        أقسام الكويز الأساسي + عرض المواضيع الأصلية          *
 *****************************************************************/
function loadTopicsList() {
  fetch(TOPICS_JSON_FILE)
    .then(response => response.json())
    .then(topics => {
      allTopics = topics;
      displayTopics(allTopics);
      updateSiteTotalQuestions(allTopics);
    })
    .catch(err => console.error('Error loading topics.json:', err));
}

function displayTopics(topicsArray) {
  topicsGrid.innerHTML = '';
  if (!topicsArray || topicsArray.length === 0) {
    const msg = document.createElement('p');
    msg.textContent = 'No topics found.';
    msg.style.fontSize = '1.2rem';
    msg.style.color = '#555';
    topicsGrid.appendChild(msg);
    return;
  }
  topicsArray.forEach(topic => {
    const topicCard = document.createElement('div');
    topicCard.classList.add('topic-card');
    
    const titleEl = document.createElement('h3');
    titleEl.classList.add('topic-title');
    titleEl.textContent = topic.topicName;
    topicCard.appendChild(titleEl);
    
    const descEl = document.createElement('p');
    descEl.classList.add('topic-description');
    descEl.textContent = topic.description ? topic.description : 'No description available.';
    topicCard.appendChild(descEl);
    
    const subtopicContainer = document.createElement('div');
    subtopicContainer.classList.add('subtopic-buttons');
    
    if (!topic.subTopics || topic.subTopics.length === 0) {
      if (topic.file) {
        const btn = document.createElement('button');
        btn.textContent = 'Open Topic';
        btn.addEventListener('click', () => {
          loadQuestionsJSON(topic.file, topic.topicName);
        });
        subtopicContainer.appendChild(btn);
      } else {
        const btn = document.createElement('button');
        btn.textContent = 'No subtopics available';
        btn.disabled = true;
        subtopicContainer.appendChild(btn);
      }
    } else {
      topic.subTopics.forEach(sub => {
        const btn = document.createElement('button');
        btn.textContent = sub.name;
        btn.addEventListener('click', () => {
          const newTitle = topic.topicName + " - " + sub.name;
          loadQuestionsJSON(sub.file, newTitle);
        });
        subtopicContainer.appendChild(btn);
      });
    }
    
    topicCard.appendChild(subtopicContainer);
    topicsGrid.appendChild(topicCard);
  });
}

function updateSiteTotalQuestions(topics) {
  let files = [];
  topics.forEach(topic => {
    if (topic.file) {
      files.push(topic.file);
    }
    if (topic.subTopics && topic.subTopics.length > 0) {
      topic.subTopics.forEach(sub => {
        if (sub.file) {
          files.push(sub.file);
        }
      });
    }
  });
  files = [...new Set(files)];

  const fetchPromises = files.map(file => {
    return fetch(file)
      .then(response => response.json())
      .then(data => Array.isArray(data) ? data.length : 0)
      .catch(err => {
        console.error("Error fetching file", file, err);
        return 0;
      });
  });

  Promise.all(fetchPromises).then(counts => {
    const total = counts.reduce((acc, cur) => acc + cur, 0);
    const siteTotalQuestionsElement = document.getElementById('site-total-questions');
    if (siteTotalQuestionsElement) {
      siteTotalQuestionsElement.textContent = `Total Questions: ${total}`;
    }
  });
}

function setupTopicSearchListener() {
  const searchInput = document.getElementById('topic-search-input');
  if (!searchInput) return;
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    filterTopicCards(query);
  });
}

function manualSearchTopics() {
  const searchInput = document.getElementById('topic-search-input');
  if (!searchInput) return;
  const query = searchInput.value.trim().toLowerCase();
  filterTopicCards(query);
}

function filterTopicCards(query) {
  if (!query) {
    displayTopics(allTopics);
    return;
  }
  const filtered = allTopics.filter(topic => {
    const nameMatch = topic.topicName.toLowerCase().includes(query);
    const descMatch = (topic.description || '').toLowerCase().includes(query);
    return nameMatch || descMatch;
  });
  displayTopics(filtered);
}

function loadQuestionsJSON(jsonFilePath, quizTitle) {
  fetch(jsonFilePath)
    .then(response => response.json())
    .then(data => {
      quizData = JSON.parse(JSON.stringify(data));
      originalQuizData = JSON.parse(JSON.stringify(data));
      initOriginalCategories();
      topicsPage.style.display = 'none';
      quizContainer.style.display = 'block';
      floatingButtons.style.display = 'flex';
      quizTitleElement.textContent = quizTitle ? quizTitle : "Quiz Application";
      loadQuiz();
      categoryFilterSelected = [];
      applyAllFilters();
      if (resultElement) resultElement.innerHTML = '';
      scrollState = 0;
      lastAnsweredIndex = -1;
      updateScrollButtonIcon();
      MathJax.typesetPromise([quizForm]).catch(err => console.error(err));
    })
    .catch(err => console.error('Error loading quiz JSON:', err));
}

function goBackToTopics() {
  quizContainer.style.display = 'none';
  topicsPage.style.display = 'flex';
  floatingButtons.style.display = 'none';
  document.getElementById('create-custom-quiz-page').style.display = 'none';
  document.getElementById('custom-quiz-container').style.display = 'none';
  if (resultElement) resultElement.innerHTML = '';
}

/*****************************************************************
 *         تهيئة فئات الأسئلة + رسم الكويز الرئيسي (MCQ/Flash)   *
 *****************************************************************/
function initOriginalCategories() {
  const cats = originalQuizData.map(q => extractCategoryFromQuestion(q.question)).filter(c => c);
  originalCategories = [...new Set(cats)];
}

function loadQuiz() {
  if (!quizForm) return;
  quizForm.innerHTML = '';
  
  quizData.forEach((data, index) => {
    const questionContainer = document.createElement('div');
    questionContainer.classList.add('question-container');
    questionContainer.id = `question-container-${index}`;
    
    const questionDiv = document.createElement('div');
    questionDiv.classList.add('question');
    questionDiv.id = `question-${index}`;
    
    const questionNumberSpan = document.createElement('span');
    questionNumberSpan.classList.add('question-number');
    questionNumberSpan.textContent = `${index + 1}.`;
    
    const questionTextSpan = document.createElement('span');
    questionTextSpan.innerHTML = data.question;
    
    const lightbulbIcon = document.createElement('span');
    lightbulbIcon.classList.add('lightbulb-icon');
    lightbulbIcon.innerHTML = '💡';
    lightbulbIcon.dataset.index = index;
    lightbulbIcon.addEventListener('click', () => {
      toggleExplanation(index);
    });
    
    questionDiv.appendChild(questionNumberSpan);
    questionDiv.appendChild(questionTextSpan);
    questionDiv.appendChild(lightbulbIcon);
    questionContainer.appendChild(questionDiv);
    
    const explanationDiv = document.createElement('div');
    explanationDiv.classList.add('explanation');
    explanationDiv.id = `explanation-${index}`;
    explanationDiv.textContent = data.explanation || '';
    questionContainer.appendChild(explanationDiv);
    
    if (mode === 'mcq') {
      const optionsContainer = document.createElement('div');
      optionsContainer.classList.add('options-container');
      optionsContainer.id = `options-container-${index}`;
      
      data.options.forEach((option, optionIndex) => {
        const optionDiv = document.createElement('div');
        optionDiv.classList.add('option');
        optionDiv.dataset.index = index;
        optionDiv.dataset.optionIndex = optionIndex;
        
        const radioInput = document.createElement('input');
        radioInput.type = 'radio';
        radioInput.id = `question-${index}-option-${optionIndex}`;
        radioInput.name = `question-${index}`;
        radioInput.value = optionIndex;
        
        optionDiv.appendChild(radioInput);
        
        const optionLabel = document.createElement('label');
        optionLabel.innerHTML = option;
        optionDiv.appendChild(optionLabel);
        optionsContainer.appendChild(optionDiv);
      });
      
      questionContainer.appendChild(optionsContainer);
      
      const showAnswerButton = document.createElement('button');
      showAnswerButton.type = 'button';
      showAnswerButton.textContent = 'Show Answer';
      showAnswerButton.classList.add('show-answer-button');
      showAnswerButton.addEventListener('click', (e) => {
        e.stopPropagation();
        showIndividualAnswer(index);
      });
      
      const shuffleOptionsButton = document.createElement('button');
      shuffleOptionsButton.type = 'button';
      shuffleOptionsButton.textContent = 'Shuffle Options';
      shuffleOptionsButton.classList.add('shuffle-options-button');
      shuffleOptionsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        shuffleOptionsForQuestion(index);
      });
      
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.textContent = 'Clear';
      clearButton.classList.add('clear-button');
      clearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        clearIndividualQuestion(index);
      });
      
      const buttonContainer = document.createElement('div');
      buttonContainer.appendChild(showAnswerButton);
      buttonContainer.appendChild(shuffleOptionsButton);
      buttonContainer.appendChild(clearButton);
      questionContainer.appendChild(buttonContainer);
      
    } else if (mode === 'flashcard') {
      const buttonGroup = document.createElement('div');
      buttonGroup.classList.add('button-group');
      
      const showAnswerButton = document.createElement('button');
      showAnswerButton.type = 'button';
      showAnswerButton.textContent = 'Show Answer';
      showAnswerButton.classList.add('show-answer-button');
      showAnswerButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAnswer(index);
      });
      
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.textContent = 'Clear';
      clearButton.classList.add('clear-button');
      clearButton.addEventListener('click', (e) => {
        e.stopPropagation();
        clearUserAnswer(index);
      });
      
      const indicator = document.createElement('span');
      indicator.classList.add('indicator');
      indicator.id = `indicator-${index}`;
      
      buttonGroup.appendChild(showAnswerButton);
      buttonGroup.appendChild(clearButton);
      buttonGroup.appendChild(indicator);
      questionContainer.appendChild(buttonGroup);
      
      const answerDiv = document.createElement('div');
      answerDiv.classList.add('answer');
      answerDiv.id = `answer-${index}`;
      answerDiv.textContent = data.answerText ? `Answer: ${data.answerText}` : '';
      questionContainer.appendChild(answerDiv);
      
      const isCorrectDiv = document.createElement('div');
      isCorrectDiv.classList.add('is-correct');
      isCorrectDiv.textContent = 'Is your answer correct?';
      questionContainer.appendChild(isCorrectDiv);
      
      const yesNoGroup = document.createElement('div');
      yesNoGroup.classList.add('yes-no-group');
      
      const yesButton = document.createElement('button');
      yesButton.type = 'button';
      yesButton.textContent = 'Yes';
      yesButton.classList.add('yes-button');
      yesButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setUserAnswer(index, 'yes');
      });
      
      const noButton = document.createElement('button');
      noButton.type = 'button';
      noButton.textContent = 'No';
      noButton.classList.add('no-button');
      noButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setUserAnswer(index, 'no');
      });
      
      yesNoGroup.appendChild(yesButton);
      yesNoGroup.appendChild(noButton);
      questionContainer.appendChild(yesNoGroup);
    }
    
    quizForm.appendChild(questionContainer);
  });
  
  document.getElementById('total-questions').textContent = quizData.length;
  MathJax.typesetPromise([quizForm]).catch(err => console.error(err));
}

// في وضع MCQ عندما نضغط على أي خيار
if (quizForm) {
  quizForm.addEventListener('click', (event) => {
    const target = event.target;
    if (mode === 'mcq') {
      if (target.matches('.option, .option *')) {
        const optionDiv = target.closest('.option');
        const radioInput = optionDiv.querySelector('input[type="radio"]');
        if (!radioInput.checked) {
          radioInput.checked = true;
        }
        const index = parseInt(radioInput.name.split('-')[1]);
        scrollState = 0;
        lastAnsweredIndex = index;
        updateScrollButtonIcon();
      }
    }
  });
}

/*****************************************************************
 * بقية الدوال المساندة (التصحيح، الفلترة، إلخ)
 *****************************************************************/
function toggleExplanation(index) {
  const explanationDiv = document.getElementById(`explanation-${index}`);
  if (!explanationDiv) return;
  explanationDiv.style.display = (explanationDiv.style.display === 'block') ? 'none' : 'block';
}

function showIndividualAnswer(index) {
  if (mode === 'mcq') {
    const selectedOption = document.querySelector(`input[name="question-${index}"]:checked`);
    const options = document.querySelectorAll(`#options-container-${index} .option`);
    
    options.forEach(optionDiv => {
      optionDiv.classList.remove('correct', 'wrong', 'correct-answer', 'unanswered');
    });
    
    requestAnimationFrame(() => {
      options.forEach(optionDiv => {
        const input = optionDiv.querySelector('input');
        const optionIndex = parseInt(input.value);
        
        if (optionIndex === quizData[index].answer) {
          optionDiv.classList.add('correct-answer');
        }
        
        if (selectedOption) {
          if (optionIndex === parseInt(selectedOption.value)) {
            if (optionIndex === quizData[index].answer) {
              optionDiv.classList.add('correct');
            } else {
              optionDiv.classList.add('wrong');
            }
          }
        } else {
          optionDiv.classList.add('unanswered');
        }
      });
    });
  } else if (mode === 'flashcard') {
    toggleAnswer(index);
  }
}

function clearIndividualQuestion(index) {
  if (mode === 'mcq') {
    const options = document.querySelectorAll(`#options-container-${index} .option`);
    options.forEach(optionDiv => {
      optionDiv.classList.remove('correct', 'wrong', 'correct-answer', 'unanswered');
      const input = optionDiv.querySelector('input');
      input.checked = false;
    });
  } else if (mode === 'flashcard') {
    clearUserAnswer(index);
  }
}

function shuffleOptionsForQuestion(index) {
  const data = quizData[index];
  const optionsContainer = document.getElementById(`options-container-${index}`);
  if (!optionsContainer) return;
  
  const selectedInput = optionsContainer.querySelector('input:checked');
  const selectedOptionIndex = selectedInput ? parseInt(selectedInput.value) : null;
  
  const currentOptions = data.options.map((option, i) => ({ option, index: i }));
  const shuffledOptions = shuffleArray(currentOptions);
  
  data.options = shuffledOptions.map(o => o.option);
  data.answer = shuffledOptions.findIndex(o => o.index === data.answer);
  
  const fragment = document.createDocumentFragment();
  
  data.options.forEach((option, optionIndex) => {
    const optionDiv = document.createElement('div');
    optionDiv.classList.add('option');
    optionDiv.dataset.index = index;
    optionDiv.dataset.optionIndex = optionIndex;
    
    const radioInput = document.createElement('input');
    radioInput.type = 'radio';
    radioInput.id = `question-${index}-option-${optionIndex}`;
    radioInput.name = `question-${index}`;
    radioInput.value = optionIndex;
    
    if (optionIndex === selectedOptionIndex) {
      radioInput.checked = true;
    }
    
    optionDiv.appendChild(radioInput);
    
    const optionLabel = document.createElement('label');
    optionLabel.innerHTML = option;
    optionDiv.appendChild(optionLabel);
    
    fragment.appendChild(optionDiv);
  });
  
  optionsContainer.innerHTML = '';
  optionsContainer.appendChild(fragment);
  optionsContainer.querySelectorAll('.option').forEach(optionDiv => {
    optionDiv.classList.remove('correct', 'wrong', 'correct-answer', 'unanswered');
  });
  MathJax.typesetPromise([optionsContainer]).catch(err => console.error(err));
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function shuffleVisibleQuestions() {
  const visibleIndexes = getVisibleQuestionIndexes();
  let visibleQuestions = visibleIndexes.map(i => quizData[i]);
  visibleQuestions = shuffleArray(visibleQuestions);
  for (let v = 0; v < visibleIndexes.length; v++) {
    quizData[visibleIndexes[v]] = visibleQuestions[v];
  }
  loadQuiz();
  applyAllFilters();
}

function shuffleAllOptions() {
  if (mode === 'mcq') {
    quizData.forEach((_, index) => {
      shuffleOptionsForQuestion(index);
    });
  }
}

function showResult() {
  showAllExplanations();
  const visibleIndexes = getVisibleQuestionIndexes();
  let score = 0;
  let unanswered = 0;
  let yesCount = 0;
  let noCount = 0;
  
  if (mode === 'mcq') {
    visibleIndexes.forEach(index => {
      const data = quizData[index];
      const selectedOption = document.querySelector(`input[name="question-${index}"]:checked`);
      const options = document.querySelectorAll(`#options-container-${index} .option`);
      
      options.forEach(optionDiv => {
        optionDiv.classList.remove('correct', 'wrong', 'correct-answer', 'unanswered');
      });
      
      options.forEach(optionDiv => {
        const input = optionDiv.querySelector('input');
        const optionIndex = parseInt(input.value);
        if (optionIndex === data.answer) {
          optionDiv.classList.add('correct-answer');
        }
      });
      
      if (selectedOption) {
        const selectedValue = parseInt(selectedOption.value);
        if (selectedValue === data.answer) {
          score++;
          selectedOption.parentNode.classList.add('correct');
        } else {
          selectedOption.parentNode.classList.add('wrong');
        }
      } else {
        unanswered++;
        options.forEach(optionDiv => {
          optionDiv.classList.add('unanswered');
        });
      }
    });
    
    const total = visibleIndexes.length;
    const wrongAnswers = total - score - unanswered;
    resultElement.innerHTML = 
      `<p>Your score is ${score} out of ${total}.</p>
       <p>Correct Answers: ${score}</p>
       <p>Wrong Answers: ${wrongAnswers}</p>
       <p>Unanswered Questions: ${unanswered}</p>`;
       
  } else if (mode === 'flashcard') {
    visibleIndexes.forEach(index => {
      const data = quizData[index];
      const answerDiv = document.getElementById(`answer-${index}`);
      if (answerDiv && (answerDiv.style.display === 'none' || answerDiv.style.display === '')) {
        answerDiv.style.display = 'block';
      }
      if (data.userAnswer === 'yes') {
        yesCount++;
      } else if (data.userAnswer === 'no') {
        noCount++;
      } else {
        unanswered++;
      }
    });
    
    const total = visibleIndexes.length;
    resultElement.innerHTML = 
      `<p>Your Score:</p>
       <p>Correct (Yes): ${yesCount}</p>
       <p>Incorrect (No): ${noCount}</p>
       <p>Unanswered Questions: ${unanswered}</p>
       <p>Total visible Questions: ${total}</p>`;
  }
  addFilterButtons();
}

function addFilterButtons() {
  const oldContainer = document.getElementById('filter-container');
  if (oldContainer) oldContainer.remove();
  
  const filterContainer = document.createElement('div');
  filterContainer.id = 'filter-container';
  filterContainer.style.marginTop = '20px';
  filterContainer.style.display = 'flex';
  filterContainer.style.flexWrap = 'wrap';
  filterContainer.style.justifyContent = 'center';
  
  if (mode === 'mcq') {
    const showCorrectButton = document.createElement('button');
    showCorrectButton.textContent = 'Show Correct Answers';
    showCorrectButton.classList.add('filter-button', 'correct');
    showCorrectButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'correct';
      applyAllFilters();
    });
    
    const showWrongButton = document.createElement('button');
    showWrongButton.textContent = 'Show Wrong Answers';
    showWrongButton.classList.add('filter-button', 'wrong');
    showWrongButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'wrong';
      applyAllFilters();
    });
    
    const showUnansweredButton = document.createElement('button');
    showUnansweredButton.textContent = 'Show Unanswered Questions';
    showUnansweredButton.classList.add('filter-button', 'unanswered');
    showUnansweredButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'unanswered';
      applyAllFilters();
    });
    
    const showAllButton = document.createElement('button');
    showAllButton.textContent = 'Show All Questions';
    showAllButton.classList.add('filter-button', 'all');
    showAllButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'all';
      applyAllFilters();
    });
    
    filterContainer.appendChild(showCorrectButton);
    filterContainer.appendChild(showWrongButton);
    filterContainer.appendChild(showUnansweredButton);
    filterContainer.appendChild(showAllButton);
    
  } else {
    const showCorrectButton = document.createElement('button');
    showCorrectButton.textContent = 'Show Correct Answers';
    showCorrectButton.classList.add('filter-button', 'yes-button');
    showCorrectButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'yes';
      applyAllFilters();
    });
    
    const showIncorrectButton = document.createElement('button');
    showIncorrectButton.textContent = 'Show Incorrect Answers';
    showIncorrectButton.classList.add('filter-button', 'no-button');
    showIncorrectButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'no';
      applyAllFilters();
    });
    
    const showUnansweredButton = document.createElement('button');
    showUnansweredButton.textContent = 'Show Unanswered Questions';
    showUnansweredButton.classList.add('filter-button', 'unanswered-button');
    showUnansweredButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'unanswered';
      applyAllFilters();
    });
    
    const showAllButton = document.createElement('button');
    showAllButton.textContent = 'Show All Questions';
    showAllButton.classList.add('filter-button', 'all-button');
    showAllButton.addEventListener('click', () => {
      currentCorrectnessFilter = 'all';
      applyAllFilters();
    });
    
    filterContainer.appendChild(showCorrectButton);
    filterContainer.appendChild(showIncorrectButton);
    filterContainer.appendChild(showUnansweredButton);
    filterContainer.appendChild(showAllButton);
  }
  
  if (resultElement) {
    resultElement.appendChild(filterContainer);
  }
}

function filterQuestionsCorrectness() {
  const visibleIndexesAfterCategory = getVisibleQuestionIndexesByCategory();
  
  visibleIndexesAfterCategory.forEach(index => {
    const questionContainer = document.getElementById(`question-container-${index}`);
    let shouldDisplay = false;
    
    if (mode === 'mcq') {
      const selectedOption = document.querySelector(`input[name="question-${index}"]:checked`);
      const data = quizData[index];
      if (currentCorrectnessFilter === 'correct') {
        if (selectedOption && parseInt(selectedOption.value) === data.answer) {
          shouldDisplay = true;
        }
      } else if (currentCorrectnessFilter === 'wrong') {
        if (selectedOption && parseInt(selectedOption.value) !== data.answer) {
          shouldDisplay = true;
        }
      } else if (currentCorrectnessFilter === 'unanswered') {
        if (!selectedOption) {
          shouldDisplay = true;
        }
      } else {
        shouldDisplay = true;
      }
    } else {
      const data = quizData[index];
      const ua = data.userAnswer;
      
      if (currentCorrectnessFilter === 'yes') {
        if (ua === 'yes') shouldDisplay = true;
      } else if (currentCorrectnessFilter === 'no') {
        if (ua === 'no') shouldDisplay = true;
      } else if (currentCorrectnessFilter === 'unanswered') {
        if (!ua) shouldDisplay = true;
      } else {
        shouldDisplay = true;
      }
    }
    
    questionContainer.style.display = shouldDisplay ? 'block' : 'none';
  });
}

function applyAllFilters() {
  const selectedOptions = categoryFilterSelected || [];
  
  quizData.forEach((data, index) => {
    const questionContainer = document.getElementById(`question-container-${index}`);
    const category = extractCategoryFromQuestion(data.question);
    
    if (selectedOptions.length === 0 || selectedOptions.includes(category)) {
      questionContainer.style.display = 'block';
    } else {
      questionContainer.style.display = 'none';
    }
  });
  
  filterQuestionsCorrectness();
  renumberVisibleQuestions();
  
  const visibleCount = getVisibleQuestionIndexes().length;
  const totalQEl = document.getElementById('total-questions');
  if (totalQEl) totalQEl.textContent = visibleCount;
}

function renumberVisibleQuestions() {
  const visibleIndexes = getVisibleQuestionIndexes();
  visibleIndexes.forEach((index, i) => {
    const questionNumberSpan = document.querySelector(`#question-container-${index} .question-number`);
    if (questionNumberSpan) {
      questionNumberSpan.textContent = (i + 1) + ".";
    }
  });
}

function getVisibleQuestionIndexes() {
  const containers = document.querySelectorAll('.question-container');
  const visibleIndexes = [];
  containers.forEach((c, i) => {
    if (c.style.display !== 'none') {
      visibleIndexes.push(i);
    }
  });
  return visibleIndexes;
}

function getVisibleQuestionIndexesByCategory() {
  const selectedOptions = categoryFilterSelected || [];
  const indexes = [];
  
  quizData.forEach((data, i) => {
    const category = extractCategoryFromQuestion(data.question);
    if (selectedOptions.length === 0 || selectedOptions.includes(category)) {
      indexes.push(i);
    }
  });
  
  return indexes;
}

function openResetModal() {
  document.getElementById('reset-modal').style.display = 'block';
}

function closeResetModal() {
  document.getElementById('reset-modal').style.display = 'none';
}

function confirmResetQuiz() {
  quizData = JSON.parse(JSON.stringify(originalQuizData));
  loadQuiz();
  requestAnimationFrame(() => {
    if (resultElement) resultElement.innerHTML = '';
    scrollState = 0;
    lastAnsweredIndex = -1;
    updateScrollButtonIcon();
    currentCorrectnessFilter = 'all';
    categoryFilterSelected = [];
    applyAllFilters();
    closeResetModal();
  });
}

function resetQuiz() {
  openResetModal();
}

function openJumpModal() {
  document.getElementById('jump-modal').style.display = 'block';
  document.getElementById('jump-input').focus();
}

function closeJumpModal() {
  document.getElementById('jump-modal').style.display = 'none';
  clearSearchResults();
}

function displaySearchResults(results) {
  const searchResultsContainer = document.getElementById('search-results');
  if (!searchResultsContainer) return;
  searchResultsContainer.innerHTML = '';
  
  if (results.length === 0) {
    const noResults = document.createElement('p');
    noResults.textContent = 'No matching questions found.';
    searchResultsContainer.appendChild(noResults);
  } else {
    const resultsList = document.createElement('ul');
    results.forEach(result => {
      const listItem = document.createElement('li');
      const resultButton = document.createElement('button');
      resultButton.innerHTML = `Question ${result.index + 1}: ${result.questionSnippet}`;
      resultButton.addEventListener('click', () => {
        document.getElementById(`question-${result.index}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeJumpModal();
      });
      listItem.appendChild(resultButton);
      resultsList.appendChild(listItem);
    });
    searchResultsContainer.appendChild(resultsList);
    MathJax.typesetPromise([searchResultsContainer]).catch(err => console.error(err));
  }
}

function clearSearchResults() {
  const searchResultsContainer = document.getElementById('search-results');
  if (searchResultsContainer) {
    searchResultsContainer.innerHTML = '';
  }
}

function jumpToQuestion() {
  const input = document.getElementById('jump-input').value.trim();
  if (input === '') return;
  const visibleIndexes = getVisibleQuestionIndexes();
  const results = [];
  const query = input.toLowerCase();
  
  for (let j = 0; j < visibleIndexes.length; j++) {
    const i = visibleIndexes[j];
    const data = quizData[i];
    let matchFound = false;
    let snippet = "";
    
    // السؤال
    const questionText = stripHTML(data.question);
    if (questionText.toLowerCase().includes(query)) {
      matchFound = true;
      snippet = highlightTerm(questionText, input);
    }
    
    // الخيارات
    if (!matchFound && data.options && Array.isArray(data.options)) {
      for (let k = 0; k < data.options.length; k++) {
        const optionText = data.options[k];
        if (optionText.toLowerCase().includes(query)) {
          matchFound = true;
          snippet = highlightTerm(questionText, input) + " (Option: " + highlightTerm(optionText, input) + ")";
          break;
        }
      }
    }
    
    // الشرح
    if (!matchFound && data.explanation) {
      const explanationText = data.explanation.toLowerCase();
      if (explanationText.includes(query)) {
        matchFound = true;
        snippet = highlightTerm(questionText, input) + " (Explanation: " + highlightTerm(data.explanation, input) + ")";
      }
    }
    
    if (matchFound) {
      results.push({
        index: i,
        questionSnippet: snippet
      });
    }
  }
  
  // البحث الرقمي المباشر (مثل رقم السؤال)
  if (results.length === 0 && !isNaN(input)) {
    const num = parseInt(input);
    const idx = num - 1;
    if (visibleIndexes.includes(idx)) {
      results.push({
        index: idx,
        questionSnippet: `Question ${num}`
      });
    }
  }
  
  displaySearchResults(results);
}

function toggleAnswer(index) {
  const answerDiv = document.getElementById(`answer-${index}`);
  if (!answerDiv) return;
  answerDiv.style.display = (answerDiv.style.display === 'block') ? 'none' : 'block';
}

function setUserAnswer(index, answer) {
  quizData[index].userAnswer = answer;
  lastAnsweredIndex = index;
  updateScrollButtonIcon();
  updateIndicator(index, answer);
}

function updateIndicator(index, answer) {
  const indicator = document.getElementById(`indicator-${index}`);
  if (!indicator) return;
  indicator.innerHTML = (answer === 'yes') ? '✔️' : (answer === 'no') ? '❌' : '';
}

function clearUserAnswer(index) {
  quizData[index].userAnswer = null;
  const indicator = document.getElementById(`indicator-${index}`);
  if (indicator) indicator.innerHTML = '';
  const answerDiv = document.getElementById(`answer-${index}`);
  if (answerDiv) answerDiv.style.display = 'none';
}

function extractCategoryFromQuestion(questionHTML) {
  const div = document.createElement('div');
  div.innerHTML = questionHTML;
  const span = div.querySelector('span[style*="darkred"]');
  if (span) {
    let text = span.textContent.trim();
    const questionIndex = text.toLowerCase().indexOf('question');
    if (questionIndex !== -1) {
      text = text.substring(0, questionIndex).trim();
      text = text.replace(/\-\s*$/, '').trim();
    }
    return text;
  }
  return '';
}

const selectAllBtn = document.getElementById('select-all-categories-btn');
if (selectAllBtn) {
  selectAllBtn.addEventListener('click', () => {
    const categorySelect = document.getElementById('category-filter');
    if (!categorySelect) return;
    const allSelected = Array.from(categorySelect.options).every(option => option.selected);
    for (let i = 0; i < categorySelect.options.length; i++) {
      categorySelect.options[i].selected = !allSelected;
    }
  });
}

function openCategoryModal() {
  document.getElementById('category-modal').style.display = 'block';
  updateCategoryFilter();
}
function closeCategoryModal() {
  document.getElementById('category-modal').style.display = 'none';
}
function updateCategoryFilter() {
  const categorySelect = document.getElementById('category-filter');
  if (!categorySelect) return;
  categorySelect.innerHTML = '';
  originalCategories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    if (categoryFilterSelected.includes(cat)) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });
}
function applyCategoryFilter() {
  const categorySelect = document.getElementById('category-filter');
  if (!categorySelect) return;
  categoryFilterSelected = Array.from(categorySelect.selectedOptions).map(o => o.value);
  closeCategoryModal();
  applyAllFilters();
}

function switchMode() {
  if (mode === 'mcq') {
    mode = 'flashcard';
    document.getElementById('switch-mode').textContent = 'Switch to MCQs Mode';
    document.getElementById('shuffle-options').style.display = 'none';
  } else {
    mode = 'mcq';
    document.getElementById('switch-mode').textContent = 'Switch to Flashcard Mode';
    document.getElementById('shuffle-options').style.display = 'inline-block';
  }
  loadQuiz();
  if (resultElement) resultElement.innerHTML = '';
  currentCorrectnessFilter = 'all';
  applyAllFilters();
}

function showAllExplanations() {
  const visibleIndexes = getVisibleQuestionIndexes();
  visibleIndexes.forEach(index => {
    const explanationDiv = document.getElementById(`explanation-${index}`);
    if (explanationDiv) {
      explanationDiv.style.display = 'block';
    }
  });
}

function handleScrollButton() {
  if (lastAnsweredIndex === -1) {
    if (scrollState === 0 || scrollState === 2) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      scrollState = 3;
    } else if (scrollState === 3) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      scrollState = 2;
    }
  } else {
    if (scrollState === 0) {
      document.getElementById(`question-${lastAnsweredIndex}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollState = 1;
    } else if (scrollState === 1) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      scrollState = 2;
    } else if (scrollState === 2) {
      document.getElementById(`question-${lastAnsweredIndex}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollState = 3;
    } else if (scrollState === 3) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      scrollState = 1;
    }
  }
  updateScrollButtonIcon();
}

function updateScrollButtonIcon() {
  if (!scrollButton) return;
  if (lastAnsweredIndex === -1) {
    if (scrollState === 0 || scrollState === 2) {
      scrollButton.textContent = '↓';
    } else if (scrollState === 3) {
      scrollButton.textContent = '↑';
    }
  } else {
    if (scrollState === 0) {
      scrollButton.textContent = '⇄';
    } else if (scrollState === 1) {
      scrollButton.textContent = '↓';
    } else if (scrollState === 2) {
      scrollButton.textContent = '⇄';
    } else if (scrollState === 3) {
      scrollButton.textContent = '↑';
    }
  }
}

/*****************************************************************
 *                صفحة الكويز المخصص (Make Quizz)               *
 *****************************************************************/
let selectedTopicsForCustom = [];
let selectedSubtopicsForCustom = [];
let customQuizAllQuestions = [];
let customQuizCurrentIndex = 0;
let customQuizCount = 10;
let customQuizTimerType = 'none';
let customQuizTimerValue = 0; 
let customQuizTimeLeft = 0;
let customQuizTimerInterval = null;
let customQuizRandomQuestions = true;
let customQuizRandomOptions = true;
let customQuizAnsweredCount = 0;

/** إضافة لتتبع الأسئلة الصحيحة والخاطئة في الاختبار المخصص */
let customQuizCorrectCount = 0;
let customQuizWrongCount = 0;

/** عند الضغط على زر Make Quizz **/
function showCustomQuizPage() {
  topicsPage.style.display = 'none';
  quizContainer.style.display = 'none';
  floatingButtons.style.display = 'none';
  
  document.getElementById('create-custom-quiz-page').style.display = 'block';
  populateCustomTopicsCheckboxes();
}

/** تعبئة المواضيع في صفحة الاختبار المخصص **/
function populateCustomTopicsCheckboxes() {
  const container = document.getElementById('custom-topics-checkboxes');
  container.innerHTML = '';
  allTopics.forEach((topic, idx) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = idx;
    input.addEventListener('change', (e) => {
      handleTopicSelectionChange(e, topic);
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(topic.topicName));
    container.appendChild(label);
  });
}

/** عند اختيار أو إلغاء اختيار أي Topic **/
function handleTopicSelectionChange(e, topic) {
  if (e.target.checked) {
    selectedTopicsForCustom.push(topic);
  } else {
    selectedTopicsForCustom = selectedTopicsForCustom.filter(t => t !== topic);
  }
  populateSubtopicsCheckboxes();
  updateCustomQuizDetails();
}

/** تعبئة المواضيع الفرعية للمواضيع المختارة **/
function populateSubtopicsCheckboxes() {
  const container = document.getElementById('custom-subtopics-checkboxes');
  container.innerHTML = '';
  selectedSubtopicsForCustom = [];

  selectedTopicsForCustom.forEach(topic => {
    if (topic.subTopics && topic.subTopics.length > 0) {
      topic.subTopics.forEach((sub, idx) => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = sub.file;
        input.dataset.parent = topic.topicName;
        input.addEventListener('change', (e) => {
          handleSubtopicSelectionChange(e, sub, topic.topicName);
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(topic.topicName + ' - ' + sub.name));
        container.appendChild(label);
      });
    } else {
      if (topic.file) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = topic.file;
        input.dataset.parent = topic.topicName;
        input.addEventListener('change', (e) => {
          handleSubtopicSelectionChange(e, {name: topic.topicName, file: topic.file}, topic.topicName);
        });
        label.appendChild(input);
        label.appendChild(document.createTextNode(topic.topicName));
        container.appendChild(label);
      }
    }
  });
}

function handleSubtopicSelectionChange(e, sub, parentTopicName) {
  if (e.target.checked) {
    selectedSubtopicsForCustom.push({ parent: parentTopicName, sub: sub });
  } else {
    selectedSubtopicsForCustom = selectedSubtopicsForCustom.filter(s => s.sub !== sub);
  }
  updateCustomQuizDetails();
}

/** تحديث النص الإرشادي (عدد الملفات والأسئلة المتوفرة) **/
function updateCustomQuizDetails() {
  const details = document.getElementById('custom-quiz-details');
  const totalFiles = new Set();
  selectedSubtopicsForCustom.forEach(s => {
    if (s.sub.file) {
      totalFiles.add(s.sub.file);
    }
  });

  const fetchPromises = [];
  totalFiles.forEach(filePath => {
    const pr = fetch(filePath)
      .then(r => r.json())
      .then(json => Array.isArray(json) ? json.length : 0)
      .catch(() => 0);
    fetchPromises.push(pr);
  });

  Promise.all(fetchPromises).then(counts => {
    const sum = counts.reduce((a, c) => a + c, 0);
    details.textContent = `Selected files: ${totalFiles.size}, total available questions: ${sum}`;
  });
}

/** إظهار/إخفاء حقل الوقت بناءً على اختيار نوع المؤقت **/
const timerTypeRadios = document.querySelectorAll('input[name="timer-type"]');
timerTypeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    customQuizTimerType = radio.value;
    const timeSettings = document.getElementById('time-settings-inputs');
    if (radio.value === 'global' || radio.value === 'per-question') {
      timeSettings.style.display = 'flex';
    } else {
      timeSettings.style.display = 'none';
    }
  });
});

/** بدء إنشاء الاختبار **/
function generateCustomQuiz() {
  customQuizAllQuestions = [];
  customQuizCurrentIndex = 0;
  customQuizAnsweredCount = 0;
  customQuizCorrectCount = 0;
  customQuizWrongCount = 0;

  const questionsInput = document.getElementById('custom-questions-count');
  customQuizCount = parseInt(questionsInput.value) || 10;

  customQuizTimerType = document.querySelector('input[name="timer-type"]:checked').value;
  
  let timeVal = parseInt(document.getElementById('time-value').value) || 60;
  let timeUnit = document.getElementById('time-unit').value;
  if (timeUnit === 'minutes') timeVal *= 60;
  if (timeUnit === 'hours') timeVal *= 3600;
  customQuizTimerValue = timeVal;

  customQuizRandomQuestions = document.getElementById('random-questions').checked;
  customQuizRandomOptions = document.getElementById('random-options').checked;

  // جمع كل الملفات المحددة من subtopics
  const filePaths = [];
  selectedSubtopicsForCustom.forEach(s => {
    if (s.sub.file) {
      filePaths.push(s.sub.file);
    }
  });
  const uniqueFilePaths = [...new Set(filePaths)];

  if (uniqueFilePaths.length === 0) {
    alert('Please select valid topics/subtopics with actual question files!');
    return;
  }

  const fetchPromises = uniqueFilePaths.map(fp => {
    return fetch(fp)
      .then(r => r.json())
      .then(data => Array.isArray(data) ? data : []);
  });

  Promise.all(fetchPromises)
    .then(results => {
      results.forEach(arr => {
        customQuizAllQuestions = customQuizAllQuestions.concat(arr);
      });

      if (customQuizRandomQuestions) {
        customQuizAllQuestions = shuffleArray(customQuizAllQuestions);
      }

      if (customQuizCount < customQuizAllQuestions.length) {
        customQuizAllQuestions = customQuizAllQuestions.slice(0, customQuizCount);
      }

      if (customQuizRandomOptions) {
        customQuizAllQuestions.forEach(q => {
          if (q.options && Array.isArray(q.options)) {
            const currentOptions = q.options.map((option, i) => ({ option, index: i }));
            const shuffledOptions = shuffleArray(currentOptions);
            const newOptions = shuffledOptions.map(o => o.option);
            const correctIndex = shuffledOptions.findIndex(o => o.index === q.answer);
            q.options = newOptions;
            q.answer = correctIndex;
          }
        });
      }

      // إخفاء صفحة الإنشاء
      document.getElementById('create-custom-quiz-page').style.display = 'none';
      // عرض صفحة الاختبار المخصص
      document.getElementById('custom-quiz-container').style.display = 'block';
      document.getElementById('custom-quiz-timer').textContent = '';
      document.getElementById('question-progress-bar').style.width = '0%';
      showCustomQuizQuestion();
      startCustomQuizTimer();
    })
    .catch(err => {
      console.error(err);
      alert('Error loading questions. Please try again.');
    });
}

/** عرض السؤال الحالي في الاختبار المخصص **/
function showCustomQuizQuestion() {
  if (customQuizCurrentIndex >= customQuizAllQuestions.length) {
    endCustomQuiz();
    return;
  }

  const currentQ = customQuizAllQuestions[customQuizCurrentIndex];

  document.getElementById('custom-question-text').innerHTML = currentQ.question;
  const optionsContainer = document.getElementById('custom-options-container');
  optionsContainer.innerHTML = '';

  if (currentQ.options && Array.isArray(currentQ.options)) {
    currentQ.options.forEach((opt, idx) => {
      const divOpt = document.createElement('div');
      divOpt.classList.add('custom-option');
      divOpt.innerHTML = opt;
      divOpt.addEventListener('click', () => {
        checkCustomOption(idx);
      });
      optionsContainer.appendChild(divOpt);
    });
  } else {
    const divOpt = document.createElement('div');
    divOpt.textContent = 'No options found for this question.';
    optionsContainer.appendChild(divOpt);
  }

  const progress = ((customQuizCurrentIndex) / customQuizAllQuestions.length) * 100;
  document.getElementById('question-progress-bar').style.width = progress + '%';
  document.getElementById('next-question-btn').disabled = true;
}

/** عند اختيار إجابة **/
function checkCustomOption(selectedIndex) {
  const currentQ = customQuizAllQuestions[customQuizCurrentIndex];
  const correctIndex = currentQ.answer;
  const optionsElems = document.querySelectorAll('#custom-options-container .custom-option');

  optionsElems.forEach((optElem, idx) => {
    optElem.style.cursor = 'default';
    if (idx === correctIndex) {
      optElem.classList.add('correct');
    }
    if (idx === selectedIndex && selectedIndex !== correctIndex) {
      optElem.classList.add('wrong');
    }
  });

  // تحديث الإحصائيات
  if (selectedIndex === correctIndex) {
    customQuizCorrectCount++;
  } else {
    customQuizWrongCount++;
  }

  customQuizAnsweredCount++;
  document.getElementById('next-question-btn').disabled = false;
}

/** زر السؤال التالي **/
function handleNextQuestion() {
  customQuizCurrentIndex++;
  if (customQuizTimerType === 'per-question') {
    stopCustomQuizTimer();
    startCustomQuizTimer();
  }
  if (customQuizCurrentIndex < customQuizAllQuestions.length) {
    showCustomQuizQuestion();
  } else {
    endCustomQuiz();
  }
}

/** نهاية الاختبار **/
function endCustomQuiz() {
  stopCustomQuizTimer();
  document.getElementById('question-progress-bar').style.width = '100%';
  document.getElementById('custom-question-text').innerHTML = '';
  document.getElementById('custom-options-container').innerHTML = '';
  document.getElementById('next-question-btn').disabled = true;

  const total = customQuizAllQuestions.length;
  const unanswered = total - customQuizAnsweredCount;
  // إظهار النتائج
  const resultEl = document.getElementById('custom-quiz-result');
  resultEl.innerHTML = `
    <p>Quiz finished!</p>
    <p>Total Questions: ${total}</p>
    <p>Correct: ${customQuizCorrectCount}</p>
    <p>Wrong: ${customQuizWrongCount}</p>
    <p>Unanswered: ${unanswered}</p>
    <p>Your Score: ${customQuizCorrectCount} out of ${total}.</p>
  `;
}

/** إعادة الاختبار **/
function restartCustomQuiz() {
  document.getElementById('custom-quiz-container').style.display = 'none';
  document.getElementById('create-custom-quiz-page').style.display = 'block';
  document.getElementById('custom-quiz-result').innerHTML = '';
  customQuizAllQuestions = [];
  customQuizCurrentIndex = 0;
  customQuizAnsweredCount = 0;
  customQuizCorrectCount = 0;
  customQuizWrongCount = 0;
  document.getElementById('question-progress-bar').style.width = '0%';
  document.getElementById('custom-quiz-timer').textContent = '';
}

/** المؤقت **/
function startCustomQuizTimer() {
  if (customQuizTimerType === 'none') return;
  stopCustomQuizTimer();

  if (customQuizTimerType === 'global') {
    if (customQuizCurrentIndex === 0) {
      customQuizTimeLeft = customQuizTimerValue;
    }
  } else if (customQuizTimerType === 'per-question') {
    customQuizTimeLeft = customQuizTimerValue;
  }

  updateCustomQuizTimerDisplay();
  customQuizTimerInterval = setInterval(() => {
    customQuizTimeLeft--;
    updateCustomQuizTimerDisplay();
    if (customQuizTimeLeft <= 0) {
      stopCustomQuizTimer();
      if (customQuizTimerType === 'global') {
        endCustomQuiz();
      } else {
        handleNextQuestion();
      }
    }
  }, 1000);
}

function stopCustomQuizTimer() {
  if (customQuizTimerInterval) {
    clearInterval(customQuizTimerInterval);
    customQuizTimerInterval = null;
  }
}

function updateCustomQuizTimerDisplay() {
  const timerElem = document.getElementById('custom-quiz-timer');
  const minutes = Math.floor(customQuizTimeLeft / 60);
  const seconds = customQuizTimeLeft % 60;
  timerElem.textContent = `Time left: ${minutes}:${(seconds < 10 ? '0'+seconds : seconds)}`;
}

/*****************************************************************
 *              دوال تنزيل الـ PDF (كما في الكود الأصلي)         *
 *****************************************************************/
function downloadPDF() {
  const printWindow = window.open('about:blank', '_blank', 'width=1000,height=800');
  if (!printWindow) {
    alert('Popup blocked! Please allow popups for this site to enable printing.');
    return;
  }

  const fullHTML = '<!DOCTYPE html>\n<html>' + document.documentElement.innerHTML + '\n</html>';
  printWindow.document.open();
  printWindow.document.write(fullHTML);
  printWindow.document.close();

  printWindow.onload = function() {
    if (typeof printWindow.MathJax !== 'undefined') {
      printWindow.MathJax.typesetPromise()
      .then(() => {
        printWindow.focus();
        printWindow.print();
      })
      .catch(() => {
        printWindow.focus();
        printWindow.print();
      });
    } else {
      printWindow.focus();
      printWindow.print();
    }
  };
  return;

  // بقية كود jsPDF (غير مستخدم فعلياً الآن)...
}

/*****************************************************************
 *              دوال مساعدة للبحث ومعالجة النص                    *
 *****************************************************************/
function stripHTML(str) {
  return str.replace(/<[^>]*>?/gm, '');
}

function highlightTerm(text, term) {
  const re = new RegExp(term, 'gi');
  return text.replace(re, matched => `<mark>${matched}</mark>`);
}
