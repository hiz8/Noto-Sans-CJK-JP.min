const fs = require('fs');
const exec = require('child_process').execSync;

const config = {
  lettersPath: './Letters/',
  inputPath: './src/',
  outputPath: './dist/',
};

async function genTextsFromFile() {
  const textDir = await fs.promises
    .readdir(config.lettersPath)
    .catch(err => console.error(err));
  let letters = '';
  let num = 0;

  for (let i = 0; i < textDir.length; i++) {
    const textFile = textDir[i];
    let textFilePath = config.lettersPath + textFile;

    const letter = await fs.promises
      .readFile(textFilePath, 'utf-8')
      .catch(err => console.error(err));

    letters += letter;
    num++;

    if (num === textDir.length) {
      return letters;
    }
  }
}

async function getSrcFonts() {
  const inputDir = await fs.promises
    .readdir(config.inputPath)
    .catch(err => console.error(err));

  return inputDir.filter(fontFile => {
    return (
      fs.statSync(config.inputPath + fontFile).isFile() &&
      /.*\.otf$/.test(fontFile)
    );
  });
}

const subset = async () => {
  const [text, srcFonts] = await Promise.all([
    genTextsFromFile(),
    getSrcFonts(),
  ]);
  const tmpTextFile = 'tmpTextFile.txt';

  await fs.promises
    .writeFile(tmpTextFile, text)
    .catch(err => console.error(err));

  if (!fs.existsSync(config.outputPath)) {
    fs.mkdirSync(config.outputPath);
  }

  srcFonts.forEach((fontFile, fontIndex) => {
    const reg = /(.*)(?:\.([^.]+$))/;
    const fontName = fontFile.match(reg)[1];

    const extensions = ['ttf', 'woff', 'woff2'];

    extensions.forEach((ext, extIndex) => {
      const flavorOpt =
        ext === 'woff' || ext === 'woff2' ? `--flavor=${ext}` : '';
      const command = `pyftsubset ./${
        config.inputPath
      }${fontFile} --text-file=./${tmpTextFile} --layout-features='palt' --output-file=./${
        config.outputPath
      }${fontName}.min.${ext} --no-hinting ${flavorOpt}`;

      try {
        exec(command);
      } catch (e) {
        console.error(err);
      } finally {
        if (
          fontIndex + 1 >= srcFonts.length &&
          extIndex + 1 >= extensions.length
        ) {
          fs.unlink(tmpTextFile, err => {
            if (err) throw err;
          });
        }
      }
    });
  });
};

module.exports = subset();
