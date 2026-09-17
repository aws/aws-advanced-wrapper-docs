/**
 * ConfigBuilder — the interactive scenario page.
 *
 * Layout and logic only. Every string comes from content/scenarios.yaml via the
 * generated per-wrapper JSON, so wording is edited in content, never here.
 *
 * The model: each answered option contributes a patch. Patches merge in a fixed
 * order — questions, then derivation rules, then add-ons — into one
 * configuration object that carries provenance for every value. Nothing
 * enumerates whole destinations.
 *
 * Answers are sticky: an answer invalidated by a toggle is kept in state and
 * restored if you switch back, but is reported and excluded from the output
 * until it is valid again.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CodeBlock from '@theme/CodeBlock';
import { emitFiles, renderLines } from './emitters';
import {
  allAnswered,
  blockReason,
  buildConfig,
  condMet,
  decodeState,
  effectiveDeployment,
  encodeState,
  pickOutcome,
  resolveAnswers,
} from './model';
import styles from './styles.module.css';

/* ---------------------------------------------------------------- *
 * Component
 * ---------------------------------------------------------------- */

export default function ConfigBuilder({ data }) {
  const [state, setState] = useState(() => decodeState('', data));
  const [annotate, setAnnotate] = useState(true);
  const [copied, setCopied] = useState(false);
  const L = data.labels;

  // Restore from the URL on mount so a shared link reproduces a configuration.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.length > 1) {
      setState(decodeState(window.location.hash.slice(1), data));
    }
  }, [data]);

  const { active, stale } = useMemo(() => resolveAnswers(data, state), [data, state]);
  const config = useMemo(() => buildConfig(data, state, active), [data, state, active]);

  // Effective database type drives cross-gating: db_type gates the auth and
  // Blue/Green add-ons, while the continuity answer gates db_type. Exposed as
  // `deployment` in the state passed to every gating check.
  const deployment = useMemo(() => effectiveDeployment(data, state, active), [data, state, active]);
  const gate = useMemo(() => ({ ...state, ...active, deployment }), [state, active, deployment]);

  const answeredAll = useMemo(() => allAnswered(data, state, active), [data, state, active]);

  const outcome = pickOutcome(data, active);
  const files = useMemo(() => {
    if (!answeredAll) return [];
    return emitFiles(config, {
      meta: data.meta,
      engine: state.engine,
      arVersion: state.arVersion,
      integration: active.integration,
      deployment,
    });
  }, [answeredAll, config, data.meta, state.engine, state.arVersion, active.integration, deployment]);

  const setAnswer = useCallback((questionId, optionId) => {
    setState((s) => ({ ...s, answers: { ...s.answers, [questionId]: optionId } }));
  }, []);

  const shareLink = useCallback(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}#${encodeState(state)}`;
    window.history.replaceState(null, '', `#${encodeState(state)}`);
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [state]);

  return (
    <div className={styles.builder}>
      {/* ---------- sticky axis strip ---------- */}
      <div className={styles.axisBar}>
        {data.axes
          .filter((axis) => condMet(axis.showIf, gate))
          .map((axis) => (
            <div key={axis.id} className={styles.axis}>
              <span className={styles.axisLabel}>{axis.label}</span>
              <div className={styles.segmented} role="group" aria-label={axis.label}>
                {axis.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={state[axis.id] === option.id ? styles.segOn : styles.seg}
                    aria-pressed={state[axis.id] === option.id}
                    onClick={() => setState((s) => ({ ...s, [axis.id]: option.id }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        <div className={styles.axisSpacer} />
      </div>

      {/* ---------- the big rows ---------- */}
      {(() => {
        let stableNum = 0;
        return data.questions.map((question) => {
          if (!condMet(question.showIf, gate)) return null;
          // Questions with an explicit `number` (e.g. an optional sub-question
          // like "3b") keep that label; the rest auto-number 1, 2, 3… so the
          // stable questions never renumber when an optional one is hidden.
          const label = question.number || String(++stableNum);
          const staleHere = stale.find((s) => s.questionId === question.id);
          return (
          <section key={question.id} className={styles.row}>
            <div className={styles.rowHead}>
              <span className={styles.rowNum}>{label}</span>
              <div>
                <h3 className={styles.rowTitle}>{question.title}</h3>
                {question.body && <p className={styles.body}>{question.body}</p>}
              </div>
            </div>

            {staleHere && (
              <p className={styles.notice}>
                {(L.staleNotice || '').replace('{answer}', staleHere.label)}
                <span className={styles.noticeWhy}> {staleHere.reason}</span>
              </p>
            )}

            <div className={styles.optionList} role="group" aria-label={question.title}>
              {question.options.map((option) => {
                const reason = blockReason(option, gate, data);
                const chosen = active[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={Boolean(reason)}
                    role="radio"
                    aria-checked={chosen}
                    className={[styles.optionItem, chosen ? styles.optionItemOn : '', reason ? styles.optionItemOff : '']
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => !reason && setAnswer(question.id, option.id)}
                  >
                    <span className={styles.checkMark} aria-hidden="true">
                      {chosen ? '✓' : ''}
                    </span>
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>{option.label}</span>
                      {option.hint && <span className={styles.optionHint}>{option.hint}</span>}
                      {reason && <span className={styles.optionBlocked}>{reason}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
        });
      })()}

      {/* ---------- add-ons ---------- */}
      <section className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.rowNumPlus}>+</span>
          <div>
            <h3 className={styles.rowTitle}>{L.addonsHeading}</h3>
            <p className={styles.body}>{L.addonsBody}</p>
          </div>
        </div>

        <div className={styles.addonList}>
          {data.addons.map((addon) => {
            const reason = blockReason(addon, gate, data);

            return (
              <div key={addon.id} className={reason ? styles.addonGroupOff : styles.addonGroup}>
                <div className={styles.addonGroupTitle}>{addon.title}</div>
                {addon.body && <p className={styles.addonBody}>{addon.body}</p>}
                {reason && <p className={styles.addonBlocked}>{reason}</p>}

                {!reason && addon.toggle && (
                  <div className={styles.optionList}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={Boolean(state.addons[addon.id])}
                      className={[styles.optionItem, state.addons[addon.id] ? styles.optionItemOn : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          addons: { ...s.addons, [addon.id]: !s.addons[addon.id] },
                        }))
                      }
                    >
                      <span className={styles.checkMark} aria-hidden="true">
                        {state.addons[addon.id] ? '✓' : ''}
                      </span>
                      <span className={styles.optionText}>
                        <span className={styles.optionLabel}>{addon.label}</span>
                      </span>
                    </button>
                  </div>
                )}

                {!reason && !addon.toggle && (
                  <div className={styles.optionList} role="group" aria-label={addon.title}>
                    {(addon.options || []).map((option) => {
                      const optReason = blockReason(option, gate, data);
                      const selected = state.addons[addon.id];
                      const on = addon.exclusive
                        ? selected === option.id
                        : Boolean(selected?.[option.id]);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role={addon.exclusive ? 'radio' : 'checkbox'}
                          aria-checked={on}
                          disabled={Boolean(optReason)}
                          title={optReason || undefined}
                          className={[styles.optionItem, on ? styles.optionItemOn : '', optReason ? styles.optionItemOff : '']
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() =>
                            !optReason &&
                            setState((s) => ({
                              ...s,
                              addons: {
                                ...s.addons,
                                [addon.id]: addon.exclusive
                                  ? option.id
                                  : { ...(s.addons[addon.id] || {}), [option.id]: !on },
                              },
                            }))
                          }
                        >
                          <span className={styles.checkMark} aria-hidden="true">
                            {on ? '✓' : ''}
                          </span>
                          <span className={styles.optionText}>
                            <span className={styles.optionLabel}>{option.label}</span>
                            {option.hint && <span className={styles.optionHint}>{option.hint}</span>}
                            {optReason && <span className={styles.optionBlocked}>{optReason}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- result ---------- */}
      <section className={styles.result}>
        {!answeredAll ? (
          <>
            <h3 className={styles.resultTitle}>{L.incompleteHeading}</h3>
            <p className={styles.body}>{L.incompleteBody}</p>
          </>
        ) : (
          <>
            <div className={styles.resultHead}>
              <div>
                <div className={styles.resultKicker}>{L.resultHeading}</div>
                <h3 className={styles.resultTitle}>{outcome.title}</h3>
              </div>
              <div className={styles.resultActions}>
                <label className={styles.check}>
                  <input type="checkbox" checked={annotate} onChange={(e) => setAnnotate(e.target.checked)} />
                  <span>{L.annotateLabel}</span>
                </label>
                <button type="button" className={styles.linkBtn} onClick={shareLink}>
                  {copied ? L.copied : L.copyState}
                </button>
              </div>
            </div>

            <p className={styles.description}>{outcome.description}</p>

            {config.assumes.length > 0 && (
              <>
                <h4 className={styles.h4}>{L.assumesHeading}</h4>
                <ul className={styles.list}>
                  {config.assumes.map((entry) => (
                    <li key={entry.text}>{entry.text}</li>
                  ))}
                </ul>
              </>
            )}

            {files.map((file) => (
              <div key={file.name} className={styles.file}>
                <CodeBlock language={file.language} title={file.name}>
                  {renderLines(file.lines, annotate)}
                </CodeBlock>
                {file.caption && <p className={styles.caption}>{file.caption}</p>}
              </div>
            ))}

            {config.plugins.length > 0 && (
              <>
                <h4 className={styles.h4}>{L.pluginsHeading}</h4>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Plugin</th>
                      <th>What it does for you</th>
                      <th>It is here because</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.plugins.map((plugin) => (
                      <tr key={plugin.code}>
                        <td>
                          <code>{plugin.code}</code>
                        </td>
                        <td>{data.pluginRationale[plugin.code]}</td>
                        <td>{plugin.from}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {config.notes.length > 0 && (
              <>
                <h4 className={styles.h4}>{L.notesHeading}</h4>
                <ul className={styles.list}>
                  {config.notes.map((entry) => (
                    <li key={entry.text}>{entry.text}</li>
                  ))}
                </ul>
              </>
            )}

            <h4 className={styles.h4}>{L.trapsHeading}</h4>
            <ul className={styles.list}>
              {config.traps.map((entry) => (
                <li key={entry.text}>{entry.text}</li>
              ))}
              {(data.alwaysTraps || []).map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>

            {config.links.length > 0 && (
              <>
                <h4 className={styles.h4}>{L.linksHeading}</h4>
                <ul className={styles.list}>
                  {config.links.map((id) => (
                    <li key={id}>
                      <a href={data.links[id].url} target="_blank" rel="noopener noreferrer">
                        {data.links[id].label}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
