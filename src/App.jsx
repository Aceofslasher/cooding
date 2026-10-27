import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Award,
  BookOpen, Braces, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Code2, Flame, GraduationCap,
  History, LayoutDashboard, Lightbulb, ListChecks, LockKeyhole,
  Menu, MessageCircle, Moon, Play, Plus, RotateCcw, Send, Settings,
  ShieldCheck, Sparkles, Target, Terminal, X,
} from 'lucide-react'
import { lessonQuizzes, lessons, practiceExercises, readProgress } from './data/learningContent'
import { askTutor } from './services/tutorService'
import { getAuthHeaders, isCloudConfigured, supabase } from './services/supabase'
import { loadCloudProgress, saveCloudAttempt, saveCloudLessonProgress, saveCloudProfile, saveCloudQuizAttempt } from './services/progressService'
import { countCorrectedAttempts, matchesExpectedOutput } from './utils/progress'
import './App.css'

const navigation = [
  { section: 'LEARN', items: [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'learn', label: 'Learning path', icon: BookOpen },
    { id: 'practice', label: 'Practice', icon: ListChecks },
  ] },
  { section: 'WORKSPACE', items: [
    { id: 'playground', label: 'Playground', icon: Braces },
    { id: 'tutor', label: 'AI tutor', icon: MessageCircle },
  ] },
  { section: 'YOUR SPACE', items: [
    { id: 'progress', label: 'My progress', icon: Activity },
    { id: 'history', label: 'Learning history', icon: History },
  ] },
]

const pageTitles = {
  dashboard: 'Overview', learn: 'Learning path', practice: 'Practice',
  playground: 'Playground', tutor: 'AI tutor', progress: 'My progress',
  history: 'Learning history', settings: 'Profile & settings', lesson: 'Lesson workspace',
}

const sandboxWorkerSource = `self.onmessage = ({ data }) => {
  const lines = []
  let outputLength = 0
  const safeConsole = {
    log: (...values) => {
      if (lines.length >= 100 || outputLength >= 8000) return
      const line = values.map((value) => {
        if (typeof value === 'string') return value
        if (value && typeof value === 'object') return Array.isArray(value) ? '[Array]' : '[Object]'
        return String(value)
      }).join(' ')
      const boundedLine = line.slice(0, 8000 - outputLength)
      lines.push(boundedLine)
      outputLength += boundedLine.length
    },
  }
  self.fetch = undefined
  self.XMLHttpRequest = undefined
  self.WebSocket = undefined
  self.EventSource = undefined
  self.Worker = undefined
  self.importScripts = undefined
  try {
    new Function('console', data.source)(safeConsole)
    self.postMessage({ output: lines.join('\\n'), executionStatus: 'success' })
  } catch (error) {
    self.postMessage({
      output: lines.join('\\n'),
      error: error?.stack || String(error),
      executionStatus: error?.name === 'SyntaxError' ? 'compile_error' : 'runtime_error',
    })
  }
}`

