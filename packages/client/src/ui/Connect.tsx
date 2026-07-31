import { useState } from 'react';

interface Props {
  readonly onCreate: (name: string) => void;
  readonly onJoin: (name: string, code: string) => void;
}

export function Connect({ onCreate, onJoin }: Props): React.JSX.Element {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  return (
    <section className="accueil">
      <h1>FunctionWars</h1>
      <p className="aide">
        Écris une fonction, choisis un sens, et regarde ta courbe partir. Si elle traverse
        quelqu’un, il disparaît.
      </p>

      <label className="etiquette" htmlFor="pseudo">
        Ton pseudo
      </label>
      <input
        id="pseudo"
        data-testid="pseudo"
        className="saisie"
        value={name}
        maxLength={24}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />

      <div className="rangee">
        <button
          type="button"
          data-testid="creer"
          className="primaire"
          disabled={name.trim() === ''}
          onClick={() => {
            onCreate(name.trim());
          }}
        >
          Créer un salon
        </button>
      </div>

      <label className="etiquette" htmlFor="code">
        …ou rejoindre avec un code
      </label>
      <div className="rangee">
        <input
          id="code"
          data-testid="code"
          className="saisie court"
          value={code}
          maxLength={6}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
          }}
        />
        <button
          type="button"
          data-testid="rejoindre"
          disabled={name.trim() === '' || code.length !== 6}
          onClick={() => {
            onJoin(name.trim(), code);
          }}
        >
          Rejoindre
        </button>
      </div>
    </section>
  );
}
