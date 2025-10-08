document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const welcomeScreen = document.getElementById('welcome-screen');
    const examContainer = document.getElementById('exam-container');
    const questionsWrapper = document.getElementById('questions-wrapper');
    const resultsContainer = document.getElementById('results-container');
    const startExamBtn = document.getElementById('start-exam-btn');
    const showResultBtn = document.getElementById('show-result-btn');
    const backToHomeBtn = document.getElementById('back-to-home-btn');
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmStartBtn = document.getElementById('confirm-start-btn');
    const cancelStartBtn = document.getElementById('cancel-start-btn');
    const homeModal = document.getElementById('home-modal');
    const confirmHomeBtn = document.getElementById('confirm-home-btn');
    const cancelHomeBtn = document.getElementById('cancel-home-btn');

    // Timer Elements
    const timerDisplay = document.getElementById('timer-display');
    const timerCircleProgress = document.querySelector('.timer-circle-progress');
    const pauseResumeBtn = document.getElementById('pause-resume-btn');
    const restartBtn = document.getElementById('restart-btn');
    const timeInput = document.getElementById('time-input');

    // Toggles and Filters
    const toggleSource = document.getElementById('toggle-source');
    const toggleExplanation = document.getElementById('toggle-explanation');
    const filterButtons = document.querySelectorAll('.filter-btn');

    let allQuestions = [];
    let timerInterval;
    let totalTime = 3 * 60 * 60; // 3 hours in seconds
    let timeLeft = totalTime;
    let isPaused = false;
    let examGenerated = false;


    // --- EVENT LISTENERS ---

    // Set today's date
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-GB');

    startExamBtn.addEventListener('click', () => {
        confirmationModal.style.display = 'flex';
    });

    cancelStartBtn.addEventListener('click', () => {
        confirmationModal.style.display = 'none';
    });

    confirmStartBtn.addEventListener('click', () => {
        confirmationModal.style.display = 'none';
        const userMinutes = parseInt(timeInput.value, 10);
        if (!isNaN(userMinutes) && userMinutes > 0) {
            totalTime = userMinutes * 60;
        }
        timeLeft = totalTime;
        startExam();
    });
    
    backToHomeBtn.addEventListener('click', () => {
        homeModal.style.display = 'flex';
    });

    cancelHomeBtn.addEventListener('click', () => {
        homeModal.style.display = 'none';
    });

    confirmHomeBtn.addEventListener('click', () => {
        // Assuming the main page is index.html in the parent directory
        window.location.href = '../index.html'; 
    });


    showResultBtn.addEventListener('click', () => {
        calculateAndShowResults();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    toggleSource.addEventListener('change', () => {
        questionsWrapper.classList.toggle('hide-source-info', !toggleSource.checked);
    });
    
    toggleExplanation.addEventListener('change', () => {
        questionsWrapper.classList.toggle('show-explanations', toggleExplanation.checked);
    });

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filterQuestions(button.dataset.filter);
            document.querySelector('.filter-btn.active')?.classList.remove('active');
            button.classList.add('active');
        });
    });

    pauseResumeBtn.addEventListener('click', togglePause);
    restartBtn.addEventListener('click', () => {
        clearInterval(timerInterval);
        timeLeft = totalTime;
        isPaused = false;
        pauseResumeBtn.textContent = 'إيقاف مؤقت';
        startTimer();
    });


    // --- CORE FUNCTIONS ---

    async function startExam() {
        welcomeScreen.style.display = 'none';
        examContainer.style.display = 'block';
        document.body.classList.add('exam-active');
        if (!examGenerated) {
            await generateExamQuestions();
            examGenerated = true;
        }
        startTimer();
    }
    
    async function fetchWithRetry(url, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error(`Attempt ${i + 1} failed for ${url}:`, error);
                if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
                else throw error; // Rethrow after last attempt
            }
        }
    }


    async function generateExamQuestions() {
        try {
            const topicsConfig = await fetchWithRetry('basic_data/vbe_topics.json');
            let generatedQuestions = [];
            const allPromises = [];

            for (const subject in topicsConfig) {
                const { count, files } = topicsConfig[subject];
                const subjectPromise = Promise.all(files.map(file => fetchWithRetry(file)))
                    .then(questionArrays => {
                        // Flatten the array of arrays into a single array of questions
                        const allSubjectQuestions = questionArrays.flat();
                        // Shuffle and pick the required number of questions
                        const shuffled = shuffleArray(allSubjectQuestions);
                        generatedQuestions.push(...shuffled.slice(0, count));
                    })
                    .catch(error => console.error(`Error loading questions for ${subject}:`, error));
                
                allPromises.push(subjectPromise);
            }
            
            await Promise.all(allPromises);

            // Final shuffle to mix questions from different subjects
            allQuestions = shuffleArray(generatedQuestions);
            if(allQuestions.length > 200) {
                allQuestions = allQuestions.slice(0, 200);
            }

            displayQuestions();

        } catch (error) {
            console.error('Failed to load the exam configuration:', error);
            questionsWrapper.innerHTML = `<p style="color: red; text-align: center;">حدث خطأ أثناء تحميل الأسئلة. الرجاء المحاولة مرة أخرى.</p>`;
        }
    }

    function displayQuestions() {
        questionsWrapper.innerHTML = ''; // Clear previous questions
        allQuestions.forEach((q, index) => {
            const optionsHTML = q.options.map((option, i) => `
                <label class="option">
                    <input type="radio" name="question-${index}" value="${i}">
                    <span class="option-text">${option}</span>
                </label>
            `).join('');

            const questionCard = document.createElement('div');
            questionCard.className = 'question-card';
            questionCard.id = `q-card-${index}`;
            questionCard.innerHTML = `
                <div class="question-header">
                    <h3>Question ${index + 1} of ${allQuestions.length}</h3>
                </div>
                <div class="question-text">${q.question}</div>
                <div class="options-container">${optionsHTML}</div>
                <div class="explanation">
                    <strong>Explanation:</strong> ${q.explanation}
                </div>
            `;
            questionsWrapper.appendChild(questionCard);
        });
        // Hide source info by default
         questionsWrapper.classList.add('hide-source-info');
    }

    function calculateAndShowResults() {
        clearInterval(timerInterval); // Stop the timer
        let correctAnswers = 0;
        let incorrectAnswers = 0;
        let unanswered = 0;

        allQuestions.forEach((q, index) => {
            const card = document.getElementById(`q-card-${index}`);
            const selectedOption = document.querySelector(`input[name="question-${index}"]:checked`);
            card.classList.remove('correct', 'incorrect', 'unanswered'); // Reset classes

            if (selectedOption) {
                const userAnswer = parseInt(selectedOption.value, 10);
                if (userAnswer === q.answer) {
                    correctAnswers++;
                    card.classList.add('correct');
                } else {
                    incorrectAnswers++;
                    card.classList.add('incorrect');
                }
            } else {
                unanswered++;
                card.classList.add('unanswered');
            }
            highlightAnswers(index, q.answer);
        });

        // Display results summary
        document.getElementById('total-correct').textContent = correctAnswers;
        document.getElementById('total-incorrect').textContent = incorrectAnswers;
        document.getElementById('total-unanswered').textContent = unanswered;
        document.getElementById('final-score').textContent = `${correctAnswers} / ${allQuestions.length}`;
        resultsContainer.style.display = 'block';
        
        // Disable all radio buttons
        document.querySelectorAll('input[type="radio"]').forEach(radio => radio.disabled = true);
        showResultBtn.style.display = 'none';
        backToHomeBtn.style.display = 'inline-block';
        toggleExplanation.parentElement.style.display = 'flex'; // Show explanation toggle
    }

    function highlightAnswers(questionIndex, correctIndex) {
        const options = document.querySelectorAll(`input[name="question-${questionIndex}"]`);
        options.forEach((option, i) => {
            if (i === correctIndex) {
                option.parentElement.classList.add('correct-answer');
            }
            if (option.checked && i !== correctIndex) {
                 option.parentElement.classList.add('incorrect-answer');
            }
        });
    }
    
    function filterQuestions(filter) {
        const cards = document.querySelectorAll('.question-card');
        cards.forEach(card => {
            if (filter === 'all') {
                card.style.display = 'block';
            } else {
                if (card.classList.contains(filter)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            }
        });
    }

    // --- UTILITY & TIMER FUNCTIONS ---
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function startTimer() {
        timerInterval = setInterval(() => {
            if (!isPaused) {
                timeLeft--;
                updateTimerDisplay();
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    alert('Time is up! The exam will be submitted automatically.');
                    calculateAndShowResults();
                }
            }
        }, 1000);
    }
    
    function updateTimerDisplay() {
        const hours = Math.floor(timeLeft / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        const progress = (timeLeft / totalTime) * 360;
        timerCircleProgress.style.background = `conic-gradient(
            #4caf50 ${progress}deg,
            #ddd ${progress}deg
        )`;
    }

    function togglePause() {
        isPaused = !isPaused;
        pauseResumeBtn.textContent = isPaused ? 'استئناف' : 'إيقاف مؤقت';
    }

});