function Button({ children, variant = 'secondary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>
}

function App() {
  const [progress, setProgress] = useState(readProgress)
  const [page, setPage] = useState('dashboard')
  const [currentLesson, setCurrentLesson] = useState(lessons[0])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(localStorage.getItem('codementor-theme') === 'dark')
  const [toast, setToast] = useState('')
  const [authUser, setAuthUser] = useState(null)
  const [currentCode, setCurrentCode] = useState('')
  const [tutorLanguage, setTutorLanguage] = useState('javascript')

  useEffect(() => {
    localStorage.setItem('codementor-progress', JSON.stringify(progress))
  }, [progress])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthUser(data.session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!authUser) return
    loadCloudProgress(authUser.id).then((cloudProgress) => {
      setProgress((previous) => ({ ...previous, ...cloudProgress }))
    }).catch(() => setToast('Could not load cloud progress'))
  }, [authUser])

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('codementor-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  function openLesson(lesson) {
    if (authUser) saveCloudLessonProgress(authUser.id, lesson.id, 'started').catch(() => setToast('Could not sync lesson progress'))
    setProgress((previous) => ({
      ...previous,
      lessonsStarted: previous.lessonsStarted.includes(lesson.id) ? previous.lessonsStarted : [...previous.lessonsStarted, lesson.id],
    }))
    setCurrentLesson(lesson)
    setPage('lesson')
    setMobileNavOpen(false)
  }

  function recordAttempt(attempt) {
    const savedAttempt = { ...attempt, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setProgress((previous) => ({
      ...previous,
      attempts: [savedAttempt, ...previous.attempts],
    }))
    if (authUser) saveCloudAttempt(authUser.id, savedAttempt).catch(() => setToast('Attempt saved locally, but cloud sync failed'))
  }

  function completeLesson(lesson) {
    setProgress((previous) => ({
      ...previous,
      lessonsCompleted: previous.lessonsCompleted.includes(lesson.id)
        ? previous.lessonsCompleted
        : [...previous.lessonsCompleted, lesson.id],
    }))
    if (authUser) saveCloudLessonProgress(authUser.id, lesson.id, 'completed').catch(() => setToast('Lesson completed locally, but cloud sync failed'))
    setToast('Lesson marked complete')
  }

  function recordQuiz(quizAttempt) {
    const savedAttempt = { ...quizAttempt, id: crypto.randomUUID(), completedAt: new Date().toISOString() }
    setProgress((previous) => ({ ...previous, quizAttempts: [savedAttempt, ...previous.quizAttempts] }))
    if (authUser) saveCloudQuizAttempt(authUser.id, savedAttempt).catch(() => setToast('Quiz saved locally, but cloud sync failed'))
  }

  function changePage(nextPage) {
    setPage(nextPage)
    setMobileNavOpen(false)
  }

  const activeTitle = pageTitles[page] || 'Overview'

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Code2 size={20} strokeWidth={2.2} /></div>
          <span className="brand-name">loop<span>wise</span></span>
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileNavOpen(false)}><X size={18} /></button>
        </div>

        <button className="course-switcher" onClick={() => changePage('learn')} aria-label="Open JavaScript foundations learning path">
          <div className="course-language"><span className="language-dot" />JavaScript foundations</div>
          <ChevronDown size={15} />
        </button>

        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.section}>
              <p className="nav-section-label">{group.section}</p>
              {group.items.map(({ id, label, icon: Icon }) => (
                <button key={id} className={`nav-link ${page === id ? 'nav-link-active' : ''}`} onClick={() => changePage(id)}>
                  <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                  {id === 'tutor' && <span className="nav-new-dot" />}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="streak-mini"><div className="streak-icon"><Flame size={16} /></div><div><strong>{progress.attempts.length ? 'Keep it going' : 'Your first session'}</strong><span>{progress.attempts.length ? 'Progress is saved on this device' : 'Start a lesson to begin'}</span></div></div>
          <button className={`nav-link ${page === 'settings' ? 'nav-link-active' : ''}`} onClick={() => changePage('settings')}><Settings size={17} /><span>Profile & settings</span></button>
          {authUser && <button className="nav-link signout-link" onClick={() => supabase.auth.signOut().then(() => setToast('Signed out'))}><LockKeyhole size={16} /><span>Sign out</span></button>}
          <button className="profile-row" onClick={() => changePage('settings')}>
            <span className="avatar">{(progress.displayName || 'L').slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{progress.displayName || 'Learner'}</strong><small>{progress.skillLevel} learner</small></span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
            <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{activeTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            {page === 'tutor' && <label className="tutor-language-select"><span className="sr-only">Tutor language</span><select value={tutorLanguage} onChange={(event) => setTutorLanguage(event.target.value)}><option value="javascript">JavaScript</option><option value="python">Python</option><option value="html">HTML & CSS</option></select><ChevronDown size={13} /></label>}
            <span className={`storage-badge ${authUser ? 'storage-cloud' : ''}`}><span />{authUser ? 'Cloud sync active' : isCloudConfigured ? 'Sign in for cloud sync' : 'Saved on this device'}</span>
            <button className="icon-button theme-button" aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sparkles size={17} /> : <Moon size={17} />}</button>
            <button className="help-button" onClick={() => changePage('tutor')}><CircleHelp size={16} /><span>Help</span></button>
          </div>
        </header>

        {page === 'dashboard' && <Dashboard progress={progress} onOpenLesson={openLesson} onNavigate={changePage} />}
        {page === 'learn' && <LearningPath progress={progress} onOpenLesson={openLesson} />}
        {page === 'lesson' && <LessonWorkspace key={currentLesson.id} lesson={currentLesson} progress={progress} onCodeChange={setCurrentCode} onComplete={completeLesson} onRecordAttempt={recordAttempt} onRecordQuiz={recordQuiz} onBack={() => changePage('learn')} onPrevious={() => openLesson(lessons[Math.max(0, lessons.findIndex((lesson) => lesson.id === currentLesson.id) - 1)])} onNext={() => openLesson(lessons[(lessons.findIndex((lesson) => lesson.id === currentLesson.id) + 1) % lessons.length])} />}
        {page === 'playground' && <Playground onCodeChange={setCurrentCode} onRecordAttempt={recordAttempt} />}
        {page === 'practice' && <Practice progress={progress} onOpenLesson={openLesson} />}
        {page === 'tutor' && <TutorPage progress={progress} currentCode={currentCode} currentLesson={currentLesson} tutorLanguage={tutorLanguage} onMessagesChange={(messages) => setProgress((previous) => ({ ...previous, messages }))} />}
        {page === 'progress' && <ProgressPage progress={progress} />}
        {page === 'history' && <HistoryPage progress={progress} />}
        {page === 'settings' && <SettingsPage progress={progress} authUser={authUser} onSignOut={() => supabase?.auth.signOut()} onSave={(updates) => { setProgress((previous) => ({ ...previous, ...updates })); if (authUser) saveCloudProfile(authUser.id, updates).catch(() => setToast('Preferences saved locally, but cloud sync failed')); setToast('Profile preferences saved') }} />}
      </main>
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  )
}

function PageIntro({ eyebrow, title, description, action }) {
  return <div className="page-intro"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Dashboard({ progress, onOpenLesson, onNavigate }) {
  const completed = progress.lessonsCompleted.length
  const attempted = progress.attempts.length
  const passed = progress.attempts.filter((attempt) => attempt.passed).length
  const latestTopicAttempts = new Map()
  for (const attempt of progress.attempts) {
    if (attempt.topic && !latestTopicAttempts.has(attempt.topic)) latestTopicAttempts.set(attempt.topic, attempt)
  }
  const reviewTopic = [...latestTopicAttempts.values()].find((attempt) => !attempt.passed)?.topic
  const reviewLesson = lessons.find((lesson) => lesson.topic === reviewTopic)
  const nextLesson = reviewLesson || lessons.find((lesson) => !progress.lessonsCompleted.includes(lesson.id)) || lessons[0]
  const recentAttempts = progress.attempts.slice(0, 3)

  return <div className="page-content dashboard-page">
    <PageIntro eyebrow="YOUR LEARNING SPACE" title={`Good to see you, ${progress.displayName || 'Learner'}.`} description="A little practice today goes a long way." action={<Button variant="dark" onClick={() => onNavigate('playground')}><Code2 size={16} />Open playground</Button>} />
    <div className="dashboard-grid">
      <section className="welcome-panel">
        <div className="welcome-copy"><span className="welcome-kicker"><span className="welcome-dot" />YOUR LEARNING PATH</span><h2>Small steps.<br />Real understanding.</h2><p>Learn a concept, try it yourself, and get a nudge when you need one.</p><Button variant="white" onClick={() => onOpenLesson(nextLesson)}>Continue learning<ArrowRight size={16} /></Button></div>
        <div className="welcome-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><Code2 size={32} /></div><span className="orbit-chip orbit-chip-a">{ }</span><span className="orbit-chip orbit-chip-b">&lt;/&gt;</span><span className="orbit-chip orbit-chip-c">01</span></div>
        <div className="welcome-foot"><span>UP NEXT</span><strong>{nextLesson.title}</strong><span className="welcome-duration"><Clock3 size={13} />{nextLesson.minutes} min</span></div>
      </section>
      <section className="metric-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR MOMENTUM</span><h2>Learning snapshot</h2></div><button className="text-link" onClick={() => onNavigate('progress')}>View progress<ArrowUpRight size={14} /></button></div>
        <div className="metric-grid">
          <Metric label="Lessons completed" value={completed} icon={BookOpen} detail={`${progress.lessonsStarted?.length ?? 0} started`} />
          <Metric label="Exercises tried" value={attempted} icon={Code2} detail={attempted ? `${passed} passed so far` : 'Your attempts show here'} />
          <Metric label="Current level" value={progress.skillLevel} icon={Target} detail="Set in your preferences" compact />
          <Metric label="Latest quiz" value={progress.quizAttempts.length ? `${progress.quizAttempts[0].score}/${progress.quizAttempts[0].totalQuestions}` : '—'} icon={Award} detail={progress.quizAttempts.length ? 'Most recent knowledge check' : 'No checks completed'} compact />
        </div>
        <div className="snapshot-progress"><div className="snapshot-progress-label"><span>Course progress</span><strong>{lessons.length ? Math.round((completed / lessons.length) * 100) : 0}%</strong></div><div className="progress-track"><span style={{ width: `${Math.min(100, (completed / lessons.length) * 100)}%` }} /></div><span className="snapshot-footnote">{completed} of {lessons.length} starter lessons completed</span></div>
      </section>
      <section className="next-panel">
        <div className="panel-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recommended next</h2></div><span className="recommendation-icon"><ArrowDownRight size={17} /></span></div>
        <div className="recommendation-body"><div className="recommendation-number">0{lessons.indexOf(nextLesson) + 1}</div><div><span className="lesson-tag">{nextLesson.topic}</span><h3>{nextLesson.title}</h3><p>{nextLesson.description}</p></div></div>
        <div className="recommendation-footer"><span><Clock3 size={14} />{nextLesson.minutes} min <i /> {nextLesson.level}</span><Button onClick={() => onOpenLesson(nextLesson)}>Start lesson<ArrowRight size={15} /></Button></div>
      </section>
      <section className="recent-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR WORK</span><h2>Recent attempts</h2></div><button className="text-link" onClick={() => onNavigate('history')}>View history<ArrowUpRight size={14} /></button></div>
        {recentAttempts.length ? <div className="recent-list">{recentAttempts.map((attempt) => <div className="recent-row" key={attempt.id}><span className={`attempt-status ${attempt.passed ? 'attempt-passed' : 'attempt-review'}`}>{attempt.passed ? <Check size={14} /> : <RotateCcw size={14} />}</span><div className="recent-copy"><strong>{attempt.title}</strong><span>{attempt.topic || 'Practice'} · {new Date(attempt.createdAt).toLocaleDateString()}</span></div><span className={`result-label ${attempt.passed ? 'result-good' : 'result-retry'}`}>{attempt.passed ? 'Passed' : 'Review'}</span></div>)}</div> : <div className="empty-inline"><div className="empty-glyph"><Terminal size={18} /></div><div><strong>Your first attempt starts here</strong><span>Write a little code and your learning history will grow here.</span></div></div>}
      </section>
    </div>
  </div>
}

function Metric({ label, value, icon: Icon, detail, compact = false }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><Icon size={16} /></div><strong className={compact ? 'metric-compact-value' : ''}>{value}</strong><small>{detail}</small></div>
}

function LearningPath({ progress, onOpenLesson }) {
  const [language, setLanguage] = useState('All languages')
  const [level, setLevel] = useState('All levels')
  const filtered = lessons.filter((lesson) => (language === 'All languages' || lesson.language === language.toLowerCase()) && (level === 'All levels' || lesson.level === level))
  return <div className="page-content">
    <PageIntro eyebrow="THE CURRICULUM" title="Learning path" description="Build useful programming habits, one clear concept at a time." action={<div className="learning-count"><BookOpen size={15} />{progress.lessonsCompleted.length} / {lessons.length} complete</div>} />
    <div className="filter-row"><div className="filter-caption">STARTER COURSE <span>JavaScript fundamentals</span></div><div className="filter-controls"><label className="select-wrap"><span className="sr-only">Programming language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option>All languages</option><option value="javascript">JavaScript</option></select><ChevronDown size={14} /></label><label className="select-wrap"><span className="sr-only">Difficulty</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select><ChevronDown size={14} /></label></div></div>
    <section className="course-overview"><div className="course-symbol"><Braces size={22} /></div><div className="course-summary"><div><span className="course-label">FOUNDATIONS · {lessons.length} LESSONS</span><h2>JavaScript, from the ground up</h2><p>Learn to read, write, and reason about code through short explanations and hands-on practice.</p></div><div className="course-progress-wrap"><div className="course-progress-label"><span>Your progress</span><strong>{progress.lessonsCompleted.length}/{lessons.length}</strong></div><div className="progress-track"><span style={{ width: `${(progress.lessonsCompleted.length / lessons.length) * 100}%` }} /></div></div></div></section>
    <div className="lesson-list-heading"><h2>Course lessons</h2><span>{filtered.length} lessons</span></div>
    <div className="lesson-list">{filtered.map((lesson, index) => {
      const done = progress.lessonsCompleted.includes(lesson.id)
      const started = progress.lessonsStarted?.includes(lesson.id)
      return <button key={lesson.id} className="lesson-row" onClick={() => onOpenLesson(lesson)}><span className={`lesson-index ${done ? 'lesson-index-done' : ''}`}>{done ? <Check size={16} /> : String(index + 1).padStart(2, '0')}</span><span className="lesson-row-copy"><span className="lesson-row-meta"><span>{lesson.topic}</span><i />{lesson.level}</span><strong>{lesson.title}</strong><small>{lesson.description}</small></span><span className="lesson-row-time"><Clock3 size={14} />{lesson.minutes} min</span><span className={`lesson-row-status ${done ? 'status-complete' : ''}`}>{done ? 'Completed' : started ? 'In progress' : 'Start'}<ArrowRight size={15} /></span></button>
    })}</div>
    {!filtered.length && <div className="empty-state"><BookOpen size={22} /><strong>No lessons match these filters</strong><span>Try another level or language.</span></div>}
  </div>
}

function LessonWorkspace({ lesson, progress, onCodeChange, onComplete, onRecordAttempt, onRecordQuiz, onBack, onPrevious, onNext }) {
  const [showExample, setShowExample] = useState(false)
  const complete = progress.lessonsCompleted.includes(lesson.id)
  return <div className="page-content workspace-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15} />Back to learning path</button>
    <div className="workspace-heading"><div><div className="lesson-row-meta"><span>{lesson.topic}</span><i />{lesson.level}<i /><Clock3 size={13} />{lesson.minutes} min</div><h1>{lesson.title}</h1><p>{lesson.description}</p></div><span className={`lesson-state ${complete ? 'lesson-state-done' : ''}`}>{complete ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}{complete ? 'Completed' : 'In progress'}</span></div>
    <div className="workspace-grid"><section className="lesson-instructions"><div className="workspace-section-title"><span className="step-number">01</span><div><span className="eyebrow">THE IDEA</span><h2>What you will learn</h2></div></div><p className="lesson-explanation">{lesson.explanation}</p><div className="objective-box"><div className="objective-icon"><Target size={17} /></div><div><span>YOUR OBJECTIVE</span><strong>{lesson.objective}</strong></div></div><div className="instruction-divider" /><div className="workspace-section-title compact-title"><span className="step-number">02</span><div><span className="eyebrow">YOUR TURN</span><h2>Try it yourself</h2></div></div><p className="exercise-prompt">Update the starter code so it produces the expected result. Run it to check your output.</p><div className="expected-output"><span>EXPECTED OUTPUT</span><code>{lesson.expectedOutput.split('\n').map((line, index) => <span key={index}>{line}</span>)}</code></div><button className="example-toggle" onClick={() => setShowExample((value) => !value)}><Lightbulb size={15} />{showExample ? 'Hide example' : 'Show example'}<ChevronDown className={showExample ? 'rotate-icon' : ''} size={14} /></button>{showExample && <pre className="example-code">{lesson.example}</pre>}</section>
      <EditorWorkspace key={lesson.id} starterCode={lesson.starterCode} language={lesson.language} expectedOutput={lesson.expectedOutput} title={lesson.title} topic={lesson.topic} onCodeChange={onCodeChange} onRecordAttempt={onRecordAttempt} hint={lesson.hint} context={lesson} onComplete={() => onComplete(lesson)} onPrevious={onPrevious} onNext={onNext} />
    </div>
    <QuizCheck lesson={lesson} onRecordQuiz={onRecordQuiz} />
  </div>
}

function QuizCheck({ lesson, onRecordQuiz }) {
  const quiz = lessonQuizzes[lesson.id]
  const [selected, setSelected] = useState(null)
  const [result, setResult] = useState('')
  if (!quiz) return null
  function checkAnswer() {
    if (selected === null) return
    const correct = selected === quiz.answer
    setResult(correct ? 'Correct. You can explain this idea now.' : 'Not quite. Revisit the explanation and try another answer.')
    onRecordQuiz({ lessonId: lesson.id, score: correct ? 1 : 0, totalQuestions: 1 })
  }
  return <section className="quiz-panel"><div className="quiz-heading"><span className="quiz-icon"><ListChecks size={17} /></span><div><span className="eyebrow">QUICK KNOWLEDGE CHECK</span><h2>Pause and check your understanding</h2></div></div><p>{quiz.question}</p><div className="quiz-options">{quiz.choices.map((choice, index) => <label className={`quiz-option ${selected === index ? 'quiz-option-selected' : ''}`} key={choice}><input type="radio" name={`quiz-${lesson.id}`} checked={selected === index} onChange={() => { setSelected(index); setResult('') }} /><span>{choice}</span></label>)}</div><div className="quiz-footer"><span className={result.startsWith('Correct') ? 'quiz-result quiz-result-correct' : 'quiz-result'}>{result}</span><Button onClick={checkAnswer} disabled={selected === null}>Check answer<ArrowRight size={14} /></Button></div></section>
}

function Playground({ onCodeChange, onRecordAttempt }) {
  return <div className="page-content workspace-page"><PageIntro eyebrow="A SPACE TO EXPERIMENT" title="Playground" description="Try an idea, inspect what happens, and follow your curiosity." /><EditorWorkspace starterCode={'const greeting = "Hello, world!";\nconsole.log(greeting);'} language="javascript" title="Untitled program" topic="Playground" onCodeChange={onCodeChange} onRecordAttempt={onRecordAttempt} isPlayground /></div>
}

function EditorWorkspace({ starterCode, language, expectedOutput, title, topic, onCodeChange, onRecordAttempt, hint, context, onComplete, onPrevious, onNext, isPlayground = false }) {
  const [code, setCode] = useState(starterCode)
  const [selectedLanguage, setSelectedLanguage] = useState(language)
  const [runId, setRunId] = useState(0)
  const [output, setOutput] = useState('')
  const [runStatus, setRunStatus] = useState('idle')
  const [executionStatus, setExecutionStatus] = useState('idle')
  const [feedback, setFeedback] = useState('')
  const [activeOutputTab, setActiveOutputTab] = useState('output')
  const [busy, setBusy] = useState(false)

  useEffect(() => { onCodeChange?.(code) }, [code, onCodeChange])

  async function runCode() {
    setFeedback('')
    setActiveOutputTab('output')
    if (selectedLanguage === 'python') {
      setRunStatus('running')
      setExecutionStatus('running')
      if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_SERVERLESS !== 'true') {
        setOutput('Python needs the configured Judge0 server endpoint. Start with `npx vercel dev` to use serverless functions.')
        setRunStatus('error')
        setExecutionStatus('infrastructure_error')
        return
      }
      try {
        const authHeaders = await getAuthHeaders()
        const response = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ sourceCode: code }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Python execution is unavailable.')
        setOutput(result.error ? `${result.error}\n${result.output}`.trim() : result.output || '(No output)')
        setRunStatus(result.status === 'success' ? 'success' : 'error')
        setExecutionStatus(result.status)
      } catch (error) {
        setOutput(error instanceof Error ? error.message : 'Python execution is unavailable.')
        setRunStatus('error')
        setExecutionStatus('infrastructure_error')
      }
      return
    }
    setOutput('')
    setRunStatus('running')
    setExecutionStatus('running')
    setRunId((value) => value + 1)
  }

  function receiveRun(result) {
    setOutput([result.error, result.output].filter((value) => typeof value === 'string' && value.trim()).join('\n') || '(No output yet)')
    setRunStatus(result.error ? 'error' : 'success')
    setExecutionStatus(result.error ? result.executionStatus || 'runtime_error' : 'success')
  }

  function submitAnswer() {
    if (!expectedOutput) {
      setFeedback('Run your program first. Execution output and exercise correctness are tracked separately.')
      return
    }
    if (!output || runStatus === 'running') {
      setFeedback('Run your code first, then submit it for a check.')
      return
    }
    const passed = runStatus === 'success' && matchesExpectedOutput(output, expectedOutput)
    onRecordAttempt({ title, topic, passed, output, expectedOutput, language: selectedLanguage, code, executionStatus: passed ? 'accepted' : runStatus === 'error' ? executionStatus : 'wrong_answer' })
    setFeedback(passed ? 'That matches the expected output. Nice work!' : 'Not quite yet. Compare your output with the expected result, then make another attempt.')
    setActiveOutputTab('feedback')
    if (passed) onComplete?.()
  }

  async function getHint() {
    setBusy(true)
    setFeedback('Thinking through a hint...')
    const result = await askTutor({ question: 'Please give me a hint, not the full solution.', code, relatedLanguage: selectedLanguage, context: { ...context, title, topic, hint }, skillLevel: context?.skillLevel || 'Beginner' })
    setFeedback(`${result.mode === 'demo' ? 'Tutor demo · ' : ''}${result.reply}`)
    setActiveOutputTab('feedback')
    setBusy(false)
  }

  async function explainError() {
    if (runStatus !== 'error' || !output) {
      setFeedback('Run your code first so the tutor has an actual error message to explain.')
      setActiveOutputTab('feedback')
      return
    }
    setBusy(true)
    setFeedback('Reading the error and your code...')
    const result = await askTutor({ question: 'Explain what this error means and guide me toward a fix without rewriting my whole solution.', error: output, code, relatedLanguage: selectedLanguage, context: { ...context, title, topic }, skillLevel: context?.skillLevel || 'Beginner' })
    setFeedback(`${result.mode === 'demo' ? 'Tutor demo · ' : ''}${result.reply}`)
    setActiveOutputTab('feedback')
    setBusy(false)
  }

  function resetCode() {
    setCode(starterCode)
    onCodeChange?.(starterCode)
    setOutput('')
    setRunStatus('idle')
    setExecutionStatus('idle')
    setFeedback('')
  }

  return <section className={`editor-workspace ${isPlayground ? 'editor-workspace-wide' : ''}`}>
      <div className="editor-toolbar"><div className="editor-file"><span className="file-language-icon">{selectedLanguage === 'javascript' ? 'JS' : selectedLanguage === 'python' ? 'PY' : selectedLanguage.toUpperCase()}</span><span>{isPlayground ? `main.${selectedLanguage === 'javascript' ? 'js' : selectedLanguage === 'python' ? 'py' : selectedLanguage}` : `${title.toLowerCase().replaceAll(' ', '-')}.js`}</span><span className="editor-unsaved" /></div><div className="editor-controls">{isPlayground ? <label className="editor-language-select"><span className="sr-only">Playground language</span><select value={selectedLanguage} onChange={(event) => { const nextLanguage = event.target.value; setSelectedLanguage(nextLanguage); setCode(nextLanguage === 'python' ? 'print("Hello, world!")' : nextLanguage === 'html' ? '<h1>Hello, world!</h1>\n<p>Make something here.</p>' : nextLanguage === 'css' ? 'body {\n  font-family: sans-serif;\n  color: #2f785e;\n}' : 'const greeting = "Hello, world!";\nconsole.log(greeting);'); setOutput(''); setRunStatus('idle') }}><option value="javascript">JavaScript</option><option value="html">HTML preview</option><option value="css">CSS preview</option><option value="python">Python · Judge0</option></select><ChevronDown size={13} /></label> : <span className="editor-language">JavaScript</span>}<button className="editor-tool" onClick={resetCode} aria-label="Reset code" title="Reset code"><RotateCcw size={15} /></button><Button variant="run" onClick={runCode} disabled={runStatus === 'running'}><Play size={14} fill="currentColor" />Run</Button></div></div>
    <div className="monaco-wrap"><Editor height="340px" language={selectedLanguage} theme="vs-dark" value={code} onChange={(value) => { const nextCode = value ?? ''; setCode(nextCode); onCodeChange?.(nextCode) }} options={{ minimap: { enabled: false }, fontSize: 13, lineHeight: 22, padding: { top: 16, bottom: 12 }, scrollBeyondLastLine: false, wordWrap: 'on', automaticLayout: true, fontFamily: '"IBM Plex Mono", Consolas, monospace', lineNumbersMinChars: 3, renderLineHighlight: 'gutter', scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 }, suggestOnTriggerCharacters: true }} /></div>
    <CodeRunner key={runId} code={code} language={selectedLanguage} runId={runId} onComplete={receiveRun} />
    <div className="output-panel"><div className="output-header"><div className="output-tabs"><button className={activeOutputTab === 'output' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('output')}><Terminal size={14} />Output</button><button className={activeOutputTab === 'feedback' ? 'output-tab-active' : ''} onClick={() => setActiveOutputTab('feedback')}><Sparkles size={14} />Feedback</button></div><span className={`execution-status execution-${runStatus}`}>{runStatus === 'running' ? 'Running' : runStatus === 'success' ? 'Execution succeeded' : runStatus === 'error' ? executionStatus === 'compile_error' ? 'Compile error' : executionStatus === 'runtime_error' ? 'Runtime error' : executionStatus === 'timeout' || executionStatus === 'time_limit' ? 'Time limit' : executionStatus === 'infrastructure_error' ? 'Service unavailable' : 'Execution failed' : 'Ready'}</span></div>
      {activeOutputTab === 'output' ? <pre className={`output-content ${runStatus === 'error' ? 'output-error' : ''}`}>{output || 'Run your code to see what happens.'}</pre> : <div className={`feedback-content ${feedback.includes('matches') ? 'feedback-success' : ''}`}>{feedback || 'Submit your answer for a check, or ask for a hint when you need a nudge.'}</div>}
    </div>
    <div className="editor-footer"><div className="editor-footer-left"><button className="editor-action" onClick={getHint} disabled={busy}><Lightbulb size={15} />Get a hint</button><button className="editor-action" onClick={explainError} disabled={busy}><CircleHelp size={15} />Explain my error</button>{!isPlayground && <button className="editor-action" onClick={submitAnswer}><CheckCircle2 size={15} />Submit answer</button>}</div><div className="editor-footer-right">{!isPlayground && <span className="safe-runtime"><ShieldCheck size={14} />Runs in an isolated browser frame</span>}{onPrevious && <Button onClick={onPrevious} disabled={lessons.indexOf(context) <= 0}><ArrowLeft size={14} />Previous</Button>}{onNext && <Button onClick={onNext}>Next lesson<ArrowRight size={14} /></Button>}</div></div>
  </section>
}

