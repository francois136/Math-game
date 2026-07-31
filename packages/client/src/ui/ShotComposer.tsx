import { useId } from 'react';
import type { Direction } from '@fw/contracts';
import type { Preview } from '../preview.js';

interface Props {
  readonly source: string;
  readonly direction: Direction;
  readonly preview: Preview;
  readonly previewEnabled: boolean;
  readonly disabled: boolean;
  readonly validation: { ok: boolean; message: string | null } | null;
  readonly onSource: (source: string) => void;
  readonly onDirection: (direction: Direction) => void;
  readonly onPreviewEnabled: (enabled: boolean) => void;
  readonly onValidate: () => void;
  readonly onFire: () => void;
  readonly onPass: () => void;
}

export function ShotComposer(props: Props): React.JSX.Element {
  const fieldId = useId();
  const toggleId = useId();

  return (
    <section className="composeur">
      <label className="etiquette" htmlFor={fieldId}>
        f(x) =
      </label>
      <input
        id={fieldId}
        data-testid="fonction"
        className="saisie"
        value={props.source}
        placeholder="3*sin(x/4)"
        autoComplete="off"
        spellCheck={false}
        disabled={props.disabled}
        onChange={(event) => {
          props.onSource(event.target.value);
        }}
      />

      <div className="rangee">
        <div className="sens" role="group" aria-label="Sens du tir">
          <button
            type="button"
            data-testid="sens-croissant"
            className={props.direction === 'increasing' ? 'actif' : ''}
            disabled={props.disabled}
            onClick={() => {
              props.onDirection('increasing');
            }}
          >
            → x croissants
          </button>
          <button
            type="button"
            data-testid="sens-decroissant"
            className={props.direction === 'decreasing' ? 'actif' : ''}
            disabled={props.disabled}
            onClick={() => {
              props.onDirection('decreasing');
            }}
          >
            ← x décroissants
          </button>
        </div>

        <label className="bascule" htmlFor={toggleId}>
          <input
            id={toggleId}
            data-testid="bascule-previsualisation"
            type="checkbox"
            checked={props.previewEnabled}
            onChange={(event) => {
              props.onPreviewEnabled(event.target.checked);
            }}
          />
          Prévisualiser la courbe
        </label>
      </div>

      <p className="aide" data-testid="etat-previsualisation">
        {previewMessage(props.preview)}
      </p>

      {props.validation !== null && (
        <p className={props.validation.ok ? 'verdict ok' : 'verdict refus'} data-testid="verdict">
          {props.validation.ok
            ? 'Fonction acceptée : elle est continue là où elle serait tracée.'
            : (props.validation.message ?? 'Fonction refusée.')}
        </p>
      )}

      <div className="rangee">
        <button
          type="button"
          data-testid="verifier"
          disabled={props.disabled}
          onClick={props.onValidate}
        >
          Vérifier
        </button>
        <button
          type="button"
          data-testid="tirer"
          className="primaire"
          disabled={props.disabled}
          onClick={props.onFire}
        >
          Tirer
        </button>
        <button type="button" data-testid="passer" disabled={props.disabled} onClick={props.onPass}>
          Passer
        </button>
      </div>
    </section>
  );
}

function previewMessage(preview: Preview): string {
  switch (preview.kind) {
    case 'off':
      return 'Prévisualisation désactivée.';
    case 'empty':
      return 'Écris une fonction pour la voir se dessiner.';
    case 'invalid':
      return preview.message;
    case 'curve':
      return 'Le trait pointillé montre la forme de ta courbe — pas où elle s’arrêtera.';
  }
}
