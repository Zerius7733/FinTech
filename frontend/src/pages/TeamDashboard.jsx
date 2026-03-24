import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { API_BASE } from '../utils/api.js'
import { clearAdminKey, getAdminHeaders, hasAdminAccess } from '../utils/adminAccess.js'

const POLL_INTERVAL_MS = 5000

async function fetchWithTimeout(input, init = {}, timeoutMs = 6000) {
  const controller = new AbortController()
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timerId)
  }
}

function formatTimestamp(value) {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function statusTone(status) {
  if (status === 'in_progress' || status === 'working') return { color: 'var(--teal)', bg: 'rgba(42,184,163,0.12)', border: 'rgba(42,184,163,0.18)' }
  if (status === 'blocked') return { color: 'var(--red)', bg: 'rgba(226,85,85,0.10)', border: 'rgba(226,85,85,0.16)' }
  if (status === 'completed') return { color: 'rgba(15,23,42,0.58)', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.18)' }
  return { color: 'var(--text-dim)', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.18)' }
}

function HumanStatusPill({ label, tone }) {
  return (
    <span style={{ ...styles.pill, color: tone.color, background: tone.bg, borderColor: tone.border }}>
      {label}
    </span>
  )
}

function AgentCard({ agent, currentTask }) {
  const isWorking = Boolean(currentTask)
  const tone = statusTone(isWorking ? 'working' : agent.status)

  return (
    <article style={{ ...styles.agentCard, ...(isWorking ? styles.agentCardWorking : null) }}>
      <div style={styles.agentHeader}>
        <div>
          <div style={styles.agentName}>{agent.name}</div>
          <div style={styles.agentRole}>{agent.role}</div>
        </div>
        <HumanStatusPill label={isWorking ? 'working now' : (agent.status || 'idle')} tone={tone} />
      </div>

      <div style={styles.agentLabel}>Current focus</div>
      <div style={styles.agentCurrentTask}>{currentTask?.title || agent.current_task || 'Awaiting the next assignment.'}</div>
      <div style={styles.agentCurrentCopy}>
        {currentTask?.description || 'This agent is not holding an active queued task right now.'}
      </div>

      <div style={styles.agentMetaRow}>
        <div>
          <div style={styles.metaLabel}>Area</div>
          <div style={styles.metaValue}>{currentTask?.area || 'general'}</div>
        </div>
        <div>
          <div style={styles.metaLabel}>Ownership</div>
          <div style={styles.metaValue}>{(agent.ownership || []).join(' · ') || '—'}</div>
        </div>
      </div>
    </article>
  )
}

function TaskCard({ task, ownerLabel, actionsDisabled, onComplete, variant = 'default' }) {
  const tone = statusTone(task.status)
  const compact = variant === 'compact'

  return (
    <article style={{ ...styles.taskCard, ...(compact ? styles.taskCardCompact : null) }}>
      <div style={styles.taskHeader}>
        <div>
          <div style={styles.taskTitle}>{task.title}</div>
          <div style={styles.taskMeta}>{ownerLabel} · {task.area}</div>
        </div>
        <HumanStatusPill label={task.status.replace('_', ' ')} tone={tone} />
      </div>

      <div style={styles.taskDescription}>{task.description || 'No extra description recorded.'}</div>

      <div style={styles.taskFacts}>
        <div>
          <div style={styles.metaLabel}>Created</div>
          <div style={styles.metaValue}>{formatTimestamp(task.created_at)}</div>
        </div>
        <div>
          <div style={styles.metaLabel}>{task.status === 'completed' ? 'Completed' : 'Started'}</div>
          <div style={styles.metaValue}>{formatTimestamp(task.completed_at || task.started_at)}</div>
        </div>
      </div>

      {task.outcome ? <div style={styles.taskOutcome}>{task.outcome}</div> : null}

      {task.status === 'in_progress' ? (
        <button
          type="button"
          style={{ ...styles.primaryButton, ...styles.smallButton, opacity: actionsDisabled ? 0.7 : 1 }}
          onClick={() => onComplete(task)}
          disabled={actionsDisabled}
        >
          Mark complete
        </button>
      ) : null}
    </article>
  )
}

function EmptyState({ title, copy }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyTitle}>{title}</div>
      <div style={styles.emptyCopy}>{copy}</div>
    </div>
  )
}

