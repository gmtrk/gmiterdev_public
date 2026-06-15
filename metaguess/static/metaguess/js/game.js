document.addEventListener("DOMContentLoaded", () => {
  const els = {
    score: document.getElementById("score"),
    finalScore: document.getElementById("final-score"),
    personalBest: document.getElementById("personal-best"),
    gameOver: document.getElementById("game-over"),
    higherBtn: document.getElementById("higher-btn"),
    lowerBtn: document.getElementById("lower-btn"),
    buttons: document.getElementById("buttons"),
    restartBtn: document.getElementById("restart-btn"),
    submitBtn: document.getElementById("submit-high-score-btn"),
    emptyMsg: document.getElementById("empty-msg"),
    anchorImage: document.getElementById("anchor-image"),
    anchorTitle: document.getElementById("anchor-title"),
    anchorMeta: document.getElementById("anchor-meta"),
    anchorScore: document.getElementById("anchor-score"),
    challengerImage: document.getElementById("challenger-image"),
    challengerTitle: document.getElementById("challenger-title"),
    challengerMeta: document.getElementById("challenger-meta"),
    challengerScore: document.getElementById("challenger-score"),
  };

  const NOCOVER = "/static/metaguess/img/nocover.png";
  const MESSAGES = [
    "great job!", "you got it!", "spot on!", "nice guess!", "you're on fire!",
    "keep it up!", "well done!", "nailed it!", "correct!", "the numbers don't lie",
  ];
  const randomMessage = () => MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  let deck = [];
  let index = 0;
  let anchor = null;
  let challenger = null;
  let score = 0;
  let personalBest = 0;
  let busy = false;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function clearScoreColor(el) {
    el.classList.remove(
      "bg-green-400", "bg-yellow-400", "bg-red-500", "bg-gray-100", "bg-gray-200",
      "text-white", "text-black", "text-gray-700"
    );
  }

  function setScoreColor(el, value) {
    clearScoreColor(el);
    if (value >= 75) el.classList.add("bg-green-400", "text-black");
    else if (value >= 50) el.classList.add("bg-yellow-400", "text-black");
    else el.classList.add("bg-red-500", "text-white");
  }

  function setCard(prefix, game, revealScore) {
    els[prefix + "Image"].onerror = function () { this.src = NOCOVER; };
    els[prefix + "Image"].src = game.cover_url || NOCOVER;
    els[prefix + "Title"].textContent = game.game_name;
    els[prefix + "Meta"].textContent = `${game.platform || "Unknown"} · ${game.release_year || "—"}`;
    const scoreEl = els[prefix + "Score"];
    if (revealScore) {
      setScoreColor(scoreEl, game.score);
      scoreEl.textContent = Math.round(game.score);
    } else {
      clearScoreColor(scoreEl);
      scoreEl.classList.add("bg-gray-100", "text-gray-700");
      scoreEl.textContent = "?";
    }
  }

  function nextCard() {
    if (index >= deck.length) {
      shuffle(deck);
      index = 0;
      // Avoid comparing a game against itself right after a reshuffle.
      if (deck.length > 1 && anchor && deck[0] === anchor) {
        [deck[0], deck[1]] = [deck[1], deck[0]];
      }
    }
    return deck[index++];
  }

  function renderRound() {
    setCard("anchor", anchor, true);
    setCard("challenger", challenger, false);
    els.higherBtn.classList.remove("hidden");
    els.lowerBtn.classList.remove("hidden");
    busy = false;
  }

  function animateScoreReveal(el, value) {
    const target = Math.round(value);
    if (target === 0) {
      setScoreColor(el, 0);
      el.textContent = 0;
      return;
    }
    let current = 0;
    setScoreColor(el, current);
    el.textContent = current;
    const stepMs = Math.max(10, Math.round(600 / (target || 1)));
    const timer = setInterval(() => {
      current += 1;
      el.textContent = current;
      setScoreColor(el, current);
      if (current >= target) clearInterval(timer);
    }, stepMs);
  }

  function floatMessage(text) {
    const span = document.createElement("span");
    span.classList.add("absolute", "text-green-700", "font-semibold", "animate-float-fade-out");
    span.style.top = "50%";
    span.style.left = "50%";
    span.textContent = text;
    els.challengerScore.parentElement.appendChild(span);
    setTimeout(() => span.remove(), 1600);
  }

  function makeGuess(isHigher) {
    if (busy || !anchor || !challenger) return;
    busy = true;
    els.higherBtn.classList.add("hidden");
    els.lowerBtn.classList.add("hidden");
    animateScoreReveal(els.challengerScore, challenger.score);

    // Ties count as correct, in either direction.
    const correct = isHigher
      ? challenger.score >= anchor.score
      : challenger.score <= anchor.score;

    setTimeout(() => {
      if (correct) {
        score += 1;
        els.score.textContent = score;
        floatMessage(randomMessage());
        setTimeout(() => {
          anchor = challenger;
          challenger = nextCard();
          renderRound();
        }, 1200);
      } else {
        showGameOver();
      }
    }, 800);
  }

  function startGame() {
    score = 0;
    els.score.textContent = score;
    els.gameOver.classList.add("hidden");
    if (deck.length < 2) {
      els.emptyMsg.classList.remove("hidden");
      els.buttons.classList.add("hidden");
      return;
    }
    els.emptyMsg.classList.add("hidden");
    els.buttons.classList.remove("hidden");
    shuffle(deck);
    index = 0;
    anchor = deck[index++];
    challenger = deck[index++];
    renderRound();
  }

  function loadDeckAndStart() {
    fetch("/metaguess/deck/")
      .then((r) => r.json())
      .then((data) => {
        deck = Array.isArray(data) ? data : [];
        startGame();
      })
      .catch((err) => {
        console.error("Error loading deck:", err);
        els.emptyMsg.classList.remove("hidden");
        els.buttons.classList.add("hidden");
      });
  }

  function showGameOver() {
    if (score > personalBest) personalBest = score;
    els.finalScore.textContent = score;
    els.personalBest.textContent = personalBest;
    showHighScores(score);
    els.gameOver.classList.remove("hidden");
  }

  function getCSRFToken() {
    const el = document.querySelector("[name=csrfmiddlewaretoken]");
    return el ? el.value : "";
  }

  function showHighScores(finalScore) {
    fetch("/metaguess/get-high-scores/")
      .then((r) => r.json())
      .then((data) => {
        const table = document.getElementById("high-score-table");
        const form = document.getElementById("new-high-score-form");
        let html = "<ul class='text-left space-y-2 inline-block'>";
        data.forEach((entry, i) => {
          html += `<li>${i + 1}. <strong>${entry.initials}</strong> &mdash; ${entry.score}</li>`;
        });
        html += "</ul>";
        table.innerHTML = html;

        const qualifies =
          finalScore > 0 && (data.length < 5 || finalScore > data[data.length - 1].score);
        if (qualifies) {
          form.classList.remove("hidden");
          els.submitBtn.classList.remove("hidden");
          els.submitBtn.onclick = () => submitHighScore(finalScore);
        } else {
          form.classList.add("hidden");
        }
      })
      .catch((err) => console.error("Error fetching high scores:", err));
  }

  function submitHighScore(finalScore) {
    const initials = document.getElementById("high-score-initials").value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(initials)) {
      alert("Please enter exactly 3 letters for initials.");
      return;
    }
    els.submitBtn.classList.add("hidden");
    fetch("/metaguess/add-high-score/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
      body: JSON.stringify({ initials, score: finalScore }),
    })
      .then((r) => r.json())
      .then(() => {
        document.getElementById("new-high-score-form").classList.add("hidden");
        showHighScores(finalScore);
      })
      .catch((err) => console.error("Error submitting high score:", err));
  }

  els.higherBtn.addEventListener("click", () => makeGuess(true));
  els.lowerBtn.addEventListener("click", () => makeGuess(false));
  els.restartBtn.addEventListener("click", startGame);

  loadDeckAndStart();
});
