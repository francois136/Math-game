import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * A match in a browser, against the real server.
 *
 * Two pages, one lobby, one shot. Everything below this test is mocked
 * somewhere; this is the only place where the client, the socket, the server,
 * the rules and the tracer are all the real ones at the same time.
 */

async function identify(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('pseudo').fill(name);
}

/** A lobby of two, both ready, match started. Returns the page whose turn it is. */
async function startedMatch(
  browser: Browser,
): Promise<{ active: Page; idle: Page; close: () => Promise<void> }> {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await identify(host, 'Anne');
  await host.getByTestId('creer').click();
  const code = (await host.getByTestId('code-salon').innerText()).trim();

  await identify(guest, 'Bob');
  await guest.getByTestId('code').fill(code);
  await guest.getByTestId('rejoindre').click();
  await expect(host.getByTestId('membres')).toContainText('Bob');

  await host.getByTestId('pret').click();
  await guest.getByTestId('pret').click();
  await host.getByTestId('lancer').click();
  await expect(host.getByTestId('plateau')).toBeVisible();

  const hostIsActive = (await host.getByTestId('tour').innerText()).includes('À toi');
  return {
    active: hostIsActive ? host : guest,
    idle: hostIsActive ? guest : host,
    close: async () => {
      await hostContext.close();
      await guestContext.close();
    },
  };
}

test('two players meet in a lobby and one of them fires', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await identify(host, 'Anne');
  await host.getByTestId('creer').click();
  const code = (await host.getByTestId('code-salon').innerText()).trim();
  expect(code).toHaveLength(6);

  await identify(guest, 'Bob');
  await guest.getByTestId('code').fill(code);
  await guest.getByTestId('rejoindre').click();
  await expect(guest.getByTestId('membres')).toContainText('Anne');
  await expect(host.getByTestId('membres')).toContainText('Bob');

  await host.getByTestId('pret').click();
  await guest.getByTestId('pret').click();
  await host.getByTestId('lancer').click();

  await expect(host.getByTestId('plateau')).toBeVisible();
  await expect(guest.getByTestId('plateau')).toBeVisible();

  // Exactly one of them is on turn, and the other cannot type.
  const active = (await host.getByTestId('tour').innerText()).includes('À toi') ? host : guest;
  const idle = active === host ? guest : host;
  await expect(idle.getByTestId('fonction')).toBeDisabled();

  await active.getByTestId('fonction').fill('3*sin(x/4)');
  await active.getByTestId('verifier').click();
  await expect(active.getByTestId('verdict')).toContainText('acceptée');

  await active.getByTestId('tirer').click();
  await expect(active.getByTestId('journal')).toContainText('tire');
  await expect(idle.getByTestId('journal')).toContainText('tire');

  await hostContext.close();
  await guestContext.close();
});

test('a discontinuous function is refused, and the turn is still there', async ({ browser }) => {
  const { active, close } = await startedMatch(browser);

  await active.getByTestId('fonction').fill('{ 0 si x < 5 ; 9 sinon }');
  await active.getByTestId('verifier').click();
  await expect(active.getByTestId('verdict')).toContainText('discontinue');

  await active.getByTestId('tirer').click();
  await expect(active.getByTestId('tour')).toContainText('À toi');
  await expect(active.getByTestId('fonction')).toBeEnabled();

  await close();
});

test('the preview can be switched off and on, and is remembered', async ({ browser }) => {
  const { active, close } = await startedMatch(browser);
  const toggle = active.getByTestId('bascule-previsualisation');

  await expect(toggle).toBeChecked();
  await active.getByTestId('fonction').fill('x^2/40');
  await expect(active.getByTestId('etat-previsualisation')).toContainText('pointillé');

  await toggle.uncheck();
  await expect(active.getByTestId('etat-previsualisation')).toContainText('désactivée');

  // A reload resumes the seat — the server holds it — and the setting survives.
  await active.reload();
  await expect(active.getByTestId('plateau')).toBeVisible();
  await expect(active.getByTestId('bascule-previsualisation')).not.toBeChecked();

  await close();
});

