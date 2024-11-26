document.addEventListener("DOMContentLoaded", function () {
    const scoreElem = document.getElementById("score");
    const finalScoreElem = document.getElementById("final-score");
    const personalBestElem = document.getElementById("personal-best");
    const gameOverElem = document.getElementById("game-over");
    const higherBtn = document.getElementById("higher-btn");
    const lowerBtn = document.getElementById("lower-btn");
    const guessScoreElem = document.getElementById("guess-score");
    const compareScoreElem = document.getElementById("compare-score");
    const gameTitleElem = document.getElementById("game-title");
    const gamePlatformsElem = document.getElementById("game-platforms");
    const gameYearElem = document.getElementById("game-year");
    const gameImageElem = document.getElementById("game-image");
    const restartBtn = document.getElementById("restart-btn");
    const submithighscoreBtn = document.getElementById("submit-high-score-btn");

    let score = 0;
    let personalbest = 0;

    // Success messages
    const successMessages = [
        "great job!", "you got it!", "spot on!", "right on the money!", "nice guess!",
        "you're on fire!", "keep it up!", "well done!", "nailed it!", "correct!",
        "good job!", "wow... so good...", "letsgo!!!", "here we go!", "the numbers don't lie",
    ];

    function getRandomMessage() {
        return successMessages[Math.floor(Math.random() * successMessages.length)];
    }

    // Show game over screen
    function showGameOver() {
        gameOverElem.classList.remove("hidden");
        finalScoreElem.textContent = score;
        if (score > personalbest){
            personalbest = score;
        }
        personalBestElem.textContent = personalbest;

        showHighScores(score);
    }

    // Animate score reveal
    function animateScoreReveal(start, end) {
        let current = start;
        const increment = end > start ? 1 : -1;
        const duration = Math.abs(end - start) * 20;

        const animate = setInterval(() => {
            current += increment;
            guessScoreElem.textContent = current;
            setScoreColor(guessScoreElem, current);
            if (current === end) clearInterval(animate);
        }, duration / Math.abs(end - start));
    }

    // Set color based on score
    function setScoreColor(element, score) {
        element.classList.remove("bg-green-400", "bg-yellow-400", "bg-red-500", "text-white");
        if (score >= 75) {
            element.classList.add("bg-green-400", "text-black");
        } else if (score >= 50) {
            element.classList.add("bg-yellow-400", "text-black");
        } else {
            element.classList.add("bg-red-500", "text-white");
        }
    }

    // Fetch a new random game
    function fetchRandomGame() {
        fetch("random-game/")
            .then(response => response.json())
            .then(data => {
                // Populate game data
                actualScore = parseFloat(data.score);
                gameTitleElem.textContent = data.game_name;
                gamePlatformsElem.textContent = `Platforms: ${data.platform}`;
                gameYearElem.textContent = `Year: ${data.release_year}`;
                gameImageElem.src = data.cover_url || "/static/metaguess/img/nocover.png";
                // Set comparison score
                guessScoreElem.textContent = "?";
                compareScoreElem.textContent = getCompareScore(actualScore);
                setScoreColor(compareScoreElem, parseInt(compareScoreElem.textContent));

                // Reset game image error handling
                gameImageElem.onerror = function() {
                    this.src = "/static/metaguess/img/nocover.png";
                };
            })
            .catch(error => console.error("Error fetching random game:", error));
    }

    // Generate comparison score for guessing
    function getCompareScore(trueScore) {
    let compareScore;
    if (trueScore < 75) {
        // Generate a random score between 30 and 95 for low true scores
        compareScore = Math.floor(Math.random() * (95 - 30 + 1)) + 30;
    } else {
        // Adjust true score slightly for higher scores
        const randomAdjust = Math.floor(Math.random() * 6) + 5;
        compareScore = Math.random() > 0.5 ? trueScore + randomAdjust : trueScore - randomAdjust;
        compareScore = Math.min(95, Math.max(30, compareScore)); // Ensure within range
    }

    // Ensure compareScore is not the same as trueScore
    if (compareScore === trueScore) {
        compareScore = compareScore < 95 ? compareScore + 1 : compareScore - 1;
    }
    return compareScore;
}

    function makeGuess(isHigher) {
        const compareScore = parseInt(compareScoreElem.textContent);

        higherBtn.classList.add("hidden");
        lowerBtn.classList.add("hidden");

        animateScoreReveal(0, actualScore);

        setTimeout(() => {
            if ((isHigher && actualScore > compareScore) || (!isHigher && actualScore < compareScore)) {
                score += 10;
                scoreElem.textContent = score;

                // Display floating success message
                const messageElem = document.createElement("span");
                messageElem.classList.add("absolute", "text-green-800", "font-semibold", "animate-float-fade-out");
                messageElem.style.top = "50%";
                messageElem.style.left = "50%";
                messageElem.style.transform = "translate(-50%, -50%)";
                messageElem.textContent = getRandomMessage();
                guessScoreElem.appendChild(messageElem);

                setTimeout(() => {
                    messageElem.remove();
                    guessScoreElem.classList.remove("bg-green-400", "bg-yellow-400", "bg-red-500", "text-white");
                    higherBtn.classList.remove("hidden");
                    lowerBtn.classList.remove("hidden");
                    fetchRandomGame();
                }, 2000);

            } else {
                showGameOver();
            }
        }, 2000);
    }

    // Function to show high scores
    function showHighScores(finalScore) {
        submithighscoreBtn.classList.remove("hidden");
        fetch("/metaguess/get-high-scores/")
            .then(response => response.json())
            .then(data => {
                const highScoreTable = document.getElementById("high-score-table");
                const newHighScoreForm = document.getElementById("new-high-score-form");

                // Populate high scores
                highScoreTable.innerHTML = "<ul class='text-left space-y-2'>";
                data.forEach((entry, index) => {
                    highScoreTable.innerHTML += `<li>${index + 1}. <strong>${entry.initials}</strong> - ${entry.score}</li>`;
                });
                highScoreTable.innerHTML += "</ul>";

                // Check if the player's score qualifies for the top 5
                if (data.length < 5 || finalScore > data[data.length - 1].score) {
                    newHighScoreForm.classList.remove("hidden");
                    document.getElementById("submit-high-score-btn").onclick = () => {
                        console.log("Submit button clicked!");
                        const initials = document.getElementById("high-score-initials").value.trim().toUpperCase();
                        console.log("Entered initials:", initials);
                        submithighscoreBtn.classList.add("hidden");

                        if (initials.length === 3) {
                            fetch("/metaguess/add-high-score/", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "X-CSRFToken": getCSRFToken(), // Add CSRF token
                                },
                                body: JSON.stringify({ initials: initials, score: finalScore }),
                            })
                            .then(response => response.json())
                            .then(data => {
                                console.log("Score submitted successfully:", data);
                                alert("Score submitted successfully!");
                                document.getElementById("new-high-score-form").classList.add("hidden");
                                showHighScores(finalScore); // Refresh high scores
                            })
                            .catch(error => console.error("Error submitting high score:", error));
                        } else {
                            alert("Please enter exactly 3 characters for initials.");
                        }
                    };
                } else {
                    newHighScoreForm.classList.add("hidden");
                }

                // Display the Game Over screen with the high score table
                document.getElementById("game-over").classList.remove("hidden");
            })
            .catch(error => console.error("Error fetching high scores:", error));
    }

    // Utility: Get CSRF Token
    function getCSRFToken() {
        const tokenElement = document.querySelector("[name=csrfmiddlewaretoken]");
        if (tokenElement) {
            return tokenElement.value;
        }
        console.error("CSRF token not found.");
        return ""; // Fallback for debugging
    }



    // Reset the game
    function resetGame() {
        score = 0;
        scoreElem.textContent = score;
        gameOverElem.classList.add("hidden");
        higherBtn.classList.remove("hidden");
        lowerBtn.classList.remove("hidden");
        guessScoreElem.classList.remove("bg-green-400", "bg-yellow-400", "bg-red-500", "text-white");
        guessScoreElem.textContent = "?";
        compareScoreElem.textContent = "";

        // Fetch a new game
        fetchRandomGame();
    }

    higherBtn.addEventListener("click", () => makeGuess(true));
    lowerBtn.addEventListener("click", () => makeGuess(false));
    restartBtn.addEventListener("click", resetGame);
    //submithighscoreBtn.addEventListener("click", resetGame);

    // Fetch the first game on page load
    fetchRandomGame();
});
