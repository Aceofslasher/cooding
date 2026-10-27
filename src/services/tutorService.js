import { getAuthHeaders } from './supabase'

function localTutorReply({ question, code, error, context }) {
  const prompt = [question, error].filter(Boolean).join(' ').toLowerCase()
  let explanation

  if (prompt.includes('hint') || prompt.includes('stuck')) {
    explanation = context?.hint || 'Try splitting the task into one small step. What value do you need first, and what should the program do with it?'
  } else if (prompt.includes('undefined') || prompt.includes('referenceerror')) {
    explanation = 'This usually means JavaScript cannot find a variable with that name. Check the spelling and make sure the variable is declared before this line runs.'
  } else if (prompt.includes('syntax') || prompt.includes('unexpected')) {
    explanation = 'This looks like a syntax issue: the parser reached something it did not expect. Check the line just before the reported position for a missing quote, bracket, or closing brace.'
  } else if (prompt.includes('variable')) {
    explanation = 'A variable gives a value a reusable name. You can use that name in more than one place, and if the value changes, you update it once. What other part of this greeting might reuse the learner name?'
  } else if (prompt.includes('loop') || context?.topic === 'Loops') {
    explanation = 'A loop needs a starting value, a condition that eventually becomes false, and an update. Trace those three pieces for two iterations. Which one is easiest to check first?'
  } else if (prompt.includes('function')) {
    explanation = 'A function parameter receives an input, and `return` sends a result back. Printing a value and returning it are different actions. Which result should the caller receive?'
  } else if (context?.recentMistakes?.length) {
    explanation = `I noticed you have been practicing ${context.recentMistakes[0].split(':')[0]}. Let's use this question to strengthen that idea: what does the first line do, and what value do you expect next?`
  } else {
    explanation = `Let's work through it one step at a time. ${context?.objective ? `The goal is to ${context.objective.toLowerCase()} ` : ''}What does the first line do, and what value do you expect next?`
  }

  if (code?.trim()) explanation += '\n\nI looked at the code you attached. Try tracing the values in order, then run it again to see whether the output changes.'
  return explanation
}

export async function askTutor(payload) {
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_SERVERLESS !== 'true') {
    return { reply: localTutorReply(payload), mode: 'demo' }
  }
  try {
    const authHeaders = await getAuthHeaders()
    const response = await fetch('/api/tutor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error('Tutor endpoint unavailable')
    const data = await response.json()
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Tutor returned an empty reply')
    return { reply: data.reply, mode: 'ai' }
  } catch {
    return { reply: localTutorReply(payload), mode: 'demo' }
  }
}