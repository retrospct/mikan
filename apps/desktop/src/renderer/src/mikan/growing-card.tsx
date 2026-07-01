// growing-card.tsx — Group 07: the growing card, the atomic unit of the task
// lifecycle everywhere else renders (Today's stack, the expanded workspace, Auto
// mode). One pixel-stable header (avatar · title · orb) over a body that morphs
// through six render states as `Task.state` advances; the orb is the whole
// state machine — it fills as `Task.steps` complete, then flips to a check.
// Mock-driven shell: reads only contract types, no `window.api` dependency.
import type { JSX } from 'react'
import { NIcon } from './icons'
import { Dots, MikanSay } from './mark'
import type { PlanStep, RunReceipt, Task, TaskState } from '@mikan/contract/views'

export type CardRenderState =
  'collapsed' | 'searching' | 'running' | 'reasoning' | 'summary' | 'complete'

// Positional mapping onto the six-state lifecycle (CONTEXT.md § Group 07): each
// `TaskState` has exactly one visual mechanism, in the same order the states occur.
const RENDER_STATE_BY_TASK_STATE: Record<TaskState, CardRenderState> = {
  listed: 'collapsed',
  planning: 'searching',
  planned: 'running',
  working: 'reasoning',
  awaiting: 'summary',
  done: 'complete'
}

/** `Task.state` is optional during the additive S0 rollout — absence reads as `listed`. */
function renderStateFor(task: Task): CardRenderState {
  return RENDER_STATE_BY_TASK_STATE[task.state ?? 'listed']
}

function stepFill(steps: PlanStep[] | undefined): number {
  if (!steps || steps.length === 0) return 0
  return steps.filter((s) => s.status === 'done').length / steps.length
}

function receiptLine(receipt: RunReceipt | undefined): string {
  if (!receipt) return 'Done — nice work.'
  const where = receipt.ranOnDevice ? 'on device' : 'in the cloud'
  const sent = receipt.sentAnything ? 'sent' : 'nothing sent yet'
  return `Ran ${where} · ${sent}.`
}

const ORB_R = 8
const ORB_C = 2 * Math.PI * ORB_R

function GrowingOrb({
  renderState,
  steps
}: {
  renderState: CardRenderState
  steps: PlanStep[] | undefined
}): JSX.Element {
  const complete = renderState === 'complete'
  const fill = stepFill(steps)
  return (
    <span
      className={'gcard-orb state-' + renderState + (complete ? ' done' : '')}
      aria-hidden="true"
    >
      {complete ? (
        <NIcon name="check" size={12} stroke={2.4} />
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20">
          <circle className="gcard-orb-track" cx="10" cy="10" r={ORB_R} />
          <circle
            className="gcard-orb-ring"
            cx="10"
            cy="10"
            r={ORB_R}
            style={{ strokeDasharray: ORB_C, strokeDashoffset: ORB_C * (1 - fill) }}
          />
        </svg>
      )}
    </span>
  )
}

/** Exported so other Group-02 surfaces (the task workspace's reasoning card and
 * guided stepper) render the same step-row look instead of duplicating it. */
export function StepRow({ step }: { step: PlanStep }): JSX.Element {
  return (
    <div className={'gcard-step status-' + step.status}>
      <span className="gcard-step-ico">
        {step.status === 'done' ? (
          <NIcon name="check" size={11} />
        ) : step.status === 'blocked' ? (
          <NIcon name="close" size={10} />
        ) : (
          <span className="gcard-step-dot" />
        )}
      </span>
      <span className="gcard-step-t">{step.title}</span>
      {step.tool && <span className="gcard-step-tool">{step.tool}</span>}
      <span className="gcard-step-run">{step.run === 'auto' ? 'Auto' : 'Ask'}</span>
    </div>
  )
}

export function GrowingCard({
  task,
  onOpen,
  onSaveSkill
}: {
  task: Task
  onOpen?: () => void
  /** "Save as a skill" — offered on a good run (complete state only). */
  onSaveSkill?: () => void
}): JSX.Element {
  const renderState = renderStateFor(task)
  const steps = task.steps
  const runningStep = steps?.find((s) => s.status === 'running')

  return (
    <div
      className="gcard"
      data-render={renderState}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
    >
      <div className="gcard-hd">
        <span className="gcard-avatar" aria-hidden="true">
          <NIcon name="spark" size={13} />
        </span>
        <span className="gcard-title">{task.title}</span>
        <GrowingOrb renderState={renderState} steps={steps} />
      </div>

      <div className="gcard-body">
        {renderState === 'searching' && (
          <div className="gcard-searching">
            <MikanSay state="thinking" size={18}>
              Searching your memory
              <Dots />
            </MikanSay>
          </div>
        )}

        {(renderState === 'running' || renderState === 'reasoning') && (
          <div className="gcard-steps">
            {steps && steps.length > 0 ? (
              steps.map((s) => <StepRow key={s.id} step={s} />)
            ) : (
              <div className="gcard-empty">The plan is still coming together.</div>
            )}
            {renderState === 'reasoning' && runningStep && (
              <div className="gcard-reasoning">
                <MikanSay state="gathering" size={16}>
                  {runningStep.title}
                  <Dots />
                </MikanSay>
              </div>
            )}
          </div>
        )}

        {renderState === 'summary' && (
          <div className="gcard-gate">
            <div className="gcard-gate-t">Nothing sent yet — review and approve.</div>
            <div className="gcard-gate-acts">
              <button className="btn btn-sm" onClick={(e) => e.stopPropagation()}>
                Iterate
              </button>
              <button className="btn primary btn-sm" onClick={(e) => e.stopPropagation()}>
                Approve
              </button>
            </div>
          </div>
        )}

        {renderState === 'complete' && (
          <div className="gcard-complete">
            <div className="gcard-receipt">{receiptLine(task.receipt)}</div>
            <button
              className="gcard-save"
              onClick={(e) => {
                e.stopPropagation()
                onSaveSkill?.()
              }}
            >
              <NIcon name="bolt" size={13} /> Save as a skill
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
