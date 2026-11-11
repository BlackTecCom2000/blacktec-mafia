import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Action, LogEntry } from '../game/types';
import type { GameView } from '../game/view';
import { logText, useI18n } from '../i18n';
import { SendIcon } from './icons';

function tone(code: string): string {
  if (code.includes('killed') || code.includes('executed') || code.includes('win.')) return 'blood';
  if (code.includes('voted') || code.includes('abstained')) return 'steel';
  if (code.startsWith('log.')) return 'brass';
  if (code.startsWith('bot.')) return 'bot';
  return 'plain';
}

export function LogPanel({
  view,
  chatEnabled,
  chatPlaceholder,
  onAction,
}: {
  view: GameView;
  chatEnabled: boolean;
  chatPlaceholder: string;
  onAction: (action: Action) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'log' | 'chat'>('log');
  const [text, setText] = useState('');
  const feedRef = useRef<HTMLDivElement | null>(null);

  const chatEntries = view.log.filter(
    (entry) => entry.code === 'chat.entry' || entry.code.startsWith('bot.'),
  );

  useEffect(() => {
    const node = feedRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [view.log.length, tab]);

  const speaker = (entry: LogEntry): string => {
    if (entry.code === 'chat.entry') return String(entry.params?.name ?? '');
    if (entry.actorId) {
      return view.players.find((player) => player.id === entry.actorId)?.name ?? '';
    }
    return '';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || !chatEnabled) return;
    onAction({ type: 'chat', text: clean.slice(0, 180) });
    setText('');
  };

  return (
    <section className="logpanel" aria-label={t('table.log')}>
      <div className="logpanel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'log'}
          className={tab === 'log' ? 'logtab is-active' : 'logtab'}
          onClick={() => setTab('log')}
        >
          {t('table.log')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chat'}
          className={tab === 'chat' ? 'logtab is-active' : 'logtab'}
          onClick={() => setTab('chat')}
        >
          {t('table.chat')}
          {chatEntries.length > 0 ? <span className="logtab__count">{chatEntries.length}</span> : null}
        </button>
      </div>

      <div className="logpanel__feed" ref={feedRef}>
        {tab === 'log' ? (
          view.log.length === 0 ? (
            <p className="logpanel__empty">{t('table.logEmpty')}</p>
          ) : (
            <ol className="log" aria-live="polite">
              {view.log.map((entry) => (
                <li key={entry.id} className={`logline logline--${tone(entry.code)}`}>
                  <span className="logline__mark" aria-hidden="true" />
                  <span className="logline__text">
                    {entry.text ? (
                      <>
                        <strong>{speaker(entry)}:</strong> {entry.text}
                      </>
                    ) : (
                      logText(t, entry.code, entry.params)
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )
        ) : chatEntries.length === 0 ? (
          <p className="logpanel__empty">{t('table.logEmpty')}</p>
        ) : (
          <ol className="chatfeed" aria-live="polite">
            {chatEntries.map((entry) => (
              <li key={entry.id} className="chatline">
                <span className="chatline__name">{speaker(entry)}</span>
                <span className="chatline__text">
                  {entry.text ? entry.text : logText(t, entry.code, entry.params)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form className="chatbox" onSubmit={submit}>
        <input
          className="chatbox__input"
          value={text}
          maxLength={180}
          disabled={!chatEnabled}
          placeholder={chatEnabled ? t('table.chatPlaceholder') : chatPlaceholder}
          aria-label={t('aria.chat')}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="submit"
          className="chatbox__send"
          disabled={!chatEnabled || text.trim().length === 0}
          aria-label={t('table.chatSend')}
        >
          <SendIcon size={18} />
        </button>
      </form>
    </section>
  );
}
