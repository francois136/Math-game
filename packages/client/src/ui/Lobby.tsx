import type { LobbyState } from '@fw/contracts';

interface Props {
  readonly lobby: LobbyState;
  readonly selfId: string | null;
  readonly onReady: (ready: boolean) => void;
  readonly onStart: () => void;
}

export function Lobby({ lobby, selfId, onReady, onStart }: Props): React.JSX.Element {
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
