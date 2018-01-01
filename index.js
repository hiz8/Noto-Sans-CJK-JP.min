const fs        = require('fs');
const Fontmin   = require('fontmin');
const ttf2woff2 = require('gulp-ttf2woff2');
const rename    = require('gulp-rename');

const conifg = {
    lettersPath: './Letters/',
    input: 'src/*.otf',
    output: 'build/fonts'
}

const build = () => {
    return new Promise((resolve, reject) => {
        fs.readdir(conifg.lettersPath, function(err, items) {
            if (err) reject(err);

            let test = '';
            let num = 0;

            items.forEach((element, index) => {
                let filename = conifg.lettersPath + element;

                fs.readFile(filename, 'utf-8', (err, data) => {
                    test += data;
                    num++;

                    if (num === items.length) {
                        resolve(test);
                    }
                });
            });
            
        });
    }).then(test => {
        const fontmin = new Fontmin()
            .src(conifg.input)
            .use(Fontmin.otf2ttf())
            .use(Fontmin.glyph({ 
                text: test
            }))
            .use(Fontmin.ttf2woff({
                deflate: true
            }))
            .use(ttf2woff2({
                clone: true
            }))
            .use(rename({
                suffix: '.min'
            }))
            .dest(conifg.output);

        fontmin.run((err, files) => {
            if (err) reject(err);

            console.log(files[0]);
        });
    }).catch(err => {
        throw err;
    });;
};

module.exports = build();