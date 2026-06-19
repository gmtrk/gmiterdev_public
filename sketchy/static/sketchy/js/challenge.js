import { pointsForRecognition } from './scoring.js';

export function createRound(prompts, roundSeconds = 20) {
  return { prompts: [...prompts], idx: 0, results: [], roundSeconds };
}

export function isRecognized(topLabel, target) {
  return topLabel === target;
}

export function currentPrompt(round) {
  return round.idx < round.prompts.length ? round.prompts[round.idx] : null;
}

export function isOver(round) {
  return round.idx >= round.prompts.length;
}

// won + secondsLeft -> append a scored result and advance.
export function recordResult(round, { won, secondsLeft }) {
  const target = round.prompts[round.idx];
  const points = won ? pointsForRecognition(secondsLeft, round.roundSeconds) : 0;
  return {
    ...round,
    idx: round.idx + 1,
    results: [...round.results, { target, won: !!won, points }],
  };
}
