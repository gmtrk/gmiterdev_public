document.addEventListener("DOMContentLoaded", () => {
  const id = (x) => document.getElementById(x);
  const els = {
    score: id("score"),
    finalScore: id("final-score"),
    personalBest: id("personal-best"),
    gameOver: id("game-over"),
    higherBtn: id("higher-btn"),
    lowerBtn: id("lower-btn"),
    buttons: id("buttons"),
    restartBtn: id("restart-btn"),
    submitBtn: id("submit-high-score-btn"),
    emptyMsg: id("empty-msg"),
    anchorCard: id("anchor-card"),
    anchorImage: id("anchor-image"),
    anchorTitle: id("anchor-title"),
    anchorTag: id("anchor-tag"),
    anchorSentiment: id("anchor-sentiment"),
    anchorSub: id("anchor-sub"),
    anchorScore: id("anchor-score"),
    challengerCard: id("challenger-card"),
    challengerImage: id("challenger-image"),
    challengerTitle: id("challenger-title"),
    challengerTag: id("challenger-tag"),
    challengerSentiment: id("challenger-sentiment"),
    challengerSub: id("challenger-sub"),
    challengerScore: id("challenger-score"),
  };

  const NOCOVER = "/static/metaguess/img/nocover.png";
  const CARD_BANDS = ["mg-card--good", "mg-card--mixed", "mg-card--bad"];
  const SQUARE_BANDS = ["mg-square--good", "mg-square--mixed", "mg-square--bad"];

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

  function scoreBand(value) {
    if (value >= 90) return { cls: "good", sentiment: "Universal Acclaim" };
    if (value >= 75) return { cls: "good", sentiment: "Generally Favorable" };
    if (value >= 50) return { cls: "mixed", sentiment: "Mixed or Average" };
    return { cls: "bad", sentiment: "Generally Unfavorable" };
  }

  function clearBands(prefix) {
    els[prefix + "Card"].classList.remove(...CARD_BANDS, "mg-flash");
    els[prefix + "Score"].classList.remove(...SQUARE_BANDS);
  }

  function applyBand(prefix, cls) {
    const card = els[prefix + "Card"];
    const sq = els[prefix + "Score"];
    card.classList.remove(...CARD_BANDS);
    sq.classList.remove(...SQUARE_BANDS);
    card.classList.add("mg-card--" + cls);
    sq.classList.add("mg-square--" + cls);
  }

  function revealCard(prefix, value, animate) {
    const band = scoreBand(value);
    const sq = els[prefix + "Score"];
    const sentiment = els[prefix + "Sentiment"];

    function showSentiment() {
      sentiment.textContent = band.sentiment;
      sentiment.classList.remove("mg-sentiment--muted");
    }

    // Anchor (known reference): reveal instantly.
    if (!animate) {
      applyBand(prefix, band.cls);
      sq.textContent = Math.round(value);
      showSentiment();
      return;
    }

    // Challenger reveal: color + number climb together so the final band
    // never shows before the number lands (no spoiler). Sentiment waits
    // until the count finishes.
    const target = Math.round(value);
    let current = 0;
    sq.textContent = current;
    applyBand(prefix, scoreBand(current).cls);
    if (target <= 0) {
      showSentiment();
      return;
    }
    const stepMs = Math.max(8, Math.round(600 / target));
    const timer = setInterval(() => {
      current += 1;
      sq.textContent = current;
      applyBand(prefix, scoreBand(current).cls);
      if (current >= target) {
        clearInterval(timer);
        showSentiment();
      }
    }, stepMs);
  }

  function setCard(prefix, game, reveal) {
    els[prefix + "Image"].onerror = function () { this.src = NOCOVER; };
    els[prefix + "Image"].src = game.cover_url || NOCOVER;
    els[prefix + "Title"].textContent = game.game_name;
    els[prefix + "Tag"].textContent = game.platform || "Unknown platform";
    els[prefix + "Sub"].textContent = game.release_year ? `Released ${game.release_year}` : "";
    clearBands(prefix);
    if (reveal) {
      revealCard(prefix, game.score, false);
    } else {
      const sentiment = els[prefix + "Sentiment"];
      sentiment.textContent = "Higher or lower?";
      sentiment.classList.add("mg-sentiment--muted");
      els[prefix + "Score"].textContent = "?";
    }
  }

  function nextCard() {
    if (index >= deck.length) {
      shuffle(deck);
      index = 0;
      if (deck.length > 1 && anchor && deck[0] === anchor) {
        [deck[0], deck[1]] = [deck[1], deck[0]];
      }
    }
    return deck[index++];
  }

  function renderRound() {
    setCard("anchor", anchor, true);
    setCard("challenger", challenger, false);
    els.higherBtn.classList.remove("mg-hidden");
    els.lowerBtn.classList.remove("mg-hidden");
    busy = false;
  }

  function bumpScore() {
    els.score.classList.remove("mg-bump");
    // force reflow so the animation can replay
    void els.score.offsetWidth;
    els.score.classList.add("mg-bump");
    setTimeout(() => els.score.classList.remove("mg-bump"), 450);
  }

  function plusOne() {
    const chip = document.createElement("span");
    chip.className = "mg-plusone";
    chip.textContent = "+1";
    els.challengerScore.appendChild(chip);
    setTimeout(() => chip.remove(), 1100);
  }

  function makeGuess(isHigher) {
    if (busy || !anchor || !challenger) return;
    busy = true;
    els.higherBtn.classList.add("mg-hidden");
    els.lowerBtn.classList.add("mg-hidden");
    revealCard("challenger", challenger.score, true);

    // Ties count as correct, in either direction.
    const correct = isHigher
      ? challenger.score >= anchor.score
      : challenger.score <= anchor.score;

    setTimeout(() => {
      if (correct) {
        score += 1;
        els.score.textContent = score;
        bumpScore();
        plusOne();
        setTimeout(() => {
          anchor = challenger;
          challenger = nextCard();
          renderRound();
        }, 1200);
      } else {
        els.challengerCard.classList.add("mg-flash");
        setTimeout(showGameOver, 2000);
      }
    }, 900);
  }

  function startGame() {
    score = 0;
    els.score.textContent = score;
    els.gameOver.classList.add("mg-hidden");
    if (deck.length < 2) {
      els.emptyMsg.classList.remove("mg-hidden");
      els.buttons.classList.add("mg-hidden");
      return;
    }
    els.emptyMsg.classList.add("mg-hidden");
    els.buttons.classList.remove("mg-hidden");
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
        els.emptyMsg.classList.remove("mg-hidden");
        els.buttons.classList.add("mg-hidden");
      });
  }

  function showGameOver() {
    if (score > personalBest) personalBest = score;
    els.finalScore.textContent = score;
    els.personalBest.textContent = personalBest;
    showHighScores(score);
    els.gameOver.classList.remove("mg-hidden");
  }

  function getCSRFToken() {
    const el = document.querySelector("[name=csrfmiddlewaretoken]");
    return el ? el.value : "";
  }

  function showHighScores(finalScore) {
    fetch("/metaguess/get-high-scores/")
      .then((r) => r.json())
      .then((data) => {
        const table = id("high-score-table");
        const form = id("new-high-score-form");
        table.innerHTML = data
          .map(
            (entry, i) =>
              `<div class="mg-lb__row"><span><span class="mg-lb__rank">${i + 1}</span><span class="mg-lb__ini">${entry.initials}</span></span><span class="mg-lb__pts">${entry.score}</span></div>`
          )
          .join("");

        const qualifies =
          finalScore > 0 && (data.length < 5 || finalScore > data[data.length - 1].score);
        if (qualifies) {
          form.classList.remove("mg-hidden");
          els.submitBtn.classList.remove("mg-hidden");
          els.submitBtn.onclick = () => submitHighScore(finalScore);
        } else {
          form.classList.add("mg-hidden");
        }
      })
      .catch((err) => console.error("Error fetching high scores:", err));
  }

  function submitHighScore(finalScore) {
    const initials = id("high-score-initials").value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(initials)) {
      alert("Please enter exactly 3 letters for initials.");
      return;
    }
    els.submitBtn.classList.add("mg-hidden");
    fetch("/metaguess/add-high-score/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": getCSRFToken() },
      body: JSON.stringify({ initials, score: finalScore }),
    })
      .then((r) => r.json())
      .then(() => {
        id("new-high-score-form").classList.add("mg-hidden");
        showHighScores(finalScore);
      })
      .catch((err) => console.error("Error submitting high score:", err));
  }

  els.higherBtn.addEventListener("click", () => makeGuess(true));
  els.lowerBtn.addEventListener("click", () => makeGuess(false));
  els.restartBtn.addEventListener("click", startGame);

  loadDeckAndStart();
});
