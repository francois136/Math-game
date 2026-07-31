import type { Difficulty, LobbyState } from '@fw/contracts';

const DIFFICULTIES: readonly { value: Difficulty; label: string; hint: string }[] = [
  { value: 'facile', label: 'Facile', hint: 'Une parabole relie toujours deux joueurs.' },
  {
    value: 'moderee',
    label: 'Modérée',
    hint: 'Une fonction continue passe. Laquelle, à toi de voir.',
  },
  { value: 'difficile', label: 'Difficile', hint: 'Une fonction passe, mais aucune parabole.' },
];

interface Props {
  readonly lobby: LobbyState;
  readonly selfId: string | null;
  readonly onReady: (ready: boolean) => void;
  readonly onDifficulty: (difficulty: Difficulty) => void;
  readonly onStart: () => void;
}

export function Lobby({ lobby, selfId, onReady, onDifficulty, onStart }: Props): React.JSX.Element {
  const me = lobby.members.find((member) => member.playerId === selfId);
  const isHost = lobby.hostId === selfId;
  const seated = lobby.members.filter((member) => !member.isSpectator);

  return (
    <section className="salon">
      <h2>
        Salon <code data-testid="code-salon">{lobby.code}</code>
      </h2>
      <p className="aide">Donne ce code à qui doit te rejoindre.</p>

      <ul className="membres" data-testid="membres">
        {lobby.members.map((member) => (
          <li key={member.playerId} className={member.connected ? '' : 'absent'}>
            <span className="nom">{member.name}</span>
            {member.playerId === lobby.hostId && <span className="badge">hôte</span>}
            {member.isSpectator ? (
              <span className="badge">spectateur</span>
            ) : (
              <span className={member.ready ? 'badge pret' : 'badge'}>
                {member.ready ? 'prêt' : 'pas prêt'}
              </span>
            )}
            {!member.connected && <span className="badge">déconnecté</span>}
          </li>
        ))}
      </ul>

      <div className="sens" role="group" aria-label="Difficulté du terrain">
        {DIFFICULTIES.map((option) => (
          <button
            key={option.value}
            type="button"
            data-testid={`difficulte-${option.value}`}
            className={lobby.config.map.difficulty === option.value ? 'actif' : ''}
            disabled={!isHost}
            title={option.hint}
            onClick={() => {
              onDifficulty(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="aide" data-testid="aide-difficulte">
        {DIFFICULTIES.find((option) => option.value === lobby.config.map.difficulty)?.hint ?? ''}
      </p>

      <div className="rangee">
        {me !== undefined && !me.isSpectator && (
          <button
            type="button"
            data-testid="pret"
            onClick={() => {
              onReady(!me.ready);
            }}
          >
            {me.ready ? 'Je ne suis plus prêt' : 'Je suis prêt'}
          </button>
        )}
        {isHost && (
          <button type="button" data-testid="lancer" className="primaire" onClick={onStart}>
            Lancer la partie ({seated.length} joueur{seated.length > 1 ? 's' : ''})
          </button>
        )}
      </div>
    </section>
  );
}
