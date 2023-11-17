(async function () {
  const fs = await import('fs');
  const path = await import('path');
  // curl -Lo showdown.js 'https://unpkg.com/showdown/dist/showdown.min.js'
  const showdown = require('./showdown');
  showdown.setFlavor('github');
  const converter = new showdown.Converter({ tables: true, tasklist: true });
  // converter.makeHtml(textBlock) // returns html.

  const data = fs.readFileSync('Cryptography.md', 'utf-8');
  const deckName = 'WGU_D334_Intro_to_Cryptography';
  // const sections = await parsePage(data);
  // console.log(JSON.stringify(sections, null, 2));

  // create Main Deck Name
  await sendToAnki('createDeck', { deck: deckName });
  // Create SubDecks
  for (const { section, cards } of await parsePage(data)) {
    // {section, cards: [{front, back, picture}] }
    // subDeck name remove spaces.
    const sectionName = section.replaceAll(' ', '_').trim();
    // create subDeck name
    await sendToAnki('createDeck', { deck: `${deckName}::${sectionName}` });
    // Create cards in subDeck
    for (const { front, back, picture } of cards) {
      // add content to each card
      await sendToAnki('addNote', {
        note: {
          deckName: `${deckName}::${sectionName}`,
          modelName: 'Basic',
          fields: {
            Front: front,
            Back: back,
          },
          picture,
        },
      });
    }
  }

  // This function sends object to ANKI listening on port 8765.
  async function sendToAnki(action, params = {}) {
    // will return object with result and error field when error.
    try {
      const res = await fetch('http://127.0.0.1:8765', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, version: 1, params }),
      });
      const data = await res.json();
      if (!res.ok) throw 'Fetch failed to get response. Is Anki Connect listening?';
      if (data.error) throw data;
      return data;
    } catch (e) {
      console.log('Error: ', e);
    }
  }

  // START HERE!
  //
  //
  // START Functions
  // separate page into sections.
  async function parsePage(data) {
    // remove first 68 lines
    const dataStr = data.split(/\r?\n/).slice(69).join('\n');
    // separate page into blocks
    const blocks = dataStr.match(/[^#]*/g).filter((line) => line.length > 0);
    // returns object with {section, text} // section is name of subDeck. text is front, back, images for cards.
    const sections = blocks.map((block) => processBlocks(block));
    return sections;
  }
  // Each block is separated by '##'
  // need object with {section, text: [{front, back, picture}]}
  function processBlocks(block) {
    // get and remove section name
    const [s, ...rest] = block.split(/\r?\n/).filter((line) => line.length > 0);
    let section = s?.trim() ?? 'Section';
    // create section blocks
    const sectionBlocks = rest
      .join('\n')
      .match(/[^;]*/g)
      .filter((line) => line.length > 4);
    // console.log(sectionBlocks.length);

    const cards = [];
    // get front, back, image from each section block. Card data.
    sectionBlocks.forEach((cardBlock) => {
      let front = '';
      let back = '';
      const picture = [];

      // Each cardBlock is a Card. Get question and answer.
      // separate first line, due to tables having ':' in them.
      // The first line will be the question. 'rest' will be an array, empty or lines.
      const [firstLine, ...rest] = cardBlock?.trim().split(/\r?\n/);
      // It may have an answer in the line separated by ':'.
      const [question = '', answer = ''] = firstLine?.trim().split(':');
      // Bold question.
      front = '<h2>' + question.replaceAll('*', '')?.trim().replace(/^-/, '')?.trim() + '</h2>';
      // The 'rest' is the backside(answer) of card.
      // 'answer' could be blank or text. If text, then add newline. Then join 'rest' with it.
      const answerBlock = `${answer?.trim() ? answer.trim() + '\n' : ''}${rest?.join('\n') || ''}`;
      // The first line is processed.

      // ANSWER BLOCK STARTS. Could be multiple lines, tables and images.
      let textNoImages = '';
      let lineIsTable = false; // check if previous line was table. Has to be outside loop.
      answerBlock.split(/\r?\n/).forEach((line) => {
        // discard empty lines
        if (line.length < 1) return;
        // IMAGE -check if line is an image.
        if (/.*!\[(.*)\]\((.*)\)/.test(line)) {
          const picPath = line.replace(/.*!\[.*\]\((.*)\)/, '$1');
          const filename = picPath.split('/').pop();
          const newPic = path.join(process.cwd(), 'img', filename);
          // create the picture data.
          picture.push({
            path: newPic,
            filename,
            fields: ['Back'],
          });
          return;
        }
        // no image, process text.
        if (line.trim().startsWith('|')) {
          // if line is a table element, only add newline between it and previous text.
          // if the previous line was a table line, then linIsTable will be true so don't add newline.
          // the showdown markdown -> html will not recognize tables unless it has newline before it.
          textNoImages += `${!lineIsTable ? '\n' : ''}${line.trim()}\n`;
          lineIsTable = true;
        } else {
          textNoImages += line.replace(/^\s{2}/, '').trimEnd() + '\n'; // take out two spaces from each bullet indents.
          lineIsTable = false;
        }
      });
      // Parse md into html with 'Showdown'.
      back = converter.makeHtml(textNoImages);
      cards.push({ front, back, picture });
    });
    // console.log(text);
    return { section, cards };
  }
})();
