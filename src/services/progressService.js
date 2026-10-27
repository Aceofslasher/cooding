import { supabase } from './supabase'

const lessonIds = {
  variables: 'c6231034-0705-42ed-872a-bad7c0080a01',
  conditionals: 'c6231034-0705-42ed-872a-bad7c0080a02',
  loops: 'c6231034-0705-42ed-872a-bad7c0080a03',
  functions: 'c6231034-0705-42ed-872a-bad7c0080a04',
  arrays: 'c6231034-0705-42ed-872a-bad7c0080a05',
  operators: 'c6231034-0705-42ed-872a-bad7c0080a06',
  objects: 'c6231034-0705-42ed-872a-bad7c0080a07',
  debugging: 'c6231034-0705-42ed-872a-bad7c0080a08',
}
const lessonSlugs = Object.fromEntries(Object.entries(lessonIds).map(([slug, id]) => [id, slug]))

export async function loadCloudProgress(userId) {
  if (!supabase) return null
  const [profileResult, lessonResult, attemptResult, quizResult] = await Promise.all([
    supabase.from('profiles').select('display_name, skill_level, preferred_language').eq('id', userId).maybeSingle(),
    supabase.from('lesson_progress').select('lesson_id, status').eq('user_id', userId),
    supabase.from('coding_attempts').select('id, exercise_title, topic, programming_language, execution_status, passed_tests, feedback, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    supabase.from('quiz_attempts').select('id, lesson_id, score, total_questions, completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(100),
  ])
  for (const result of [profileResult, lessonResult, attemptResult, quizResult]) {
    if (result.error) throw result.error
  }
  const lessonRows = lessonResult.data ?? []
  return {
    displayName: profileResult.data?.display_name || 'Learner',
    skillLevel: profileResult.data?.skill_level ? profileResult.data.skill_level[0].toUpperCase() + profileResult.data.skill_level.slice(1) : 'Beginner',
    preferredLanguage: profileResult.data?.preferred_language || 'JavaScript',
    lessonsStarted: lessonRows.map((row) => lessonSlugs[row.lesson_id] || row.lesson_id),
    lessonsCompleted: lessonRows.filter((row) => row.status === 'completed').map((row) => lessonSlugs[row.lesson_id] || row.lesson_id),
    attempts: (attemptResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.exercise_title || 'Coding attempt',
      topic: row.topic || 'Practice',
      language: row.programming_language,
      executionStatus: row.execution_status,
      passed: row.execution_status === 'accepted',
      output: row.feedback || '',
      createdAt: row.created_at,
    })),
    quizAttempts: (quizResult.data ?? []).map((row) => ({
      id: row.id,
      lessonId: lessonSlugs[row.lesson_id] || row.lesson_id,
      score: row.score,
      totalQuestions: row.total_questions,
      completedAt: row.completed_at,
    })),
  }
}

export async function saveCloudAttempt(userId, attempt) {
  if (!supabase) return
  const executionStatuses = ['accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit', 'infrastructure_error']
  const executionStatus = attempt.passed ? 'accepted' : executionStatuses.includes(attempt.executionStatus) ? attempt.executionStatus : 'wrong_answer'
  const { data: savedAttempt, error } = await supabase.from('coding_attempts').insert({
    user_id: userId,
    exercise_title: attempt.title,
    topic: attempt.topic,
    submitted_code: attempt.code || '',
    programming_language: attempt.language || 'javascript',
    execution_status: executionStatus,
    passed_tests: attempt.passed ? 1 : 0,
    total_tests: 1,
    feedback: attempt.output || null,
  }).select('id').single()
  if (error) throw error
  if (attempt.passed && attempt.topic) {
    const { error: resolveError } = await supabase.from('error_history').update({ resolved: true, correction_summary: 'A later attempt for this topic passed.' }).eq('user_id', userId).eq('topic', attempt.topic).eq('resolved', false)
    if (resolveError) throw resolveError
  }
  if (!attempt.passed && (['compile_error', 'runtime_error', 'time_limit'].includes(executionStatus) || executionStatus === 'wrong_answer')) {
    const { error: historyError } = await supabase.from('error_history').insert({
      user_id: userId,
      coding_attempt_id: savedAttempt.id,
      topic: attempt.topic || null,
      error_type: executionStatus === 'wrong_answer' ? 'incorrect_output' : executionStatus,
      error_message: attempt.output || 'The program ran, but its output did not match the exercise requirement.',
      resolved: false,
    })
    if (historyError) throw historyError
  }
}

export async function saveCloudLessonProgress(userId, lessonId, status) {
  if (!supabase) return
  const row = { user_id: userId, lesson_id: lessonIds[lessonId] || lessonId, status }
  if (status === 'started') {
    const { error } = await supabase.from('lesson_progress').upsert(row, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
    if (error) throw error
    return
  }
  row.completed_at = new Date().toISOString()
  const { data: existing, error: lookupError } = await supabase.from('lesson_progress').select('id').eq('user_id', userId).eq('lesson_id', row.lesson_id).maybeSingle()
  if (lookupError) throw lookupError
  const result = existing
    ? await supabase.from('lesson_progress').update({ status, completed_at: row.completed_at }).eq('id', existing.id)
    : await supabase.from('lesson_progress').insert(row)
  const { error } = result
  if (error) throw error
}

export async function saveCloudProfile(userId, profile) {
  if (!supabase) return
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    display_name: profile.displayName,
    skill_level: profile.skillLevel.toLowerCase(),
    preferred_language: profile.preferredLanguage.toLowerCase(),
  })
  if (error) throw error
}

export async function saveCloudQuizAttempt(userId, attempt) {
  if (!supabase) return
  const { error } = await supabase.from('quiz_attempts').insert({
    user_id: userId,
    lesson_id: lessonIds[attempt.lessonId] || attempt.lessonId,
    score: attempt.score,
    total_questions: attempt.totalQuestions,
  })
  if (error) throw error
}