import {
  BOT_LEVEL_LABELS,
  maxSeatsFor,
  type BotLevel,
  type Difficulty,
  type LobbyState,
  type PlayerId,
} from '@fw/contracts';

const DIFFICULTIES: readonly { value: Difficulty; label: string; hint: string }[] = [
  { value: 'facile', label: 'Facile', hint: 'Une parabole relie toujours deux joueurs.' },
  {
    value: 'moderee',
    label: 'Modérée',
    hint: 'Une fonction continue passe. Laquelle, à toi de voir.',
  },
  { value: 'difficile', label: 'Difficile', hint: 'Une fonction passe, mais aucune parabole.' },
];

const BOT_LEVELS: readonly BotLevel[] = ['debutant', 'confirme', 'redoutable'];

interface Props {
  readonly lobby: LobbyState;
  readonly selfId: string | null;
  readonly onReady: (ready: boolean) => void;
  readonly onDifficulty: (difficulty: Difficulty) => void;
  readonly onAddBot: (level: BotLevel) => void;
  readonly onRemove: (playerId: PlayerId) => void;
  readonly onStart: () => void;
}

export function Lobby({
  lobby,
  selfId,
  onReady,
  onDifficulty,
  onAddBot,
  onRemove,
  onStart,
}: Props): React.JSX.Element {
  const me = lobby.members.find((member) => member.playerId === selfId);
  const isHost = lobby.hostId === selfId;
  const seated = lobby.members.filter((member) => !member.isSpectator);

  // A field of a given difficulty only holds so many seats. Say so here, in the
  // lobby, rather than let the host press Lancer and read an error (ADR 0015).
  const ceiling = maxSeatsFor(lobby.config.map.difficulty);
  const tooMany = seated.length > ceiling;

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
            {member.isBot && <span className="badge">bot</span>}
            {member.isSpectator ? (
              <span className="badge">spectateur</span>
            ) : (
              <span className={member.ready ? 'badge pret' : 'badge'}>
                {member.ready ? 'prêt' : 'pas prêt'}
              </span>
            )}
            {!member.connected && !member.isBot && <span className="badge">déconnecté</span>}
            {isHost && member.playerId !== selfId && (
              <button
                type="button"
                className="discret"
                data-testid={`retirer-${member.playerId}`}
                title={`Retirer ${member.name}`}
                onClick={() => {
                  onRemove(member.playerId);
                }}
              >
                ×
              </button>
            )}
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
      {tooMany && (
        <p className="verdict refus" data-testid="trop-de-joueurs">
          Ce terrain accueille {ceiling} joueurs au plus, et vous êtes {seated.length}. Passez la
          difficulté à « modérée » pour jouer à autant.
        </p>
      )}

      {isHost && (
        <div className="sens" role="group" aria-label="Ajouter un bot">
          {BOT_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              data-testid={`ajouter-bot-${level}`}
              disabled={seated.length >= lobby.config.rules.maxPlayers}
              onClick={() => {
                onAddBot(level);
              }}
            >
              + bot {BOT_LEVEL_LABELS[level].toLowerCase()}
            </button>
          ))}
        </div>
      )}

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
          <button
            type="button"
            data-testid="lancer"
            className="primaire"
            disabled={tooMany}
            onClick={onStart}
          >
            Lancer la partie ({seated.length} joueur{seated.length > 1 ? 's' : ''})
          </button>
        )}
      </div>
    </section>
  );
}