export default function TeamDashboard() {
  const navigate = useNavigate()
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [objectiveDraft, setObjectiveDraft] = useState('')
  const [taskDraft, setTaskDraft] = useState({
    title: '',
    description: '',
    owner_id: 'manager',
    area: 'ops',
  })

  useEffect(() => {
    let active = true
    let timerId

    async function load() {
      try {
        const response = await fetchWithTimeout(`${API_BASE}/team/state`, {
          headers: getAdminHeaders(),
        }, 6000)

        if (response.status === 401) {
          clearAdminKey()
          if (active) setError('Admin access expired. Re-enter the admin key.')
          return
        }

        if (!response.ok) throw new Error(`dashboard load failed (${response.status})`)
        const payload = await response.json()
        if (!active) return
        setTeam(payload.team)
        setObjectiveDraft(current => current || payload.team.objective || '')
        setError('')
      } catch (err) {
        if (!active) return
        if (err?.name === 'AbortError') {
          setError('Admin console timed out while loading. Check that the backend is running and responsive.')
        } else {
          setError(err.message || 'Unable to load admin console')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    timerId = window.setInterval(load, POLL_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(timerId)
    }
  }, [])

  async function sendControl(path, body) {
    setSubmitting(true)
    try {
      const response = await fetchWithTimeout(`${API_BASE}${path}`, {
        method: 'POST',
        headers: getAdminHeaders({ 'Content-Type': 'application/json' }),
        body: body ? JSON.stringify(body) : undefined,
      }, 6000)

      if (response.status === 401) {
        clearAdminKey()
        throw new Error('Admin access expired. Re-enter the admin key.')
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.detail || `request failed (${response.status})`)
      }
      const payload = await response.json()
      setTeam(payload.team)
      setError('')
      return payload.team
    } catch (err) {
      if (err?.name === 'AbortError') {
        setError('Admin action timed out. Check that the backend is running and responsive.')
      } else {
        setError(err.message || 'Unable to send control request')
      }
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function handleObjectiveSubmit(event) {
    event.preventDefault()
    await sendControl('/team/objective', { objective: objectiveDraft })
  }

  async function handleTaskSubmit(event) {
    event.preventDefault()
    const nextTeam = await sendControl('/team/tasks', taskDraft)
    if (!nextTeam) return
    setTaskDraft(prev => ({ ...prev, title: '', description: '' }))
  }

  async function handleCompleteTask(task) {
    await sendControl(`/team/tasks/${task.id}/complete`, {
      outcome: `Completed from admin console on ${formatTimestamp(new Date().toISOString())}.`,
    })
  }

  async function handleStartNext() {
    await sendControl('/team/tasks/start-next')
  }

  function handleExitAdmin() {
    clearAdminKey()
    navigate('/admin', { replace: true })
  }

  if (!hasAdminAccess()) {
    return <Navigate to="/admin" replace />
  }

  const tasks = team?.tasks || []
  const runningTasks = tasks.filter(task => task.status === 'in_progress')
  const queuedTasks = tasks.filter(task => task.status === 'queued')
  const completedTasks = tasks.filter(task => task.status === 'completed')
  const agentById = Object.fromEntries((team?.agents || []).map(agent => [agent.id, agent]))
  const ownerOptions = (team?.agents || []).map(agent => ({
    value: agent.id,
    label: `${agent.name} · ${agent.role}`,
  }))
  const canStartNext = !team?.stop?.requested && runningTasks.length === 0 && queuedTasks.length > 0

  const agentCards = useMemo(() => {
    return (team?.agents || []).map(agent => {
      const currentTask = runningTasks.find(task => task.owner_id === agent.id) || null
      return { agent, currentTask }
    })
  }, [team?.agents, runningTasks])

  return (
    <div style={styles.page}>
      <Navbar />

      <main style={styles.shell}>
        <section style={styles.topBand}>
          <div style={styles.introCard}>
            <div style={styles.introHeader}>
              <div style={styles.eyebrow}>Admin console</div>
              <button type="button" onClick={handleExitAdmin} style={styles.exitAdminButton}>
                Exit admin
              </button>
            </div>
            <h1 style={styles.title}>Run the branch from one clear control room.</h1>
            <p style={styles.copy}>
              This page is for operating the software team: see who is active, what each person is doing now, what work is queued next, and what already shipped.
            </p>
            <div style={styles.purposeList}>
              <div style={styles.purposeItem}><strong>Active team</strong> shows who is working and what they own.</div>
              <div style={styles.purposeItem}><strong>Running</strong> shows the tasks in motion right now.</div>
              <div style={styles.purposeItem}><strong>Queued</strong> shows what is ready to start next.</div>
              <div style={styles.purposeItem}><strong>Completed</strong> keeps a lightweight delivery log at the bottom.</div>
            </div>
          </div>

          <div style={styles.statusCard}>
            <div style={styles.statusHeader}>
              <div>
                <div style={styles.eyebrow}>System state</div>
                <div style={styles.statusValue}>{team?.mode || 'Loading'}</div>
              </div>
              <HumanStatusPill label={team?.stop?.requested ? 'stop armed' : 'live'} tone={statusTone(team?.stop?.requested ? 'blocked' : 'in_progress')} />
            </div>

            <div style={styles.statusMessage}>
              {team?.stop?.message || 'Loading team state...'}
            </div>

            <div style={styles.controlsRow}>
              <button
                type="button"
                style={{ ...styles.secondaryButton, opacity: submitting ? 0.7 : 1 }}
                onClick={() => sendControl('/team/stop', { reason: 'Requested from admin console' })}
                disabled={submitting || team?.stop?.requested}
              >
                Graceful stop
              </button>
              <button
                type="button"
                style={{ ...styles.secondaryButton, opacity: submitting ? 0.7 : 1 }}
                onClick={() => sendControl('/team/resume')}
                disabled={submitting || !team?.stop?.requested}
              >
                Resume
              </button>
              <button
                type="button"
                style={{ ...styles.primaryButton, opacity: submitting ? 0.7 : 1 }}
                onClick={handleStartNext}
                disabled={submitting || !canStartNext}
              >
                Start next task
              </button>
            </div>

            <div style={styles.statusMetaGrid}>
              <div>
                <div style={styles.metaLabel}>Objective</div>
                <div style={styles.metaValue}>{team?.objective || 'No objective set yet.'}</div>
              </div>
              <div>
                <div style={styles.metaLabel}>Last event</div>
                <div style={styles.metaValue}>{team?.last_event?.message || 'No recent event.'}</div>
              </div>
              <div>
                <div style={styles.metaLabel}>Updated</div>
                <div style={styles.metaValue}>{formatTimestamp(team?.updated_at)}</div>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <section style={styles.errorBanner}>
            <div style={styles.errorTitle}>Admin console issue</div>
            <div style={styles.errorCopy}>{error}</div>
          </section>
        ) : null}

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionEyebrow}>Team</div>
              <h2 style={styles.sectionTitle}>Who is active right now</h2>
            </div>
            <div style={styles.sectionHint}>Each card shows role, current focus, and owned surface.</div>
          </div>

          <div style={styles.agentGrid}>
            {agentCards.map(({ agent, currentTask }) => (
              <AgentCard key={agent.id} agent={agent} currentTask={currentTask} />
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionEyebrow}>Running</div>
              <h2 style={styles.sectionTitle}>Jobs running now</h2>
            </div>
            <div style={styles.sectionHint}>This is the live work surface.</div>
          </div>

          {loading && !team ? (
            <EmptyState title="Loading running work" copy="Fetching the live branch state." />
          ) : null}
          {!loading && runningTasks.length === 0 ? (
            <EmptyState title="Nothing is running" copy="Use Start next task when you want the next queued task to begin." />
          ) : null}
          <div style={styles.taskStack}>
            {runningTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                ownerLabel={agentById[task.owner_id]?.name || task.owner_id}
                actionsDisabled={submitting}
                onComplete={handleCompleteTask}
              />
            ))}
          </div>
        </section>

        <section style={styles.managementGrid}>
          <section style={styles.sectionCard}>
            <div style={styles.sectionEyebrow}>Manage</div>
            <h2 style={styles.sectionTitle}>Current objective</h2>
            <p style={styles.sectionHelp}>This should describe what the team is optimizing for right now.</p>
            <form style={styles.formStack} onSubmit={handleObjectiveSubmit}>
              <textarea
                value={objectiveDraft}
                onChange={event => setObjectiveDraft(event.target.value)}
                style={styles.textarea}
                rows={5}
                placeholder="Describe what the team should optimize for next."
              />
              <button type="submit" style={{ ...styles.primaryButton, width: '100%' }} disabled={submitting}>
                Update objective
              </button>
            </form>
          </section>

          <section style={styles.sectionCard}>
            <div style={styles.sectionEyebrow}>Manage</div>
            <h2 style={styles.sectionTitle}>Add a task</h2>
            <p style={styles.sectionHelp}>Queue the next piece of work with a clear owner and area.</p>
            <form style={styles.formStack} onSubmit={handleTaskSubmit}>
              <input
                value={taskDraft.title}
                onChange={event => setTaskDraft(prev => ({ ...prev, title: event.target.value }))}
                style={styles.input}
                placeholder="Task title"
              />
              <textarea
                value={taskDraft.description}
                onChange={event => setTaskDraft(prev => ({ ...prev, description: event.target.value }))}
                style={styles.textarea}
                rows={4}
                placeholder="What should be built or verified?"
              />
              <div style={styles.formRow}>
                <select
                  value={taskDraft.owner_id}
                  onChange={event => setTaskDraft(prev => ({ ...prev, owner_id: event.target.value }))}
                  style={styles.input}
                >
                  {ownerOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={taskDraft.area}
                  onChange={event => setTaskDraft(prev => ({ ...prev, area: event.target.value }))}
                  style={styles.input}
                >
                  {['frontend', 'backend', 'qa', 'research', 'ops', 'extension'].map(area => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>
              <button type="submit" style={{ ...styles.primaryButton, width: '100%' }} disabled={submitting || !taskDraft.title.trim()}>
                Queue task
              </button>
            </form>
          </section>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionEyebrow}>Queued</div>
              <h2 style={styles.sectionTitle}>What will start next</h2>
            </div>
            <div style={styles.sectionHint}>The queue stays ordered so Start next task is predictable.</div>
          </div>

          {queuedTasks.length === 0 ? (
            <EmptyState title="No queued work" copy="The queue is empty. Add a task below when you want the next wave lined up." />
          ) : null}
          <div style={styles.taskGrid}>
            {queuedTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                ownerLabel={agentById[task.owner_id]?.name || task.owner_id}
                actionsDisabled={submitting}
                onComplete={handleCompleteTask}
              />
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.sectionEyebrow}>Completed</div>
              <h2 style={styles.sectionTitle}>Completed jobs</h2>
            </div>
            <div style={styles.sectionHint}>A compact delivery log for what already landed.</div>
          </div>

          {completedTasks.length === 0 ? (
            <EmptyState title="No completed jobs yet" copy="Completed work will appear here after tasks are closed." />
          ) : null}
          <div style={styles.completedGrid}>
            {completedTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                ownerLabel={agentById[task.owner_id]?.name || task.owner_id}
                actionsDisabled={submitting}
                onComplete={handleCompleteTask}
                variant="compact"
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

const card = {
  background: 'rgba(255,255,255,0.84)',
  border: '1px solid rgba(15,23,42,0.08)',
  borderRadius: 28,
  boxShadow: '0 20px 46px rgba(15,23,42,0.07)',
  backdropFilter: 'blur(18px)',
}

const fieldBase = {
  width: '100%',
  border: '1px solid rgba(15,23,42,0.08)',
  borderRadius: 18,
  background: 'rgba(246,248,251,0.92)',
  color: 'var(--text)',
  padding: '15px 16px',
  fontFamily: 'var(--font-body)',
  fontSize: '0.96rem',
  lineHeight: 1.5,
  outline: 'none',
  boxSizing: 'border-box',
}

const styles = {
  page: {
    minHeight: '100vh',
    background: `
      radial-gradient(circle at top left, rgba(109,141,247,0.08), transparent 28%),
      radial-gradient(circle at top right, rgba(42,184,163,0.06), transparent 24%),
      linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)
    `,
  },
  shell: {
    width: '100%',
    maxWidth: 1220,
    margin: '0 auto',
    padding: '104px 18px 72px',
    boxSizing: 'border-box',
  },
  topBand: {
    display: 'grid',
    gridTemplateColumns: '1.15fr 0.85fr',
    gap: 16,
    marginBottom: 18,
  },
  introCard: {
    ...card,
    padding: '36px 34px',
  },
  introHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.68rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 14,
  },
  exitAdminButton: {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.82)',
    color: 'var(--text)',
    padding: '10px 14px',
    fontFamily: 'var(--font-display)',
    fontSize: '0.86rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2.35rem, 4vw, 4.2rem)',
    lineHeight: 0.96,
    letterSpacing: '-0.06em',
    maxWidth: 720,
  },
  copy: {
    marginTop: 18,
    color: 'var(--text-dim)',
    lineHeight: 1.75,
    fontSize: '1rem',
    maxWidth: 720,
  },
  purposeList: {
    marginTop: 24,
    display: 'grid',
    gap: 10,
  },
  purposeItem: {
    color: 'var(--text-dim)',
    lineHeight: 1.68,
  },
  statusCard: {
    ...card,
    padding: '28px 28px 30px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  statusHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  statusValue: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.95rem',
    fontWeight: 700,
    letterSpacing: '-0.04em',
    textTransform: 'capitalize',
    lineHeight: 1,
  },
  statusMessage: {
    marginTop: 18,
    color: 'var(--text-dim)',
    lineHeight: 1.68,
  },
  controlsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  statusMetaGrid: {
    marginTop: 22,
    paddingTop: 18,
    borderTop: '1px solid rgba(15,23,42,0.08)',
    display: 'grid',
    gap: 14,
  },
  errorBanner: {
    ...card,
    marginBottom: 18,
    padding: '18px 20px',
    borderColor: 'rgba(226,85,85,0.14)',
    background: 'rgba(255,244,244,0.90)',
  },
  errorTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    marginBottom: 4,
    color: 'var(--red)',
  },
  errorCopy: {
    color: 'var(--text-dim)',
  },
  section: {
    ...card,
    padding: '24px 24px 26px',
    marginBottom: 18,
  },
  sectionCard: {
    ...card,
    padding: '24px 24px 26px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  sectionEyebrow: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.66rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 8,
  },
  sectionTitle: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: '1.35rem',
    fontWeight: 700,
    letterSpacing: '-0.03em',
  },
  sectionHint: {
    color: 'var(--text-faint)',
    fontSize: '0.88rem',
    lineHeight: 1.55,
    maxWidth: 280,
    textAlign: 'right',
  },
  sectionHelp: {
    marginTop: 6,
    marginBottom: 16,
    color: 'var(--text-dim)',
    lineHeight: 1.65,
    fontSize: '0.92rem',
  },
  agentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 14,
  },
  agentCard: {
    borderRadius: 22,
    border: '1px solid rgba(15,23,42,0.06)',
    background: 'rgba(246,248,251,0.90)',
    padding: '18px 18px 20px',
  },
  agentCardWorking: {
    borderColor: 'rgba(42,184,163,0.18)',
    background: 'linear-gradient(180deg, rgba(242,255,251,0.94), rgba(246,248,251,0.94))',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65)',
  },
  agentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  agentName: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.05rem',
    fontWeight: 700,
  },
  agentRole: {
    marginTop: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  agentLabel: {
    marginTop: 16,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  agentCurrentTask: {
    marginTop: 8,
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    fontWeight: 700,
    lineHeight: 1.35,
  },
  agentCurrentCopy: {
    marginTop: 8,
    color: 'var(--text-dim)',
    lineHeight: 1.65,
    fontSize: '0.92rem',
  },
  agentMetaRow: {
    marginTop: 16,
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 12,
  },
  taskStack: {
    display: 'grid',
    gap: 14,
  },
  taskGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
  },
  completedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 12,
  },
  taskCard: {
    borderRadius: 22,
    border: '1px solid rgba(15,23,42,0.06)',
    background: 'rgba(246,248,251,0.90)',
    padding: '18px 18px 20px',
  },
  taskCardCompact: {
    background: 'rgba(248,250,252,0.88)',
  },
  taskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  taskTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1rem',
    fontWeight: 700,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  taskMeta: {
    marginTop: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  taskDescription: {
    marginTop: 14,
    color: 'var(--text-dim)',
    lineHeight: 1.68,
    fontSize: '0.92rem',
  },
  taskFacts: {
    marginTop: 16,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
  },
  taskOutcome: {
    marginTop: 14,
    padding: '12px 14px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.74)',
    border: '1px solid rgba(15,23,42,0.06)',
    color: 'var(--text-dim)',
    lineHeight: 1.6,
    fontSize: '0.9rem',
  },
  pill: {
    borderRadius: 999,
    border: '1px solid',
    padding: '6px 10px',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.62rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  metaLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.6rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: 6,
  },
  metaValue: {
    color: 'var(--text-dim)',
    lineHeight: 1.55,
    fontSize: '0.9rem',
    overflowWrap: 'anywhere',
  },
  managementGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 16,
    marginBottom: 18,
  },
  formStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  input: {
    ...fieldBase,
  },
  textarea: {
    ...fieldBase,
    resize: 'vertical',
    minHeight: 120,
  },
  primaryButton: {
    border: 'none',
    borderRadius: 999,
    background: 'var(--btn-primary-bg)',
    color: '#fff',
    padding: '13px 18px',
    fontFamily: 'var(--font-display)',
    fontSize: '0.9rem',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 12px 28px rgba(17,24,39,0.10)',
  },
  secondaryButton: {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.82)',
    color: 'var(--text)',
    padding: '13px 16px',
    fontFamily: 'var(--font-display)',
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  smallButton: {
    marginTop: 16,
  },
  emptyState: {
    borderRadius: 22,
    border: '1px dashed rgba(148,163,184,0.26)',
    background: 'rgba(248,250,252,0.78)',
    padding: '18px 18px 20px',
  },
  emptyTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    marginBottom: 6,
  },
  emptyCopy: {
    color: 'var(--text-dim)',
    lineHeight: 1.62,
    fontSize: '0.92rem',
  },
}
