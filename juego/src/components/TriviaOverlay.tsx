import React, { useEffect, useRef, useState } from 'react';
import { Lightbulb, Zap } from 'lucide-react';
import { POWERUP_INFO } from '../game/upgradesAndTrivia';
import type { PowerUpType, TriviaQuestion } from '../game/types';

interface TriviaOverlayProps {
  question: TriviaQuestion | null;
  onResolve: (correct: boolean, powerUp: PowerUpType | null) => void;
}

const TIME_LIMIT = 8;

export const TriviaOverlay: React.FC<TriviaOverlayProps> = React.memo(({ question, onResolve }) => {
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const resolveTimerRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  const scheduleResolve = (isCorrect: boolean, powerUp: PowerUpType | null, delayMs: number) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    resolveTimerRef.current = window.setTimeout(() => {
      resolveTimerRef.current = null;
      onResolveRef.current(isCorrect, powerUp);
    }, delayMs);
  };

  useEffect(() => {
    if (!question) return;
    setTimeLeft(TIME_LIMIT);
    setSelectedIdx(null);
    resolvedRef.current = false;

    if (resolveTimerRef.current !== null) {
      window.clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => {
      window.clearInterval(interval);
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
    };
  }, [question]);

  useEffect(() => {
    if (!question || resolvedRef.current) return;
    if (timeLeft <= 0 && selectedIdx === null) {
      setSelectedIdx(-1);
      scheduleResolve(false, null, 750);
    }
  }, [timeLeft, selectedIdx, question]);

  const pickOption = (idx: number) => {
    if (!question || selectedIdx !== null || resolvedRef.current) return;
    setSelectedIdx(idx);
    const isCorrect = idx === question.correctIndex;
    scheduleResolve(isCorrect, isCorrect ? question.rewardPowerUp : null, 750);
  };

  useEffect(() => {
    if (!question) return;
    const onKey = (e: KeyboardEvent) => {
      if (selectedIdx !== null || resolvedRef.current) return;
      if (e.code === 'Digit1') pickOption(0);
      if (e.code === 'Digit2') pickOption(1);
      if (e.code === 'Digit3') pickOption(2);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, selectedIdx]);

  if (!question) return null;

  const pct = Math.max(0, Math.min(100, (timeLeft / TIME_LIMIT) * 100));
  const powerInfo = POWERUP_INFO[question.rewardPowerUp];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#091638]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Pregunta relámpago de cultura general"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border-2 border-zinc-950 bg-[#FAF9F6] text-zinc-900 shadow-[6px_6px_0px_#09090B]">
        {/* Top Metadata Row */}
        <div className="border-b-2 border-zinc-950 bg-[#0D2252] px-5 py-3.5 text-white">
          <div className="flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-1.5 text-[#FACC15]">
              <Lightbulb className="h-4 w-4" />
              <span>Cultura General · {question.category}</span>
            </div>
            <span className="font-mono tabular-nums text-amber-200">
              {Math.ceil(timeLeft)}s
            </span>
          </div>

          {/* Countdown bar */}
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-sm bg-[#1B4298]">
            <div
              className="h-full bg-[#FACC15] transition-[width] duration-100"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {/* Reward Preview */}
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0D2252]">
            <Zap className="h-4 w-4 text-amber-600" />
            <span>
              Recompensa por acertar: <strong>{powerInfo.title}</strong> + 25 Monedas
            </span>
          </div>

        {/* Question */}
        <h3
          className="mt-3 text-lg font-extrabold leading-snug text-zinc-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {question.question}
        </h3>

        {/* 3 Options */}
        <div className="mt-5 flex flex-col gap-2.5">
          {question.options.map((opt, idx) => {
            const isChosen = selectedIdx === idx;
            const isCorrect = idx === question.correctIndex;
            let stateClasses =
              'border-zinc-900 bg-white hover:bg-zinc-50 text-zinc-900 shadow-[3px_3px_0px_#18181B]';

            if (selectedIdx !== null) {
              if (isCorrect) {
                stateClasses = 'border-emerald-700 bg-emerald-100 text-emerald-950';
              } else if (isChosen) {
                stateClasses = 'border-red-700 bg-red-100 text-red-950';
              } else {
                stateClasses = 'border-zinc-300 bg-zinc-100 text-zinc-500';
              }
            }

            return (
              <button
                key={opt}
                type="button"
                disabled={selectedIdx !== null}
                onClick={() => pickOption(idx)}
                className={`flex min-h-[46px] items-center gap-3 rounded-lg border-2 px-4 py-2.5 text-left text-sm font-bold transition-transform active:translate-y-0.5 ${stateClasses}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-zinc-900/30 bg-zinc-100 font-mono text-xs text-zinc-800">
                  {idx + 1}
                </span>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>

        {selectedIdx !== null && (
          <p className="mt-4 text-center text-xs font-bold text-zinc-700">
            {selectedIdx === question.correctIndex
              ? `¡Correcto! Activando ${powerInfo.title} y +25 Monedas.`
              : `Tiempo o fallo. La respuesta era: ${question.options[question.correctIndex]}.`}
          </p>
        )}
        </div>
      </div>
    </div>
  );
});
