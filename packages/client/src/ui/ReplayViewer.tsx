import type { MatchState } from '@fw/contracts';
import { narrateTurn } from '../replayView.js';

interface Props {
  readonly match: MatchState;
  readonly at: number;
  readonly onSeek: (to: number) => void;
  readonly onClose: () => void;
}

export function ReplayViewer({ match, at, onSeek, onClose }: Props): React.JSX.Element {
  const last = match.history.length;

  return (
    <section className="composeur" data-testid="lecteur-rejeu">
      <p className="etiquette">
        Rejeu — tour {at} sur {last}
      </p>

      <div className="rangee">
        <button
          type="button"
          data-testid="rejeu-debut"
          disabled={at === 0}
          onClick={() => {
            onSeek(0);
          }}
        >
          ⏮ début
        </button>
        <button
          type="button"
          data-testid="rejeu-precedent"
          disabled={at === 0}
          onClick={() => {
            onSeek(at - 1);
          }}
        >
          ◀ précédent
        </button>
        <button
          type="button"
          className="primaire"
          data-testid="rejeu-suivant"
          disabled={at >= last}
          onClick={() => {
            onSeek(at + 1);
          }}
        >
          suivant ▶
        </button>
        <button
          type="button"
          data-testid="rejeu-fin"
          disabled={at >= last}
          onClick={() => {
            onSeek(last);
          }}
        >
          fin ⏭
        </button>
        <button type="button" data-testid="rejeu-fermer" onClick={onClose}>
          Fermer
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={last}
        value={at}
        aria-label="Position dans le rejeu"
        data-testid="rejeu-curseur"
        onChange={(event) => {
          onSeek(Number(event.target.value));
        }}
      />

      <p className="aide" data-testid="rejeu-tour">
        {at === 0 ? 'Position de départ.' : narrateTurn(match, at - 1)}
      </p>
    </section>
  );
}