test('a shot can be a function of y instead of x', async ({ browser }) => {
  const { active, close } = await startedMatch(browser);

  // The label follows the variable, because `x = f(y)` is not `y = f(x)` with
  // the letters swapped in the player's head (ADR 0013).
  await expect(active.getByTestId('composeur')).toContainText('y = f(x)');
  await active.getByTestId('axe-y').click();
  await expect(active.getByTestId('composeur')).toContainText('x = f(y)');
  await expect(active.getByTestId('sens-croissant')).toContainText('y croissants');

  await active.getByTestId('fonction').fill('4*sin(y/5)');
  await active.getByTestId('verifier').click();
  await expect(active.getByTestId('verdict')).toContainText('acceptée');

  await active.getByTestId('tirer').click();
  await expect(active.getByTestId('journal')).toContainText('tire');

  await close();
});

test('the host chooses how hard the field is', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await identify(host, 'Anne');
  await host.getByTestId('creer').click();
  const code = (await host.getByTestId('code-salon').innerText()).trim();

  await identify(guest, 'Bob');
  await guest.getByTestId('code').fill(code);
  await guest.getByTestId('rejoindre').click();

  await expect(host.getByTestId('aide-difficulte')).toContainText('parabole');
  await host.getByTestId('difficulte-difficile').click();
  await expect(host.getByTestId('aide-difficulte')).toContainText('aucune parabole');
  // Everyone sees the setting, only the host can move it.
  await expect(guest.getByTestId('aide-difficulte')).toContainText('aucune parabole');
  await expect(guest.getByTestId('difficulte-facile')).toBeDisabled();

  await host.getByTestId('pret').click();
  await guest.getByTestId('pret').click();
  await host.getByTestId('lancer').click();
  await expect(host.getByTestId('plateau')).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});

test('an easy field turns away a lobby too big for it', async ({ browser }) => {
  // Six players on `facile` cannot be laid out, and the lobby says so before
  // anyone presses Lancer (ADR 0015).
  const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const [host, ...guests] = pages;
  if (host === undefined) throw new Error('no host');

  await identify(host, 'Anne');
  await host.getByTestId('creer').click();
  const code = (await host.getByTestId('code-salon').innerText()).trim();

  for (const [index, guest] of guests.entries()) {
    await identify(guest, `Joueur ${String(index)}`);
    await guest.getByTestId('code').fill(code);
    await guest.getByTestId('rejoindre').click();
  }
  await expect(host.getByTestId('membres')).toContainText('Joueur 4');

  // Six seated, and `facile` is the default: the warning is up and Lancer is out.
  await expect(host.getByTestId('trop-de-joueurs')).toContainText('5 joueurs au plus');
  await expect(host.getByTestId('lancer')).toBeDisabled();

  // Moving the field to moderate is exactly what the message asks for.
  await host.getByTestId('difficulte-moderee').click();
  await expect(host.getByTestId('trop-de-joueurs')).toHaveCount(0);
  await expect(host.getByTestId('lancer')).toBeEnabled();

  await Promise.all(contexts.map((context) => context.close()));
});

test('a bot takes a seat and plays its own turn', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await identify(page, 'Anne');
  await page.getByTestId('creer').click();
  await page.getByTestId('ajouter-bot-confirme').click();

  await expect(page.getByTestId('membres')).toContainText('Confirmé');
  await expect(page.getByTestId('membres')).toContainText('bot');

  await page.getByTestId('pret').click();
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('plateau')).toBeVisible();

  // Whoever opens, the human ends up on turn: the bot fires by itself.
  const mine = async (): Promise<boolean> =>
    (await page.getByTestId('tour').innerText()).includes('À toi');
  if (!(await mine())) await expect(page.getByTestId('tour')).toContainText('À toi');

  await page.getByTestId('fonction').fill('2*sin(x/3)');
  await page.getByTestId('tirer').click();

  // Two shots in the log: the human's, and the bot's answer.
  await expect(page.getByTestId('journal')).toContainText('Confirmé');
  await expect(page.getByTestId('tour')).toContainText('À toi');

  await context.close();
});

