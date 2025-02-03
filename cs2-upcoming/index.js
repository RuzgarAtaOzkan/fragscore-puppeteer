const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');

puppeteer.use(StealthPlugin());

(async () => {
  while (true) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.goto('https://www.hltv.org/matches', {
      waitUntil: 'networkidle2',
    });

    const matchesByDate = await page.evaluate(() => {
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

      const result = [];
      const upcomingSections = document.querySelectorAll(
        '.upcomingMatchesSection'
      );

      upcomingSections.forEach((section) => {
        let dateHeadline =
          section.querySelector('.matchDayHeadline')?.innerText;
        if (!dateHeadline) return;

        const dateMatch = dateHeadline.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          dateHeadline = dateMatch[0];
        }

        const matches = section.querySelectorAll('.upcomingMatch');
        const matchDetails = [];

        matches.forEach((match) => {
          const matchLink = match.querySelector('a.match')?.href;
          const matchID = matchLink ? matchLink.split('/')[4] : null;

          const team1 =
            match.querySelector('.matchTeams .team1 .matchTeamName')
              ?.innerText || 'TBD';
          const team2 =
            match.querySelector('.matchTeams .team2 .matchTeamName')
              ?.innerText || 'TBD';

          const logo1 = match.querySelector('.team1 img')?.src || null;
          const logo2 = match.querySelector('.team2 img')?.src || null;

          const eventName =
            match.querySelector('.matchEvent .matchEventName')?.innerText ||
            'TBD';
          const matchTime =
            match.querySelector('.matchInfo .matchTime')?.innerText || 'TBD';

          const matchInfoEmpty =
            match.querySelector('.matchInfoEmpty')?.innerText || null;

          const game = {
            id: matchID || format_id(matchID), // Artık burada format_id doğru şekilde erişilebilir
            date: new Date(dateHeadline).toString(),
            hour: matchTime,
            status: 'upcoming',
            game: 'counter-strike2',
            teams: [
              { name: team1, logo: logo1 || '/favicon.ico' },
              { name: team2, logo: logo2 || '/favicon.ico' },
            ],
            tournament: eventName,
            explanation: matchInfoEmpty,
          };

          if (game.id && game.date !== 'Invalid Date' && game.hour) {
            matchDetails.push(game);
          }
        });

        if (matchDetails.length > 0) {
          result.push(...matchDetails);
        }
      });

      return result;
    });

    const res = await axios.put(
      'http://localhost:4001/v1/games?status=upcoming',
      matchesByDate,
      { headers: { 'fragscore-key': '123' } }
    );

    console.log(res.data);

    //console.log(JSON.stringify({ matches: matchesByDate }, null, 2));
    await browser.close();
  }
})();