function CodeRunner({ code, language, runId, onComplete }) {
  const iframeRef = useRef(null)
  const callbackRef = useRef(onComplete)
  useEffect(() => { callbackRef.current = onComplete }, [onComplete])
  useLayoutEffect(() => {
    if (!runId || language !== 'javascript') return undefined
    let finished = false
    const timeout = window.setTimeout(() => {
      if (finished) return
      finished = true
      iframeRef.current?.contentWindow?.stop()
      callbackRef.current({ runId, error: 'JavaScript stopped after 3.5 seconds. Check whether a loop condition can eventually become false.', executionStatus: 'time_limit' })
    }, 3500)
    function handleMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.source !== 'loopwise-sandbox' || event.data?.runId !== runId) return
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      callbackRef.current(event.data)
    }
    window.addEventListener('message', handleMessage)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)
    }
  }, [runId, language])

  if (!runId || language === 'python') return null
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:"
  let documentContent
  if (language === 'html') {
    documentContent = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;padding:16px;color:#17221e}</style>${code}`
  } else if (language === 'css') {
    const cssPolicy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
    documentContent = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${cssPolicy}"><style>${code}</style><body><h2>Live style preview</h2><p>Change your CSS to update this preview.</p><button>Try a button</button></body>`
  } else {
    const encoded = btoa(unescape(encodeURIComponent(code)))
    const encodedWorker = btoa(unescape(encodeURIComponent(sandboxWorkerSource)))
    documentContent = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><body><script>const runId=${runId};const source=decodeURIComponent(escape(atob('${encoded}')));const workerSource=decodeURIComponent(escape(atob('${encodedWorker}')));const workerUrl=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));const worker=new Worker(workerUrl);let finished=false;const finish=(result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(workerUrl);document.body.textContent=result.output||'(No output yet)';parent.postMessage({source:'loopwise-sandbox',runId,...result},'*')};const timer=setTimeout(()=>finish({error:'JavaScript stopped after 3 seconds. Check whether a loop condition can eventually become false.',executionStatus:'time_limit'}),3000);worker.onmessage=(event)=>finish(event.data);worker.onerror=(event)=>finish({error:event.message||'JavaScript worker failed.',executionStatus:'runtime_error'});worker.postMessage({source})</script></body>`
  }
  if (language === 'html' || language === 'css') return <iframe ref={iframeRef} title="Sandboxed HTML and CSS preview" className="preview-frame" sandbox="" srcDoc={documentContent} onLoad={() => callbackRef.current({ runId, output: 'Preview updated' })} />
  return <iframe ref={iframeRef} title="Sandboxed code output" className="sandbox-frame" sandbox="allow-scripts" srcDoc={documentContent} />
}

function Practice({ progress, onOpenLesson }) {
  const attempted = new Set(progress.attempts.flatMap((attempt) => [attempt.title, lessons.find((lesson) => lesson.topic === attempt.topic)?.title]))
  return <div className="page-content"><PageIntro eyebrow="RETRIEVE, APPLY, IMPROVE" title="Practice" description="Short exercises help new ideas stick. Try, check, and try again." action={<span className="learning-count"><Target size={15} />{practiceExercises.length} exercises</span>} /><div className="practice-summary"><div className="practice-summary-icon"><Award size={20} /></div><div><strong>Practice at your own pace</strong><span>These starter exercises use the same concepts as your lessons.</span></div><span className="practice-summary-count">{progress.attempts.filter((attempt) => attempt.passed).length} passed</span></div><div className="exercise-grid">{practiceExercises.map((exercise, index) => { const lesson = lessons.find((item) => item.id === exercise.lessonId); return <article className="exercise-card" key={exercise.id}><div className="exercise-card-top"><span className="exercise-number">0{index + 1}</span><span className="difficulty-tag">{exercise.difficulty}</span></div><span className="lesson-tag">{exercise.topic}</span><h2>{exercise.title}</h2><p>{exercise.prompt}</p><div className="exercise-card-footer"><span>{attempted.has(lesson.title) ? <><CheckCircle2 size={14} />Attempted</> : <><Clock3 size={14} />5 min</>}</span><Button onClick={() => onOpenLesson(lesson)}>Open exercise<ArrowRight size={14} /></Button></div></article> })}</div></div>
}

function TutorPage({ progress, currentCode, currentLesson, tutorLanguage, onMessagesChange }) {
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [attachedCode, setAttachedCode] = useState(false)
  const messages = progress.messages || []
  const bottomRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function sendMessage(text = draft) {
    if (!text.trim() || pending) return
    const userMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim(), createdAt: new Date().toISOString() }
    const nextMessages = [...messages, userMessage]
    onMessagesChange(nextMessages)
    setDraft('')
    setPending(true)
    const recentMistakes = progress.attempts.filter((attempt) => !attempt.passed).slice(0, 3).map((attempt) => `${attempt.topic}: ${attempt.title}`)
    const result = await askTutor({ question: text, code: attachedCode ? currentCode : '', relatedLanguage: tutorLanguage, skillLevel: progress.skillLevel, context: { title: currentLesson.title, topic: currentLesson.topic, objective: currentLesson.objective, recentMistakes }, history: nextMessages.slice(-6) })
    onMessagesChange([...nextMessages, { id: crypto.randomUUID(), role: 'assistant', content: result.reply, mode: result.mode, createdAt: new Date().toISOString() }])
    setAttachedCode(false)
    setPending(false)
  }

  return <div className="page-content tutor-page"><PageIntro eyebrow="A PATIENT PAIR PROGRAMMER" title="AI tutor" description="Ask about a concept, share an error, or request a small hint." action={<span className="tutor-mode-badge"><span />{messages.some((message) => message.mode === 'ai') ? 'AI connected' : 'Demo mode'}</span>} /><div className="tutor-layout"><section className="tutor-chat"><div className="chat-header"><div className="tutor-avatar"><Sparkles size={17} /></div><div><strong>Loopwise tutor</strong><span><span className="online-dot" />{messages.some((message) => message.mode === 'ai') ? 'Ready to help' : 'Learning mode · no API key needed'}</span></div><button className="icon-button" title="New conversation" aria-label="New conversation" onClick={() => onMessagesChange([])}><Plus size={17} /></button></div><div className="chat-messages">{!messages.length && <div className="chat-welcome"><div className="chat-welcome-icon"><MessageCircle size={21} /></div><span className="eyebrow">LET'S FIGURE IT OUT</span><h2>What are you working on?</h2><p>I can explain an error, give you a hint, or help unpack a programming idea. I’ll guide you toward the answer rather than jump straight to it.</p><div className="suggestion-list"><button onClick={() => sendMessage('I got an error. Can you help me understand it?')}><span><CircleHelp size={15} /></span>Explain an error<ArrowRight size={14} /></button><button onClick={() => sendMessage('Give me a hint for the lesson I am working on.')}><span><Lightbulb size={15} /></span>Give me a hint<ArrowRight size={14} /></button><button onClick={() => sendMessage('Can you explain how loops work?')}><span><Code2 size={15} /></span>Explain a concept<ArrowRight size={14} /></button></div></div>}{messages.map((message) => <div className={`chat-message message-${message.role}`} key={message.id}><span className="message-avatar">{message.role === 'assistant' ? <Sparkles size={14} /> : (progress.displayName || 'L').slice(0, 1).toUpperCase()}</span><div><div className="message-meta"><strong>{message.role === 'assistant' ? 'Loopwise tutor' : progress.displayName}</strong>{message.mode === 'demo' && <span>DEMO RESPONSE</span>}</div><p>{message.content}</p></div></div>)}{pending && <div className="chat-message message-assistant"><span className="message-avatar"><Sparkles size={14} /></span><div><div className="message-meta"><strong>Loopwise tutor</strong></div><div className="typing-indicator"><i /><i /><i /></div></div></div>}<div ref={bottomRef} /></div><form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a programming question..." rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} /><div className="composer-tools"><button type="button" className={`editor-action ${attachedCode ? 'attach-active' : ''}`} onClick={() => setAttachedCode((value) => !value)}><Code2 size={15} />{attachedCode ? 'Code attached' : 'Attach code'}</button><span>Enter to send · Shift + Enter for a new line</span><Button variant="dark" type="submit" disabled={!draft.trim() || pending}><Send size={14} />Send</Button></div></form></section><aside className="tutor-context"><span className="eyebrow">LEARNING CONTEXT</span><h2>Made for your pace</h2><p>Your tutor uses your question and skill level to keep its guidance approachable.</p><div className="context-row"><span className="context-icon"><GraduationCap size={16} /></span><div><small>Current level</small><strong>{progress.skillLevel}</strong></div></div><div className="context-row"><span className="context-icon"><BookOpen size={16} /></span><div><small>Lessons completed</small><strong>{progress.lessonsCompleted.length}</strong></div></div><div className="context-row"><span className="context-icon"><Code2 size={16} /></span><div><small>Practice attempts</small><strong>{progress.attempts.length}</strong></div></div><div className="privacy-note"><LockKeyhole size={15} /><span>Messages are stored in this browser in demo mode. Configure the secure tutor endpoint for AI responses.</span></div></aside></div></div>
}

function ProgressPage({ progress }) {
  const total = lessons.length
  const passed = progress.attempts.filter((attempt) => attempt.passed).length
  const corrected = countCorrectedAttempts(progress.attempts)
  const topics = [...new Set(lessons.map((lesson) => lesson.topic))]
  const attemptsByTopic = topics.map((topic) => ({ topic, count: progress.attempts.filter((attempt) => attempt.topic === topic).length, passed: progress.attempts.filter((attempt) => attempt.topic === topic && attempt.passed).length }))
  return <div className="page-content"><PageIntro eyebrow="NOTICE YOUR PROGRESS" title="My progress" description="A clear picture of what you have practiced and what comes next." action={<span className="learning-count"><Activity size={15} />Updated as you learn</span>} /><div className="progress-top-grid"><section className="progress-score-panel"><div className="progress-score-heading"><div><span className="eyebrow">LEARNING PATH</span><h2>JavaScript foundations</h2></div><div className="progress-ring" style={{ '--progress': `${(progress.lessonsCompleted.length / total) * 100}%` }}><strong>{Math.round((progress.lessonsCompleted.length / total) * 100)}<small>%</small></strong></div></div><div className="progress-track"><span style={{ width: `${(progress.lessonsCompleted.length / total) * 100}%` }} /></div><div className="score-details"><span><CheckCircle2 size={15} />{progress.lessonsCompleted.length} lessons completed</span><span><BookOpen size={15} />{progress.lessonsStarted?.length ?? 0} lessons started</span><span><Code2 size={15} />{progress.attempts.length} exercises attempted</span><span><Award size={15} />{passed} passed</span><span><CheckCircle2 size={15} />{corrected} errors corrected</span><span><ListChecks size={15} />{progress.quizAttempts.length} knowledge checks</span></div></section><section className="progress-focus-panel"><span className="eyebrow">SKILL PROFILE</span><div className="skill-profile"><div className="skill-icon"><Target size={19} /></div><div><strong>{progress.skillLevel}</strong><span>Current learning level</span></div></div><p>Practice evidence is collected as you work. No mastery score is inferred from lesson completion alone.</p></section></div><section className="topic-progress-section"><div className="panel-heading"><div><span className="eyebrow">PRACTICE AREAS</span><h2>Topics explored</h2></div><span className="topics-caption">{topics.length} course topics</span></div><div className="topic-table"><div className="topic-table-header"><span>TOPIC</span><span>ATTEMPTS</span><span>PASSED</span><span>ACTIVITY</span></div>{attemptsByTopic.map((item) => <div className="topic-table-row" key={item.topic}><span>{item.topic}</span><span>{item.count}</span><span>{item.passed}</span><span className="topic-mini-track"><i style={{ width: item.count ? `${(item.passed / item.count) * 100}%` : '0%' }} /></span></div>)}</div></section><div className="progress-note"><Lightbulb size={17} /><p><strong>A useful next step:</strong> revisit a topic where a recent attempt needed another try. Your mistakes are part of the learning record, not a score.</p></div></div>
}

function HistoryPage({ progress }) {
  const attempts = [...progress.attempts, ...(progress.quizAttempts ?? []).map((quiz) => ({
    id: quiz.id,
    title: `${lessons.find((lesson) => lesson.id === quiz.lessonId)?.title || 'Lesson'} knowledge check`,
    topic: 'Quiz',
    language: `${quiz.score}/${quiz.totalQuestions} correct`,
    passed: quiz.score === quiz.totalQuestions,
    createdAt: quiz.completedAt,
  }))].sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))
  return <div className="page-content"><PageIntro eyebrow="EVERY TRY COUNTS" title="Learning history" description="Review your past exercise attempts and see how your solutions changed." action={<span className="learning-count"><History size={15} />{attempts.length} recorded</span>} />{attempts.length ? <section className="history-table-wrap"><div className="history-table"><div className="history-header"><span>EXERCISE</span><span>TOPIC</span><span>RESULT</span><span>DATE</span></div>{attempts.map((attempt) => <div className="history-row" key={attempt.id}><div className="history-exercise"><span className={`attempt-status ${attempt.passed ? 'attempt-passed' : 'attempt-review'}`}>{attempt.passed ? <Check size={14} /> : <RotateCcw size={14} />}</span><span><strong>{attempt.title}</strong><small>{attempt.language}</small></span></div><span>{attempt.topic || 'Playground'}</span><span className={`history-result ${attempt.passed ? 'result-good' : 'result-retry'}`}>{attempt.passed ? 'Passed' : 'Needs another try'}</span><span>{new Date(attempt.createdAt).toLocaleString()}</span></div>)}</div></section> : <div className="history-empty"><div className="empty-glyph"><History size={20} /></div><h2>Your learning history starts with your first attempt</h2><p>When you submit an exercise, its result and date will appear here. Earlier attempts stay visible so you can review your progress.</p><span><ShieldCheck size={15} />Saved only in this browser</span></div>}</div>
}

function AuthPanel({ authUser, onSignOut }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function authenticate(mode) {
    if (!email.trim() || password.length < 8) {
      setMessage('Enter a valid email address and a password with at least 8 characters.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) setMessage(result.error.message)
      else setMessage(mode === 'signup' && !result.data.session ? 'Check your email to confirm your new account.' : 'You are signed in.')
    } catch {
      setMessage('Could not reach Supabase. Check your connection and project settings.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="auth-panel"><div className="settings-section-heading"><span className="settings-section-icon"><LockKeyhole size={16} /></span><div><h2>Account & cloud sync</h2><p>{authUser ? 'Your learning records are linked to your account.' : 'Sign in to sync progress securely with Supabase.'}</p></div></div>{!isCloudConfigured ? <div className="auth-unavailable">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart the app to enable authentication.</div> : authUser ? <div className="auth-signed-in"><div><span className="online-dot" /><strong>{authUser.email}</strong></div><Button onClick={onSignOut}><LockKeyhole size={14} />Sign out</Button></div> : <form onSubmit={(event) => { event.preventDefault(); authenticate('signin') }}><label className="field-label">Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="field-label">Password<input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="auth-actions"><Button variant="dark" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Sign in'}</Button><button type="button" className="auth-signup" disabled={busy} onClick={() => authenticate('signup')}>Create account</button></div>{message && <p className="auth-message" role="status">{message}</p>}</form>}</section>
}

function SettingsPage({ progress, authUser, onSignOut, onSave }) {
  const [name, setName] = useState(progress.displayName)
  const [level, setLevel] = useState(progress.skillLevel)
  const [language, setLanguage] = useState(progress.preferredLanguage)
  return <div className="page-content"><PageIntro eyebrow="MAKE IT YOURS" title="Profile & settings" description="Choose how you want to learn. Your preferences are saved on this device." /><div className="settings-layout"><div className="settings-stack"><section className="settings-form"><div className="settings-section-heading"><span className="settings-section-icon"><Settings size={17} /></span><div><h2>Learning preferences</h2><p>These details help tailor examples and explanations.</p></div></div><label className="field-label">Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} /></label><label className="field-label">Current skill level<select value={level} onChange={(event) => setLevel(event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label className="field-label">Preferred language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option>JavaScript</option><option>Python</option><option>HTML & CSS</option></select></label><Button variant="dark" onClick={() => onSave({ displayName: name.trim() || 'Learner', skillLevel: level, preferredLanguage: language })}><Check size={15} />Save preferences</Button></section><AuthPanel authUser={authUser} onSignOut={onSignOut} /></div><aside className="settings-connection"><span className="eyebrow">DATA & PRIVACY</span><h2>{authUser ? 'Your cloud account is active' : isCloudConfigured ? 'Supabase is configured' : 'Local learning mode'}</h2><p>{authUser ? 'Your progress is loading from your private account and new activity syncs as you learn.' : isCloudConfigured ? 'Sign in to sync your progress. Apply the included migration before using cloud records.' : 'Your lessons, attempts, and tutor messages are stored in this browser. Add Supabase keys and apply the database migration to enable cloud services.'}</p><div className="connection-status"><span className={authUser ? 'connected-dot' : ''} />{authUser ? 'Signed in and syncing' : isCloudConfigured ? 'Sign in for private cloud sync' : 'No cloud credentials detected'}</div><div className="privacy-note"><LockKeyhole size={15} /><span>Never put a Supabase service-role key or AI provider key in browser environment variables.</span></div></aside></div></div>
}

export default App