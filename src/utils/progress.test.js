import test from 'node:test'
import assert from 'node:assert/strict'
import { countCorrectedAttempts, matchesExpectedOutput, summarizeProgress } from './progress.js'

test('output checks ignore surrounding whitespace but preserve content', () => {
  assert.equal(matchesExpectedOutput('  Hello\n', 'Hello'), true)
  assert.equal(matchesExpectedOutput('Hello there', 'Hello'), false)
})

test('progress summary counts only recorded activity', () => {
  const summary = summarizeProgress({
    lessonsCompleted: ['variables'],
    attempts: [
      { passed: true, topic: 'Variables' },
      { passed: false, topic: 'Variables' },
      { passed: true, topic: 'Loops' },
    ],
  }, 4)
  assert.deepEqual(summary, {
    completedLessons: 1,
    attemptedExercises: 3,
    passedExercises: 2,
    topicsExplored: 2,
    completionPercent: 25,
  })
})

test('empty progress has no inferred results', () => {
  assert.deepEqual(summarizeProgress({}, 5), {
    completedLessons: 0,
    attemptedExercises: 0,
    passedExercises: 0,
    topicsExplored: 0,
    completionPercent: 0,
  })
})

test('a later accepted attempt resolves earlier failures for the same topic', () => {
  assert.equal(countCorrectedAttempts([
    { topic: 'Loops', passed: true },
    { topic: 'Loops', passed: false },
    { topic: 'Loops', passed: false },
    { topic: 'Variables', passed: false },
  ]), 2)
})