test('a finished match can be downloaded and watched again', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await identify(page, 'Anne');
  await page.getByTestId('creer').click();
  await page.getByTestId('ajouter-bot-redoutable').click();
  await page.getByTestId('pret').click();
  // A fixed seed, because how long a bot takes to win swings wildly: measured
  // between 4 and 108 turns across eight seeds, so an unseeded match makes this
  // test a coin toss. On this one the bot wins on its second shot.
  await page.getByTestId('graine').fill('anne');
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('plateau')).toBeVisible();

  // Pass until the bot wins. Playwright waits for the button to become
  // actionable again, which is exactly "the bot has played and the turn is
  // back" — polling `isDisabled` would read the bot's turn as the end of the
  // match and leave after one pass.
  for (let turn = 0; turn < 20; turn += 1) {
    if ((await page.getByTestId('revoir-rejeu').count()) > 0) break;
    try {
      // Five seconds is generous for a bot turn and short enough that the last
      // pass — the one the finished match will never accept — does not sit
      // here waiting for a button that is disabled for good.
      await page.getByTestId('passer').click({ timeout: 5_000 });
    } catch {
      break; // the match ended while we waited for our turn to come back
    }
  }
  await expect(page.getByTestId('revoir-rejeu')).toBeVisible();

  // The replay is a real file, a few kilobytes of it.
  const download = page.waitForEvent('download');
  await page.getByTestId('telecharger-rejeu').click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('functionwars-');

  // And it can be walked, turn by turn, without the client having an engine.
  await page.getByTestId('revoir-rejeu').click();
  await expect(page.getByTestId('lecteur-rejeu')).toBeVisible();
  await expect(page.getByTestId('rejeu-tour')).toContainText('Position de départ');
  await expect(page.getByTestId('rejeu-precedent')).toBeDisabled();

  await page.getByTestId('rejeu-suivant').click();
  await expect(page.getByTestId('lecteur-rejeu')).toContainText('tour 1 sur');
  await page.getByTestId('rejeu-fin').click();
  await expect(page.getByTestId('rejeu-suivant')).toBeDisabled();

  await page.getByTestId('rejeu-fermer').click();
  await expect(page.getByTestId('lecteur-rejeu')).toHaveCount(0);

  await context.close();
});

test('everyone fires at once when the host says so', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await identify(host, 'Anne');
  await host.getByTestId('creer').click();
  const code = (await host.getByTestId('code-salon').innerText()).trim();

  await identify(guest, 'Bob');
  await guest.getByTestId('code').fill(code);
  await guest.getByTestId('rejoindre').click();

  // `click`, not `check`: the box is driven by the server's answer, so its state
  // does not flip in the same tick — which is the authority model working.
  await host.getByTestId('bascule-simultane').click();
  await expect(host.getByTestId('bascule-simultane')).toBeChecked();
  await expect(guest.getByTestId('aide-simultane')).toContainText('meurent tous les deux');
  await expect(guest.getByTestId('bascule-simultane')).toBeDisabled();

  await host.getByTestId('pret').click();
  await guest.getByTestId('pret').click();
  await host.getByTestId('lancer').click();
  await expect(host.getByTestId('plateau')).toBeVisible();

  // Nobody is waiting for a turn: both can write at once.
  await expect(host.getByTestId('tour')).toContainText('À toi de tirer');
  await expect(guest.getByTestId('tour')).toContainText('À toi de tirer');

  await host.getByTestId('fonction').fill('x/5');
  await host.getByTestId('tirer').click();

  // Anne has answered and now waits for Bob, by name.
  await expect(host.getByTestId('tour')).toContainText('En attente de 1 joueur : Bob');
  await expect(host.getByTestId('fonction')).toBeDisabled();
  await expect(guest.getByTestId('tour')).toContainText('À toi de tirer');

  await guest.getByTestId('fonction').fill('-x/5');
  await guest.getByTestId('tirer').click();

  // The round resolved: both shots are in the log, and the next round is open.
  await expect(host.getByTestId('journal')).toContainText('Anne');
  await expect(host.getByTestId('journal')).toContainText('Bob');

  await hostContext.close();
  await guestContext.close();
});
