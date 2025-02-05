const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

function format_id(id) {
  if (!id) {
    return null;
  }
  let result = '';
  const numbers = id.split('');
  for (let i = 0; i < numbers.length; i++) {
    const number = (Number(numbers[i]) + 1).toString()[0];
    result += number;
  }
  return result;
}

function format_date(date) {
  const months = {
    January: '01',
    February: '02',
    March: '03',
    April: '04',
    May: '05',
    June: '06',
    July: '07',
    August: '08',
    September: '09',
    October: '10',
    November: '11',
    December: '12',
  };

  const parts = date.split(' ');

  let day = Number(parts[0][0]);
  if (day < 10) {
    day = '0' + day;
  }

  const month = months[parts[2]];
  const year = parts[3];
  const result = day + '-' + month + '-' + year;

  return result;
}

(async () => {
  while (true) {
    const games = [];
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    const url = 'https://www.hltv.org/matches';
    await page.goto(url, { waitUntil: 'networkidle2' });
    const liveMatchesSelector = '.liveMatchesContainer .liveMatch-container';

    try {
      await page.waitForSelector(liveMatchesSelector, { timeout: 5000 });

      const matches = await page.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map((el) => {
          const matchLink = el.querySelector('a.match')?.href;
          const status = el.querySelector('.matchTime')?.innerText || 'Unknown';
          const team1Name = el
            .querySelector('.matchTeam:nth-child(1) .matchTeamName')
            ?.innerText.trim();
          const team2Name = el
            .querySelector('.matchTeam:nth-child(2) .matchTeamName')
            ?.innerText.trim();
          const team1Score = el
            .querySelector(
              '.matchTeam:nth-child(1) .matchTeamScore .currentMapScore'
            )
            ?.innerText.trim();
          const team2Score = el
            .querySelector(
              '.matchTeam:nth-child(2) .matchTeamScore .currentMapScore'
            )
            ?.innerText.trim();

          const team1RoundScore = el
            .querySelector('.matchTeam:nth-child(1) .matchTeamScore .mapScore')
            ?.innerText.trim()
            .replace(/[()]/g, '');
          const team2RoundScore = el
            .querySelector('.matchTeam:nth-child(2) .matchTeamScore .mapScore')
            ?.innerText.trim()
            .replace(/[()]/g, '');

          // Extract tournament logo URL
          const tournamentLogo = document
            .querySelector('.matchEventLogoContainer img')
            ?.getAttribute('src');

          return {
            matchLink,
            status,
            team1Score: team1Score || '0',
            team2Score: team2Score || '0',
            team1RoundScore: team1RoundScore || '0',
            team2RoundScore: team2RoundScore || '0',
            tournamentLogo,
          };
        });
      }, liveMatchesSelector);

      if (matches.length === 0) {
        console.log('Şu anda canlı maç yok');
      } else {
        for (const match of matches) {
          if (!match.matchLink) continue;

          const matchId = match.matchLink.split('/')[4];
          let formatted_id = '';
          const matchPage = await browser.newPage();
          await matchPage.goto(match.matchLink, { waitUntil: 'networkidle2' });

          try {
            const matchDetails = await matchPage.evaluate(() => {
              const team1Element = document.querySelector(
                '.team1-gradient .teamName'
              );
              const team2Element = document.querySelector(
                '.team2-gradient .teamName'
              );
              const team1LogoElement = document.querySelector(
                '.team1-gradient img.logo'
              );
              const team2LogoElement = document.querySelector(
                '.team2-gradient img.logo'
              );

              const timeElement = document.querySelector('.timeAndEvent .time');
              const dateElement = document.querySelector('.timeAndEvent .date');
              const tournamentElement = document.querySelector(
                '.timeAndEvent .event a'
              );

              const team1 = team1Element?.innerText || 'Unknown';
              const team2 = team2Element?.innerText || 'Unknown';
              const team1Logo = team1LogoElement?.src || 'Unknown';
              const team2Logo = team2LogoElement?.src || 'Unknown';

              const matchTime = timeElement?.innerText || 'Unknown';
              const matchDate = dateElement?.innerText || 'Unknown';
              const tournamentName = tournamentElement?.innerText || 'Unknown';

              const streams = Array.from(
                document.querySelectorAll('.stream-box')
              ).map((streamBox) => ({
                name:
                  streamBox
                    .querySelector('.stream-box-embed')
                    ?.textContent.trim() || 'Unknown',
                link:
                  streamBox.querySelector('.external-stream a')?.href ||
                  'Unknown',
              }));

              const mapVetoElements = document.querySelectorAll(
                '.standard-box.veto-box .padding div'
              );
              const mapVetoData = Array.from(mapVetoElements)
                .map((el) => el.textContent.trim())
                .filter((text) => text !== '');

              const roundElements = document.querySelectorAll('.mapholder');
              const rounds = Array.from(roundElements)
                .map((round, index) => {
                  const mapName =
                    round.querySelector('.mapname')?.textContent.trim() ||
                    'Unknown';
                  const resultLeft = round.querySelector('.results-left');
                  const resultRight = round.querySelector('.results-right');

                  const team1Name = resultLeft
                    ?.querySelector('.results-teamname')
                    ?.textContent.trim();
                  const team1RoundScore = resultLeft
                    ?.querySelector('.results-team-score')
                    ?.textContent.trim();
                  const team2Name = resultRight
                    ?.querySelector('.results-teamname')
                    ?.textContent.trim();
                  const team2RoundScore = resultRight
                    ?.querySelector('.results-team-score')
                    ?.textContent.trim();

                  const resultLeftClass = resultLeft?.classList.contains('won')
                    ? 'won'
                    : resultLeft?.classList.contains('lost')
                    ? 'lost'
                    : 'tie';
                  const resultRightClass = resultRight?.classList.contains(
                    'won'
                  )
                    ? 'won'
                    : resultRight?.classList.contains('lost')
                    ? 'lost'
                    : 'tie';

                  return {
                    mapName,
                    team1Name,
                    team1RoundScore,
                    team1Result: resultLeftClass,
                    team2Name,
                    team2RoundScore,
                    team2Result: resultRightClass,
                  };
                })
                .filter((round) => round.mapName !== 'Unknown');

              const ctPlayers = [];
              const tPlayers = [];

              const players = document.querySelectorAll('tr.row.player');
              players.forEach((player) => {
                const teamName =
                  player
                    .closest('.team')
                    .querySelector('.teamName')
                    ?.innerText.trim() || 'Unknown Team';
                const name =
                  player.querySelector('.nameCell')?.innerText.trim() ||
                  'Unknown';
                const health =
                  player.querySelector('.hp-text')?.innerText.trim() ||
                  'Unknown';
                const weaponElement = player.querySelector('.weaponCell img');
                const weapon = weaponElement
                  ? weaponElement.src.split('/').pop()
                  : 'No weapon';
                const kills =
                  player.querySelector('.killCell')?.innerText.trim() ||
                  'Unknown';
                const assists =
                  player.querySelector('.assistCell')?.innerText.trim() ||
                  'Unknown';
                const deaths =
                  player.querySelector('.deathCell')?.innerText.trim() ||
                  'Unknown';
                const adr =
                  player.querySelector('.adrCell')?.innerText.trim() ||
                  'Unknown';

                if (player.classList.contains('ctPlayerBg')) {
                  ctPlayers.push({
                    teamName,
                    name,
                    health,
                    weapon,
                    kills,
                    assists,
                    deaths,
                    adr,
                  });
                } else if (player.classList.contains('tPlayerBg')) {
                  tPlayers.push({
                    teamName,
                    name,
                    health,
                    weapon,
                    kills,
                    assists,
                    deaths,
                    adr,
                  });
                }
              });

              return {
                ctPlayers,
                tPlayers,
                team1,
                team2,
                team1Logo,
                team2Logo,
                matchTime,
                matchDate,
                tournamentName,
                streams,
                mapVetoData,
                rounds,
              };
            });

            const results = {
              matchId: matchId || format_id(matchId),
              status: match.status,
              link: match.matchLink,
              game: 'CS:GO',
              team1: matchDetails.team1,
              team2: matchDetails.team2,
              team1Score: match.team1Score,
              team2Score: match.team2Score,
              team1RoundScore: match.team1RoundScore,
              team2RoundScore: match.team2RoundScore,
              tournamentLogo: match.tournamentLogo,
              team1Logo: matchDetails.team1Logo,
              team2Logo: matchDetails.team2Logo,
              matchTime: matchDetails.matchTime,
              matchDate: format_date(matchDetails.matchDate),
              tournamentName: matchDetails.tournamentName,
              streams: matchDetails.streams,
              mapVetoData: matchDetails.mapVetoData,
              rounds: matchDetails.rounds,
              ctPlayers: matchDetails.ctPlayers,
              tPlayers: matchDetails.tPlayers,
            };

            let team1_players = [];
            let team2_players = [];

            let team1_side = '';
            let team2_side = '';

            if (
              results.ctPlayers[0] &&
              results.ctPlayers[0].teamName === results.team1
            ) {
              team1_players = results.ctPlayers.map((current, index) => {
                const player = {
                  ...current,
                };
                player.teamName = undefined;
                delete player.teamName;
                return player;
              });
              team1_side = 'ct';
            }

            if (
              results.tPlayers[0] &&
              results.tPlayers[0].teamName === results.team1
            ) {
              team1_players = results.tPlayers.map((current, index) => {
                const player = {
                  ...current,
                };
                player.teamName = undefined;
                delete player.teamName;
                return player;
              });
              team1_side = 't';
            }

            if (
              results.ctPlayers[0] &&
              results.ctPlayers[0].teamName === results.team2
            ) {
              team2_players = results.ctPlayers.map((current, index) => {
                const player = {
                  ...current,
                };
                player.teamName = undefined;
                delete player.teamName;
                return player;
              });
              team2_side = 'ct';
            }

            if (
              results.tPlayers[0] &&
              results.tPlayers[0].teamName === results.team2
            ) {
              team2_players = results.tPlayers.map((current, index) => {
                const player = {
                  ...current,
                };
                player.teamName = undefined;
                delete player.teamName;
                return player;
              });
              team2_side = 't';
            }

            const game = {
              id: results.matchId,
              game: 'counter-strike2',
              status: 'live',
              date: new Date(results.matchDate).toString(),
              hour: results.matchTime,
              tournament: results.tournamentName,
              tournament_img: results.tournamentLogo,
              teams: [
                {
                  name: results.team1,
                  score: Number(results.team1Score),
                  round: Number(results.team1RoundScore),
                  logo: results.team1Logo || '/favicon.ico',
                  players: team1_players,
                  side: team1_side,
                },
                {
                  name: results.team2,
                  score: Number(results.team2Score),
                  round: Number(results.team2RoundScore),
                  logo: results.team2Logo || '/favicon.ico',
                  players: team2_players,
                  side: team2_side,
                },
              ],
              streams: results.streams || [],
              picks: results.mapVetoData || [],
              rounds: results.rounds.map((current, index) => {
                return {
                  map: current.mapName,
                  winner:
                    current.team1Result === 'won'
                      ? current.team1Name
                      : current.team2Name,

                  teams: [
                    {
                      name: current.team1Name,
                      score: Number(current.team1RoundScore),
                    },
                    {
                      name: current.team2Name,
                      score: Number(current.team2RoundScore),
                    },
                  ],
                };
              }),
            };

            if (game.id && game.date !== 'Invalid Date' && game.hour) {
              games.push(game);
            }
          } catch (error) {
            console.error('Hata oluştu:', error);
          }
        }

        console.log(games);

        axios.put('https://api.fragscore.com/v1/games?status=live', games, {
          headers: {
            'fragscore-key': '123',
          },
        });
      }
    } catch (error) {
      console.log('Şu anda canlı maç yok');

      axios.put('https://api.fragscore.com/v1/games?status=live', [], {
        headers: {
          'fragscore-key': '123',
        },
      });
    }

    await browser.close();
  }
})();
