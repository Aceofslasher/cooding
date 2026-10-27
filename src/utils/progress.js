export function matchesExpectedOutput(actual, expected) {
  return String(actual ?? '').trim() === String(expected ?? '').trim()
}

export function summarizeProgress(progress, totalLessons) {
  const attempts = progress.attempts ?? []
  const completedLessons = progress.lessonsCompleted?.length ?? 0
  return {
    completedLessons,
    attemptedExercises: attempts.length,
    passedExercises: attempts.filter((attempt) => attempt.passed).length,
    topicsExplored: new Set(attempts.map((attempt) => attempt.topic).filter(Boolean)).size,
    completionPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0,
  }
}

export function countCorrectedAttempts(attempts = []) {
  const failedByTopic = new Map()
  let corrected = 0
  for (const attempt of [...attempts].reverse()) {
    if (!attempt.topic) continue
    if (!attempt.passed) {
      failedByTopic.set(attempt.topic, (failedByTopic.get(attempt.topic) ?? 0) + 1)
    } else if (failedByTopic.has(attempt.topic)) {
      corrected += failedByTopic.get(attempt.topic)
      failedByTopic.delete(attempt.topic)
    }
  }
  return corrected
}